import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../packages/providers/src/logger.ts';
import type { Catalog } from '../../../../packages/providers/src/types.ts';
import {
  buildProvider,
  buildStockRevealer,
  notImplemented,
  ProviderError,
} from '../../../../packages/providers/src/factory.ts';

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

const CONFIG = {
  id: 'test-shop',
  domain: 'test-shop.pl',
  platform: 'custom',
  schedule: '0 4 * * *',
  window: 'both' as const,
  mode: 'cf-get',
  stockSource: 'html',
  ratePerSecond: 1,
  durationSeconds: 60,
  requiresProxy: false,
  endpoint: 'https://test-shop.pl',
  enabled: true,
} as const;

function catalog(): Catalog {
  return { domain: 'test-shop.pl', fetchedAt: '2026-08-23T06:00:00.000Z', products: [] };
}

describe('buildProvider', () => {
  it('returns the catalog on success', async () => {
    const capture = capturingLogger();
    const provider = buildProvider(CONFIG, capture.logger, async () => catalog());
    await expect(provider.fetchCatalog()).resolves.toEqual(catalog());
    expect(capture.records).toHaveLength(0);
  });

  it('logs an error and rethrows when the catalog fetch fails', async () => {
    const capture = capturingLogger();
    const provider = buildProvider(CONFIG, capture.logger, async () => {
      throw new Error('boom');
    });
    await expect(provider.fetchCatalog()).rejects.toThrow('boom');
    expect(capture.records).toHaveLength(1);
    const record = capture.records[0];
    expect(record?.level).toBe('error');
    expect(record?.message).toBe('Provider.fetchCatalog failed');
    expect(record?.context).toEqual({
      providerId: 'test-shop',
      domain: 'test-shop.pl',
      error: 'boom',
    });
  });
});

describe('buildStockRevealer', () => {
  it('returns the catalog on reveal success', async () => {
    const capture = capturingLogger();
    const revealer = buildStockRevealer(
      CONFIG,
      capture.logger,
      async () => catalog(),
      async () => catalog()
    );
    await expect(revealer.revealStock({ productIds: [] })).resolves.toEqual(catalog());
    expect(capture.records).toHaveLength(0);
  });

  it('logs an error and rethrows when the reveal fails', async () => {
    const capture = capturingLogger();
    const revealer = buildStockRevealer(
      CONFIG,
      capture.logger,
      async () => catalog(),
      async () => {
        throw new Error('reveal boom');
      }
    );
    await expect(revealer.revealStock({ productIds: [] })).rejects.toThrow('reveal boom');
    expect(capture.records).toHaveLength(1);
    const record = capture.records[0];
    expect(record?.level).toBe('error');
    expect(record?.message).toBe('Provider.revealStock failed');
    expect(record?.context?.['error']).toBe('reveal boom');
  });
});

describe('notImplemented', () => {
  it('throws a ProviderError with the provider id', () => {
    expect(() => notImplemented(CONFIG)).toThrowError(ProviderError);
    try {
      notImplemented(CONFIG);
    } catch (error) {
      const providerError = error as ProviderError;
      expect(providerError.providerId).toBe('test-shop');
      expect(providerError.message).toContain('test-shop');
    }
  });
});
