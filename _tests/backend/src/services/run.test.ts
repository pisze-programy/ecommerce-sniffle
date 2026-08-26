import { describe, expect, it, vi } from 'vitest';
import { buildProvider, createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord, Provider, ProviderConfig, ProviderModule } from '@ecommerce-sniffle/providers';
import { runGetPipeline } from '../../../../backend/src/services/run.ts';
import type { Env } from '../../../../backend/src/env/types.ts';

import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

function silentLogger(): Logger {
  return createLogger(() => {
    // discard
  });
}

function testEnv(db: D1Like): { env: Env; snitchFetch: ReturnType<typeof vi.fn> } {
  const snitchFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: async () => 'ok',
  });
  const env: Env = {
    DB: db as unknown as D1Database,
    STATE: {} as KVNamespace,
    SNITCH_URL: 'https://cf-snitch.test',
    SNITCH_TOKEN: 'tok',
    SNITCH: { fetch: snitchFetch },
  };
  return { env, snitchFetch };
}

class EmptyD1 implements D1Like {
  prepare(_query: string): D1Statement {
    return {
      bind(): D1Statement {
        return this;
      },
      async all() {
        return { results: [] };
      },
      async first() {
        return null;
      },
    };
  }

  async batch(): Promise<unknown> {
    return null;
  }
}

function config(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'mock',
    domain: 'mock.pl',
    platform: 'custom',
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 60,
    requiresProxy: false,
    endpoint: 'https://mock.pl',
    enabled: true,
    ...overrides,
  };
}

function okModule(configValue: ProviderConfig): ProviderModule {
  const provider = buildProvider(configValue, silentLogger(), async () => ({
    domain: configValue.domain,
    fetchedAt: '2026-08-24T06:00:00.000Z',
    products: [],
  }));
  return {
    config: configValue,
    build(): Provider {
      return provider;
    },
  };
}

function failingModule(configValue: ProviderConfig): ProviderModule {
  return {
    config: configValue,
    build({ logger }): Provider {
      return buildProvider(configValue, logger, async () => {
        throw new Error('boom');
      });
    },
  };
}

describe('runGetPipeline', () => {
  it('runs only enabled cf-get providers', async () => {
    const modules = [
      okModule(config({ id: 'a', domain: 'a.pl' })),
      okModule(config({ id: 'b', domain: 'b.pl', mode: 'vps-mutation' })),
      okModule(config({ id: 'c', domain: 'c.pl', enabled: false })),
    ];
    const db = new EmptyD1();
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, silentLogger(), modules);
    expect(results).toHaveLength(1);
    expect(results[0]?.providerId).toBe('a');
    expect(results[0]?.ok).toBe(true);
  });

  it('collects provider failures without aborting the loop', async () => {
    const modules = [
      failingModule(config({ id: 'bad', domain: 'bad.pl' })),
      okModule(config({ id: 'good', domain: 'good.pl' })),
    ];
    const db = new EmptyD1();
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, silentLogger(), modules);
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toBe('boom');
    expect(results[1]?.ok).toBe(true);
  });

  it('logs an error record when a provider fails', async () => {
    const capture = capturingLogger();
    const modules = [failingModule(config({ id: 'bad', domain: 'bad.pl' }))];
    const db = new EmptyD1();
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, capture.logger, modules);
    expect(results[0]?.ok).toBe(false);
    const errorRecord = capture.records.find((record) => record.message === 'runGetPipeline provider failed');
    expect(errorRecord?.level).toBe('error');
    expect(errorRecord?.context?.['providerId']).toBe('bad');
  });

  it('sends an on-error report when a provider fails', async () => {
    const capture = capturingLogger();
    const modules = [failingModule(config({ id: 'bad', domain: 'bad.pl' }))];
    const db = new EmptyD1();
    const { env, snitchFetch } = testEnv(db);
    await runGetPipeline(db, env, capture.logger, modules);
    expect(snitchFetch).toHaveBeenCalledTimes(1);
    const call = snitchFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
    expect(body['source']).toBe('ecommerce-pulse/cf');
    expect(body['status']).toBe('failed');
    expect(body['notify']).toBe('on-error');
    expect(String(JSON.stringify(body['data']))).toContain('bad');
  });
});
