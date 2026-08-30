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
    expect(insert[0]?.args).toEqual(['forcer.pl', '2026-08-24T06:00:00.000Z', 'morning', 'p1', 'v1', 10, 100, 100, 1]);
  });

  it('skips writing an empty snapshot', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot({ ...snapshot(), variants: [] });
    expect(db.batches).toEqual([]);
  });

  it('upserts one product url per product, deduped across variants', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot({
      ...snapshot(),
      variants: [
        variant({ productUrl: 'https://forcer.pl/products/set-air', productTitle: 'SET AIR' }),
        variant({ variantId: 'v2', productUrl: 'https://forcer.pl/products/set-air' }),
      ],
    });
    const upsert = db.calls.filter((call) => call.query.startsWith('INSERT INTO products'));
    expect(upsert).toHaveLength(1);
    expect(upsert[0]?.args).toEqual(['forcer.pl', 'p1', 'https://forcer.pl/products/set-air', 'SET AIR']);
  });

  it('upserts variant titles per variant', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot({
      ...snapshot(),
      variants: [variant({ productUrl: 'https://forcer.pl/products/set-air', variantTitle: 'Black / S' })],
    });
    const upsert = db.calls.filter((call) => call.query.startsWith('INSERT INTO variants'));
    expect(upsert).toHaveLength(1);
    expect(upsert[0]?.args).toEqual(['forcer.pl', 'p1', 'v1', 'Black / S']);
  });

  it('skips variant rows without a title', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.writeSnapshot(snapshot());
    const upsert = db.calls.filter((call) => call.query.startsWith('INSERT INTO variants'));
    expect(upsert).toHaveLength(0);
  });

  it('reads shop names into maps', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT product_id, url, title FROM products')) {
        return { results: [{ product_id: 'p1', url: 'https://forcer.pl/products/set-air', title: 'SET AIR' }] };
      }
      if (query.startsWith('SELECT variant_id, title FROM variants')) {
        return { results: [{ variant_id: 'v1', title: 'Black / S' }] };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const names = await storage.readShopNames('forcer.pl');
    expect(names.productUrls.get('p1')).toBe('https://forcer.pl/products/set-air');
    expect(names.productTitles.get('p1')).toBe('SET AIR');
    expect(names.variantTitles.get('v1')).toBe('Black / S');
  });

  it('upserts names without writing a snapshot', async () => {
    const db = new MockD1(() => ({ results: [] }));
    const storage = createStorage(db, silentLogger());
    await storage.upsertNames(
      'forcer.pl',
      [{ productId: 'p1', url: 'https://forcer.pl/products/set-air', title: 'SET AIR' }],
      [{ productId: 'p1', variantId: 'v1', title: 'Black / S' }]
    );
    const productUpsert = db.calls.filter((call) => call.query.startsWith('INSERT INTO products'));
    const variantUpsert = db.calls.filter((call) => call.query.startsWith('INSERT INTO variants'));
    expect(productUpsert).toHaveLength(1);
    expect(productUpsert[0]?.args).toEqual(['forcer.pl', 'p1', 'https://forcer.pl/products/set-air', 'SET AIR']);
    expect(variantUpsert).toHaveLength(1);
    expect(variantUpsert[0]?.args).toEqual(['forcer.pl', 'p1', 'v1', 'Black / S']);
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
      suspectCount: 0,
    };
    await storage.writeDailyStats(stats);
    const insert = db.calls.find((call) => call.query.startsWith('INSERT OR REPLACE INTO daily_stats'));
    expect(insert?.args).toEqual(['forcer.pl', '2026-08-24', 7, 680, 0, 0, 0, 0, 0]);
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
              suspect_count: 2,
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
    expect(stats?.suspectCount).toBe(2);
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
    expect(events[0]?.to?.price).toBe(100);
    expect(events[0]?.from?.quantity).toBe(12);
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

  it('lists distinct shops', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT DISTINCT shop')) {
        return { results: [{ shop: 'forcer.pl' }, { shop: 'wkdzik.pl' }] };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const shops = await storage.readShops();
    expect(shops).toEqual(['forcer.pl', 'wkdzik.pl']);
  });

  it('returns the largest absolute observed quantity', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT MAX(ABS(quantity))')) {
        return { results: [{ max_q: 100000 }] };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    expect(await storage.readMaxObservedQuantity('wkdzik.pl')).toBe(100000);
  });

  it('returns zero when a shop has no snapshots', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT MAX(ABS(quantity))')) {
        return { results: [{ max_q: null }] };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    expect(await storage.readMaxObservedQuantity('forcer.pl')).toBe(0);
  });

  it('reads a daily range for a shop', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT day, units_sold, revenue, restocked, suspect_count FROM daily_stats')) {
        return {
          results: [
            { day: '2026-08-26', units_sold: 322, revenue: 100, restocked: 0, suspect_count: 0 },
            { day: '2026-08-27', units_sold: 2487, revenue: 200, restocked: 5, suspect_count: 2 },
          ],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const points = await storage.readShopDailyRange('forcer.pl', '2026-08-26', '2026-08-27');
    expect(points).toHaveLength(2);
    expect(points[0]?.sold).toBe(322);
    expect(points[1]?.soldValue).toBe(200);
    expect(points[1]?.restocked).toBe(5);
  });

  it('aggregates the portfolio by day', async () => {
    const db = new MockD1((query) => {
      if (query.includes('GROUP BY day')) {
        return {
          results: [{ day: '2026-08-27', sold: 100, sold_value: 5000, restocked: 30 }],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const points = await storage.readPortfolioDaily('2026-08-27', '2026-08-27');
    expect(points[0]?.sold).toBe(100);
    expect(points[0]?.soldValue).toBe(5000);
  });

  it('searches products by id or url', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT shop, product_id FROM products')) {
        return { results: [{ shop: 'forcer.pl', product_id: '10828425036107' }] };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const rows = await storage.searchProducts('10828425');
    expect(rows).toEqual([{ shop: 'forcer.pl', productId: '10828425036107' }]);
  });

  it('returns no products for an empty search query', async () => {
    const storage = createStorage(new MockD1(() => ({ results: [] })), silentLogger());
    expect(await storage.searchProducts('')).toEqual([]);
  });

  it('groups snapshot rows into snapshots in time order', async () => {
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT * FROM snapshots')) {
        return {
          results: [
            {
              shop: 'forcer.pl',
              snapshot_at: '2026-08-24T06:00:00.000Z',
              window: 'morning',
              product_id: 'p1',
              variant_id: 'v1',
              quantity: 12,
              price: 100,
              regular_price: 100,
              available: 1,
            },
            {
              shop: 'forcer.pl',
              snapshot_at: '2026-08-24T06:00:00.000Z',
              window: 'morning',
              product_id: 'p2',
              variant_id: 'v2',
              quantity: 3,
              price: 50,
              regular_price: 50,
              available: 1,
            },
            {
              shop: 'forcer.pl',
              snapshot_at: '2026-08-24T18:00:00.000Z',
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
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const snapshots = await storage.readSnapshots('forcer.pl');
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.snapshotAt).toBe('2026-08-24T06:00:00.000Z');
    expect(snapshots[0]?.variants).toHaveLength(2);
    expect(snapshots[1]?.window).toBe('evening');
    expect(snapshots[1]?.variants).toHaveLength(1);
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
      suspectCount: 0,
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
