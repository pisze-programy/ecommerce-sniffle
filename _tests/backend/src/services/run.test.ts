import { describe, expect, it, vi } from 'vitest';
import { buildProvider, createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord, Provider, ProviderConfig, ProviderModule } from '@ecommerce-sniffle/providers';
import { runGetPipeline } from '../../../../backend/src/services/run.ts';
import { createTaskStore } from '../../../../backend/src/services/queue.ts';
import type { Env } from '../../../../backend/src/env/types.ts';
import { makeTask, MemoryQueueDb } from './memory-queue-db.ts';

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

function testEnv(db: MemoryQueueDb): { env: Env; snitchFetch: ReturnType<typeof vi.fn> } {
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

async function seedTask(db: MemoryQueueDb, task: ReturnType<typeof makeTask>): Promise<void> {
  const store = createTaskStore(db, silentLogger());
  await store.createTask(task);
}

describe('runGetPipeline', () => {
  it('claims and runs only queued cf-get tasks', async () => {
    const db = new MemoryQueueDb();
    const modules = [
      okModule(config({ id: 'a', domain: 'a.pl' })),
      okModule(config({ id: 'b', domain: 'b.pl', mode: 'vps-mutation' })),
    ];
    await seedTask(
      db,
      makeTask({ taskId: 'm-a', providerId: 'a', domain: 'a.pl', mode: 'cf-get', durationSeconds: 60 })
    );
    await seedTask(
      db,
      makeTask({ taskId: 'm-b', providerId: 'b', domain: 'b.pl', mode: 'vps-mutation', durationSeconds: 60 })
    );
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, silentLogger(), modules);
    expect(results).toHaveLength(1);
    expect(results[0]?.providerId).toBe('a');
    expect(results[0]?.ok).toBe(true);
    expect(db.tasks.get('m-a')?.['status']).toBe('done');
    expect(db.tasks.get('m-b')?.['status']).toBe('pending');
  });

  it('collects provider failures without aborting the loop', async () => {
    const db = new MemoryQueueDb();
    const modules = [
      failingModule(config({ id: 'bad', domain: 'bad.pl' })),
      okModule(config({ id: 'good', domain: 'good.pl' })),
    ];
    await seedTask(
      db,
      makeTask({ taskId: 't-bad', providerId: 'bad', domain: 'bad.pl', mode: 'cf-get', durationSeconds: 60 })
    );
    await seedTask(
      db,
      makeTask({
        taskId: 't-good',
        providerId: 'good',
        domain: 'good.pl',
        mode: 'cf-get',
        durationSeconds: 60,
        createdAt: 2,
      })
    );
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, silentLogger(), modules);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.providerId === 'bad')?.ok).toBe(false);
    expect(results.find((r) => r.providerId === 'bad')?.error).toBe('boom');
    expect(results.find((r) => r.providerId === 'good')?.ok).toBe(true);
  });

  it('logs an error record when a provider fails', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const modules = [failingModule(config({ id: 'bad', domain: 'bad.pl' }))];
    await seedTask(
      db,
      makeTask({ taskId: 't-bad', providerId: 'bad', domain: 'bad.pl', mode: 'cf-get', durationSeconds: 60 })
    );
    const { env } = testEnv(db);
    await runGetPipeline(db, env, capture.logger, modules);
    const errorRecord = capture.records.find((record) => record.message === 'runGetPipeline provider failed');
    expect(errorRecord?.level).toBe('error');
    expect(errorRecord?.context?.['providerId']).toBe('bad');
  });

  it('sends an on-error report when a provider fails', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const modules = [failingModule(config({ id: 'bad', domain: 'bad.pl' }))];
    await seedTask(
      db,
      makeTask({ taskId: 't-bad', providerId: 'bad', domain: 'bad.pl', mode: 'cf-get', durationSeconds: 60 })
    );
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

  it('completes the task of a disabled provider without building it', async () => {
    const db = new MemoryQueueDb();
    const built = vi.fn();
    const modules: ProviderModule[] = [
      {
        config: config({ id: 'off', domain: 'off.pl', enabled: false }),
        build(): Provider {
          built();
          throw new Error('must not build');
        },
      },
    ];
    await seedTask(
      db,
      makeTask({ taskId: 't-off', providerId: 'off', domain: 'off.pl', mode: 'cf-get', durationSeconds: 60 })
    );
    const { env } = testEnv(db);
    await runGetPipeline(db, env, silentLogger(), modules);
    expect(built).not.toHaveBeenCalled();
    expect(db.tasks.get('t-off')?.['status']).toBe('done');
  });

  it('reports nothing when there are no cf-get tasks', async () => {
    const db = new MemoryQueueDb();
    const { env } = testEnv(db);
    const results = await runGetPipeline(db, env, silentLogger(), [okModule(config({ id: 'a', domain: 'a.pl' }))]);
    expect(results).toHaveLength(0);
  });
});
