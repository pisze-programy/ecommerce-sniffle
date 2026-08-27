import { describe, expect, it } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';
import { createStorage } from '../../../../backend/src/services/storage.ts';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';
import type { Snapshot, DailyStats, StockEvent, VariantState } from '@ecommerce-sniffle/analysis';

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

type Responder = (query: string, args: readonly unknown[]) => { results: unknown[] };

class MockStatement implements D1Statement {
  args: unknown[] = [];
  constructor(
    readonly query: string,
    private readonly responder: Responder
  ) {}

  bind(...values: unknown[]): D1Statement {
    this.args = values;
    return this;
  }

  async all(): Promise<{ results: unknown[] }> {
    return this.responder(this.query, this.args);
  }

  async first(): Promise<unknown> {
    const result = this.responder(this.query, this.args);
    const first = result.results[0];
    return first === undefined ? null : first;
  }
}

class MockD1 implements D1Like {
  readonly calls: { query: string; args: readonly unknown[] }[] = [];
  readonly batches: number[] = [];

  constructor(private readonly responder: Responder) {}

  prepare(query: string): D1Statement {
    return new MockStatement(query, (q, args) => {
      this.calls.push({ query: q, args });
      return this.responder(q, args);
    });
  }

  async batch(statements: D1Statement[]): Promise<unknown> {
    this.batches.push(statements.length);
    for (const statement of statements) {
      await statement.all();
    }
    return statements;
  }
}

function variant(overrides: Partial<VariantState> = {}): VariantState {
  return {
    productId: 'p1',
    variantId: 'v1',
    quantity: 10,
    price: 100,
    regularPrice: 100,
    available: true,
    ...overrides,
  };
}

function snapshot(): Snapshot {
  return {
    shop: 'forcer.pl',
    snapshotAt: '2026-08-24T06:00:00.000Z',
    window: 'morning',
    variants: [variant(), variant({ variantId: 'v2', quantity: 5 })],
  };
}

function silentLogger(): Logger {
  return createLogger(() => {
    // discard
  });
}

describe('createStorage', () => {
  it('writes a snapshot as one insert per variant', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot(snapshot());
    expect(db.batches).toEqual([2]);
    const insert = db.calls.filter((call) => call.query.startsWith('INSERT INTO snapshots'));
    expect(insert).toHaveLength(2);
    expect(insert[0]?.args).toEqual([
      'forcer.pl',
      '2026-08-24T06:00:00.000Z',
      'morning',
      'p1',
      'v1',
      10,
      100,
      100,
      1,
      null,
    ]);
  });

  it('skips writing an empty snapshot', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot({ ...snapshot(), variants: [] });
    expect(db.batches).toEqual([]);
  });

  it('reads the latest snapshot', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT DISTINCT')) {
        return { results: [{ snapshot_at: '2026-08-24T20:00:00.000Z' }] };
      }
      return {
        results: [
          {
            snapshot_at: '2026-08-24T20:00:00.000Z',
            window: 'evening',
            product_id: 'p1',
            variant_id: 'v1',
            quantity: 7,
            price: 100,
            regular_price: 100,
            available: 1,
          },
        ],
      };
    });
    const storage = createStorage(db, silentLogger());
    const latest = await storage.readLatestSnapshot('forcer.pl');
    expect(latest?.shop).toBe('forcer.pl');
    expect(latest?.window).toBe('evening');
    expect(latest?.variants[0]?.quantity).toBe(7);
  });

  it('returns null when there is no snapshot', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    expect(await storage.readLatestSnapshot('forcer.pl')).toBeNull();
  });

  it('writes daily stats', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    const stats: DailyStats = {
      shop: 'forcer.pl',
      day: '2026-08-24',
      unitsSold: 7,
      revenue: 680,
      restocked: 0,
      soldOutCount: 0,
      promotionCount: 0,
      maskedCount: 0,
    };
    await storage.writeDailyStats(stats);
    const insert = db.calls.find((call) => call.query.startsWith('INSERT OR REPLACE INTO daily_stats'));
    expect(insert?.args).toEqual(['forcer.pl', '2026-08-24', 7, 680, 0, 0, 0, 0]);
  });

  it('reads daily stats', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT * FROM daily_stats')) {
        return {
          results: [
            {
              shop: 'forcer.pl',
              day: '2026-08-24',
              units_sold: 7,
              revenue: 680,
              restocked: 0,
              sold_out_count: 0,
              promotion_count: 0,
              masked_count: 0,
            },
          ],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const stats = await storage.readDailyStats('forcer.pl', '2026-08-24');
    expect(stats?.unitsSold).toBe(7);
    expect(stats?.revenue).toBe(680);
  });

  it('writes events as a batch', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    const event: StockEvent = {
      type: 'sold',
      productId: 'p1',
      variantId: 'v1',
      from: variant({ quantity: 12 }),
      to: variant({ quantity: 7 }),
      units: 5,
      confidence: 'exact',
    };
    await storage.writeEvents('forcer.pl', '2026-08-24', '2026-08-24T20:00:00.000Z', [event]);
    expect(db.batches).toEqual([1]);
  });

  it('reads events', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT * FROM events')) {
        return {
          results: [
            {
              type: 'sold',
              product_id: 'p1',
              variant_id: 'v1',
              from_quantity: 12,
              to_quantity: 7,
              from_price: 100,
              to_price: 100,
              units: 5,
              confidence: 'exact',
            },
          ],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const events = await storage.readEvents('forcer.pl', '2026-08-24');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('sold');
  });

  it('reads a series for a product', async () => {
    const db = new MockD1((query) => {
      if (query.includes('SELECT snapshot_at, quantity')) {
        return {
          results: [
            { snapshot_at: '2026-08-22T06:00:00.000Z', quantity: 14, price: 3500, available: 1 },
            { snapshot_at: '2026-08-23T06:00:00.000Z', quantity: 12, price: 3500, available: 1 },
          ],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const series = await storage.readSeries('forcer.pl', 'p1');
    expect(series).toHaveLength(2);
    expect(series[0]?.quantity).toBe(14);
  });

  it('logs an error and rethrows when the snapshot write fails', async () => {
    const capture = capturingLogger();
    const db = new MockD1(() => {
      throw new Error('db down');
    });
    const storage = createStorage(db, capture.logger);
    await expect(storage.writeSnapshot(snapshot())).rejects.toThrow('db down');
    expect(capture.records[0]?.level).toBe('error');
    expect(capture.records[0]?.message).toBe('storage.writeSnapshot failed');
  });

  it('logs an error and rethrows when the daily stats write fails', async () => {
    const capture = capturingLogger();
    const db = new MockD1(() => {
      throw new Error('db down');
    });
    const storage = createStorage(db, capture.logger);
    const stats: DailyStats = {
      shop: 'forcer.pl',
      day: '2026-08-24',
      unitsSold: 7,
      revenue: 680,
      restocked: 0,
      soldOutCount: 0,
      promotionCount: 0,
      maskedCount: 0,
    };
    await expect(storage.writeDailyStats(stats)).rejects.toThrow('db down');
    expect(capture.records[0]?.level).toBe('error');
    expect(capture.records[0]?.message).toBe('storage.writeDailyStats failed');
  });

  it('logs an error and rethrows when the events write fails', async () => {
    const capture = capturingLogger();
    const db = new MockD1(() => {
      throw new Error('db down');
    });
    const storage = createStorage(db, capture.logger);
    const events: StockEvent[] = [
      {
        type: 'sold',
        productId: 'p1',
        variantId: 'v1',
        from: null,
        to: null,
        units: 2,
        confidence: 'exact',
      },
    ];
    await expect(storage.writeEvents('forcer.pl', '2026-08-24', '2026-08-24T06:00:00.000Z', events)).rejects.toThrow(
      'db down'
    );
    expect(capture.records[0]?.level).toBe('error');
    expect(capture.records[0]?.message).toBe('storage.writeEvents failed');
  });
});
