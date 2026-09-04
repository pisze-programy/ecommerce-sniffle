import { describe, expect, it } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';
import { createStorage } from '../../../../backend/src/services/storage.ts';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';
import type { Snapshot, DailyStats, StockEvent, VariantState } from '@ecommerce-sniffle/analysis';
import type { GoogleAd } from '../../../../backend/src/services/googleads/types.ts';

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

  async run(): Promise<unknown> {
    const result = this.responder(this.query, this.args);
    return result;
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
    expect(insert?.args).toEqual(['forcer.pl', '2026-08-24', 7, 680, 0, 0, 0, 0, 0, null, null]);
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
      if (
        query.startsWith(
          'SELECT day, units_sold, revenue, restocked, suspect_count, sold_min_price, sold_max_price FROM daily_stats'
        )
      ) {
        return {
          results: [
            {
              day: '2026-08-26',
              units_sold: 322,
              revenue: 100,
              restocked: 0,
              suspect_count: 0,
              sold_min_price: 40,
              sold_max_price: 60,
            },
            {
              day: '2026-08-27',
              units_sold: 2487,
              revenue: 200,
              restocked: 5,
              suspect_count: 2,
              sold_min_price: null,
              sold_max_price: null,
            },
          ],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, silentLogger());
    const points = await storage.readShopDailyRange('forcer.pl', '2026-08-26', '2026-08-27');
    expect(points).toHaveLength(2);
    expect(points[0]?.sold).toBe(322);
    expect(points[0]?.soldMinPrice).toBe(40);
    expect(points[0]?.soldMaxPrice).toBe(60);
    expect(points[1]?.soldValue).toBe(200);
    expect(points[1]?.restocked).toBe(5);
    expect(points[1]?.soldMinPrice).toBeNull();
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

  describe('readEntityStore', () => {
    it('builds the store from D1 rows', async () => {
      const { logger } = capturingLogger();
      const db = new MockD1((query) => {
        if (query.startsWith('SELECT id, name, kind')) {
          return {
            results: [
              {
                id: 'hdrey-group',
                name: 'Hdrey Group',
                kind: 'company',
                krs: '0000683399',
                regon: null,
                nip: null,
                bizraport_url: 'https://bizraport/hdrey',
                meta_page_id: '129962510193438',
                cpm_min: 15,
                cpm_max: 30,
              },
            ],
          };
        }
        if (query.startsWith('SELECT id, name, linkedin_url')) {
          return { results: [{ id: 'karolina', name: 'Karolina', linkedin_url: null }] };
        }
        if (query.startsWith('SELECT owner_kind')) {
          return {
            results: [
              {
                owner_kind: 'entity',
                owner_id: 'hdrey-group',
                platform: 'instagram',
                handle: 'hdrey_pl',
                url: 'https://ig/hdrey_pl',
              },
            ],
          };
        }
        if (query.startsWith('SELECT person_id')) {
          return {
            results: [
              {
                person_id: 'karolina',
                entity_id: 'hdrey-group',
                role: 'owner',
                label: 'influ',
                from_day: null,
                to_day: null,
              },
            ],
          };
        }
        if (query.startsWith('SELECT from_entity_id')) {
          return { results: [] };
        }
        return { results: [] };
      });
      const storage = createStorage(db, logger);
      const store = await storage.readEntityStore();
      expect(store.entities[0]?.id).toBe('hdrey-group');
      expect(store.entities[0]?.cpmOverride).toEqual({ min: 15, max: 30 });
      expect(store.entities[0]?.metaPageId).toBe('129962510193438');
      expect(store.entities[0]?.socials).toEqual([
        { platform: 'instagram', handle: 'hdrey_pl', url: 'https://ig/hdrey_pl' },
      ]);
      expect(store.persons[0]?.name).toBe('Karolina');
      expect(store.personRelations[0]?.role).toBe('owner');
      expect(store.entityRelations).toEqual([]);
    });
  });

  describe('social storage', () => {
    it('writes and reads profiles, posts and stories', async () => {
      const { logger } = capturingLogger();
      const postRows: Array<Record<string, unknown>> = [];
      const profileRows: Array<Record<string, unknown>> = [];
      const db = new MockD1((query) => {
        if (query.startsWith('INSERT OR REPLACE INTO social_posts')) {
          const row = {
            platform: 'instagram',
            id: 'p1',
            user_id: '331874442',
            shortcode: 'ABC',
            media_type: 'photo',
            is_reel: 0,
            taken_at: '2026-08-30T10:00:00.000Z',
            caption: 'hello',
            media_urls: '["https://cdn/1.jpg"]',
            is_paid_partnership: 1,
            is_commercial: 0,
            tagged_users: '["hdrey_pl"]',
            r2_key: null,
            fetched_at: '2026-08-30T11:00:00.000Z',
          };
          postRows.push(row);
          return { results: [row] };
        }
        if (query.startsWith('SELECT platform, id, user_id')) {
          return { results: postRows };
        }
        if (query.startsWith('INSERT OR REPLACE INTO social_profiles')) {
          profileRows.push({
            platform: 'instagram',
            user_id: '331874442',
            handle: 'karolina_pisarek',
            full_name: 'Karolina',
          });
          return { results: [] };
        }
        if (query.startsWith('SELECT platform, user_id, handle')) {
          return { results: profileRows };
        }
        return { results: [] };
      });
      const storage = createStorage(db, logger);
      await storage.upsertSocialProfile({
        platform: 'instagram',
        userId: '331874442',
        handle: 'karolina_pisarek',
        fullName: 'Karolina',
      });
      await storage.writeSocialPosts([
        {
          platform: 'instagram',
          id: 'p1',
          userId: '331874442',
          shortcode: 'ABC',
          type: 'photo',
          isReel: false,
          takenAt: '2026-08-30T10:00:00.000Z',
          caption: 'hello',
          mediaUrls: ['https://cdn/1.jpg'],
          isPaidPartnership: true,
          isCommercial: false,
          taggedUsers: ['hdrey_pl'],
          r2Key: null,
          fetchedAt: '2026-08-30T11:00:00.000Z',
        },
      ]);
      const posts = await storage.readSocialPosts(['331874442'], 10);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.taggedUsers).toEqual(['hdrey_pl']);
      expect(posts[0]?.isPaidPartnership).toBe(true);
      expect(posts[0]?.mediaUrls).toEqual(['https://cdn/1.jpg']);
      const profiles = await storage.readSocialProfiles();
      expect(profiles[0]?.handle).toBe('karolina_pisarek');
    });

    it('logs and rethrows on a write failure', async () => {
      const capture = capturingLogger();
      const db = new MockD1(() => {
        throw new Error('db down');
      });
      const storage = createStorage(db, capture.logger);
      await expect(
        storage.writeSocialPosts([
          {
            platform: 'instagram',
            id: 'p1',
            userId: '1',
            shortcode: 'ABC',
            type: 'photo',
            isReel: false,
            takenAt: '2026-08-30T10:00:00.000Z',
            caption: null,
            mediaUrls: [],
            isPaidPartnership: false,
            isCommercial: false,
            taggedUsers: [],
            r2Key: null,
            fetchedAt: '2026-08-30T11:00:00.000Z',
          },
        ])
      ).rejects.toThrow('db down');
      expect(capture.records[0]?.level).toBe('error');
      expect(capture.records[0]?.message).toBe('storage.writeSocialPosts failed');
    });
  });
});

describe('entity financials', () => {
  it('writes and reads the current year row', async () => {
    const { logger } = capturingLogger();
    const rows: Array<Record<string, unknown>> = [];
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT OR REPLACE INTO entity_financials')) {
        rows.push({
          entity_id: 'hdrey-group',
          year: 2025,
          assets: 16900000,
          revenue: 134500000,
          net_profit: -3010000,
          valuation: 89700000,
          fetched_at: '2026-08-30T00:00:00.000Z',
        });
        return { results: [] };
      }
      if (query.startsWith('SELECT entity_id, year, assets')) {
        return { results: rows };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.upsertEntityFinancials({
      entityId: 'hdrey-group',
      year: 2025,
      assets: 16900000,
      revenue: 134500000,
      netProfit: -3010000,
      valuation: 89700000,
      fetchedAt: '2026-08-30T00:00:00.000Z',
    });
    const entry = await storage.readEntityFinancials('hdrey-group');
    expect(entry?.assets).toBe(16900000);
    expect(entry?.netProfit).toBe(-3010000);
    expect(entry?.year).toBe(2025);
  });
});

describe('entity images', () => {
  it('writes the entity logo key', async () => {
    const { logger } = capturingLogger();
    const queries: string[] = [];
    const db = new MockD1((query) => {
      queries.push(query);
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.setEntityLogo('hdrey-group', 'entities/hdrey-group/logo.png');
    expect(queries.some((query) => query.includes('UPDATE entities SET logo_key'))).toBe(true);
  });

  it('writes the entity background key', async () => {
    const { logger } = capturingLogger();
    const queries: string[] = [];
    const db = new MockD1((query) => {
      queries.push(query);
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.setEntityBg('hdrey-group', 'entities/hdrey-group/bg.png');
    expect(queries.some((query) => query.includes('UPDATE entities SET bg_key'))).toBe(true);
  });

  it('writes the person avatar key', async () => {
    const { logger } = capturingLogger();
    const queries: string[] = [];
    const db = new MockD1((query) => {
      queries.push(query);
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.setPersonAvatar('rafal', 'persons/rafal/avatar.png');
    expect(queries.some((query) => query.includes('UPDATE persons SET avatar_key'))).toBe(true);
  });
});

describe('meta ads storage', () => {
  it('writes and reads active ads', async () => {
    const { logger } = capturingLogger();
    const rows: Record<string, unknown>[] = [];
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT INTO meta_ads')) {
        return { results: [] };
      }
      if (query.startsWith('SELECT ad_archive_id, page_id, entity_id')) {
        return { results: rows };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.upsertMetaAds([
      {
        adArchiveId: '635204772540093',
        pageId: '1527130717525496',
        entityId: 'laboratoriumpanidomu',
        adCreationTime: '2025-03-10',
        startDate: '2025-03-10',
        stopDate: null,
        creativeBody: ['Czyści kostkę brukową.'],
        linkTitle: ['Czyści kostkę brukową. 33% rabatu'],
        linkCaption: ['laboratoriumpanidomu.pl'],
        linkDescription: [],
        publisherPlatforms: ['FACEBOOK'],
        languages: ['pl'],
        euTotalReach: 4174096,
        reachByLocation: [{ key: 'EU', value: 4174096 }],
        reachBreakdown: [
          {
            country: 'PL',
            age_gender_breakdowns: [{ age_range: '25-34', female: 526027, male: 321382, unknown: 0 }],
          },
        ],
        targetAges: ['18', '65'],
        targetGender: 'All',
        targetLocations: [{ name: 'Poland', type: 'countries', excluded: false, num_obfuscated: 0 }],
        beneficiaryPayers: [{ payer: 'Laboratorium Pani Domu', beneficiary: 'Laboratorium Pani Domu', current: true }],
        creativeHash: 'deadbeef',
      },
    ]);
    rows.push({
      ad_archive_id: '635204772540093',
      page_id: '1527130717525496',
      entity_id: 'laboratoriumpanidomu',
      ad_creation_time: '2025-03-10',
      start_date: '2025-03-10',
      stop_date: null,
      creative_body: '["Czyści kostkę brukową."]',
      link_title: '["Czyści kostkę brukową. 33% rabatu"]',
      link_caption: '["laboratoriumpanidomu.pl"]',
      link_description: '[]',
      publisher_platforms: '["FACEBOOK"]',
      languages: '["pl"]',
      eu_total_reach: 4174096,
      reach_by_location: '[{"key":"EU","value":4174096}]',
      reach_breakdown:
        '[{"country":"PL","age_gender_breakdowns":[{"age_range":"25-34","female":526027,"male":321382,"unknown":0}]}]',
      target_ages: '["18","65"]',
      target_gender: 'All',
      target_locations: '[{"name":"Poland","type":"countries","excluded":false,"num_obfuscated":0}]',
      beneficiary_payers: '[{"payer":"Laboratorium Pani Domu","beneficiary":"Laboratorium Pani Domu","current":true}]',
      creative_hash: 'deadbeef',
      first_seen: '2026-08-30',
      last_seen: '2026-08-30',
    });
    const ads = await storage.readMetaAdsActive('1527130717525496');
    expect(ads).toHaveLength(1);
    expect(ads[0].euTotalReach).toBe(4174096);
    expect(ads[0].reachBreakdown[0].age_gender_breakdowns[0].female).toBe(526027);
    expect(ads[0].beneficiaryPayers[0].payer).toBe('Laboratorium Pani Domu');
  });

  it('writes and reads daily reach snapshots', async () => {
    const { logger } = capturingLogger();
    const rows: Record<string, unknown>[] = [];
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT OR REPLACE INTO meta_ad_days')) {
        return { results: [] };
      }
      if (query.startsWith('SELECT day, ad_archive_id, page_id')) {
        return { results: rows };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.writeMetaAdDays([
      { day: '2026-08-30', adArchiveId: '635204772540093', pageId: '1527130717525496', euTotalReach: 4174096 },
    ]);
    rows.push({
      day: '2026-08-30',
      ad_archive_id: '635204772540093',
      page_id: '1527130717525496',
      eu_total_reach: 4174096,
    });
    const days = await storage.readMetaAdDays('1527130717525496', '2026-08-01');
    expect(days).toHaveLength(1);
    expect(days[0].euTotalReach).toBe(4174096);
  });

  it('ends ads not seen on the current day', async () => {
    const { logger } = capturingLogger();
    let changes = 0;
    let lastBind: readonly unknown[] = [];
    const db = new MockD1((query, args) => {
      if (query.startsWith('UPDATE meta_ads SET stop_date')) {
        changes = 2;
        lastBind = args;
        return { results: [], meta: { changes: 2 } };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const ended = await storage.endMetaAds('1527130717525496', '2026-08-29', '2026-08-30');
    expect(ended).toBe(2);
    expect(changes).toBe(2);
    expect(lastBind).toEqual(['2026-08-29', '1527130717525496', '2026-08-30']);
  });
});

describe('google ads storage', () => {
  function googleAd(): GoogleAd {
    return {
      creativeId: 'CR05850846188550488065',
      advertiserId: 'AR10613569593844695041',
      entityId: 'laboratoriumpanidomu',
      disclosedName: 'Laboratorium Pani Domu Sp. z o.o.',
      format: 'VIDEO',
      topic: 'Home & Garden',
      pageUrl: 'https://adstransparency.google.com/advertiser/AR/creative/CR?region=anywhere',
      firstShown: '2025-09-10',
      lastShown: '2026-09-02',
      impLo: 15000,
      impHi: 20000,
      audience: { demographic: null, geo: null, contextual: null, customerLists: null, topics: null },
      surfaces: [{ surface: 'YOUTUBE', lo: 15000, hi: 20000 }],
    };
  }

  it('writes and reads active ads', async () => {
    const { logger } = capturingLogger();
    const rows: Record<string, unknown>[] = [];
    let selectArgs: readonly unknown[] = [];
    const db = new MockD1((query, args) => {
      if (query.startsWith('INSERT INTO google_ads')) {
        return { results: [] };
      }
      if (query.startsWith('SELECT creative_id, advertiser_id, entity_id')) {
        selectArgs = args;
        return { results: rows };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.upsertGoogleAds([googleAd()]);
    rows.push({
      creative_id: 'CR05850846188550488065',
      advertiser_id: 'AR10613569593844695041',
      entity_id: 'laboratoriumpanidomu',
      disclosed_name: 'Laboratorium Pani Domu Sp. z o.o.',
      format: 'VIDEO',
      topic: 'Home & Garden',
      page_url: 'https://adstransparency.google.com/advertiser/AR/creative/CR?region=anywhere',
      first_shown: '2025-09-10',
      last_shown: '2026-09-02',
      imp_lo: 15000,
      imp_hi: 20000,
      audience: '{"demographic":null,"geo":null,"contextual":null,"customerLists":null,"topics":null}',
      surfaces: '[{"surface":"YOUTUBE","lo":15000,"hi":20000}]',
      first_seen: '2026-09-03',
      last_seen: '2026-09-03',
    });
    const ads = await storage.readGoogleAdsActive('AR10613569593844695041', '2026-08-27');
    expect(ads).toHaveLength(1);
    expect(ads[0].impLo).toBe(15000);
    expect(ads[0].surfaces[0].surface).toBe('YOUTUBE');
    expect(ads[0].audience.geo).toBe(null);
    expect(selectArgs).toEqual(['AR10613569593844695041', '2026-08-27']);
  });

  it('writes and reads daily impression snapshots', async () => {
    const { logger } = capturingLogger();
    const rows: Record<string, unknown>[] = [];
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT OR REPLACE INTO google_ad_days')) {
        return { results: [] };
      }
      if (query.startsWith('SELECT day, creative_id, advertiser_id')) {
        return { results: rows };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await storage.writeGoogleAdDays([
      {
        day: '2026-09-03',
        creativeId: 'CR05850846188550488065',
        advertiserId: 'AR10613569593844695041',
        impLo: 15000,
        impHi: 20000,
      },
    ]);
    rows.push({
      day: '2026-09-03',
      creative_id: 'CR05850846188550488065',
      advertiser_id: 'AR10613569593844695041',
      imp_lo: 15000,
      imp_hi: 20000,
    });
    const days = await storage.readGoogleAdDays('AR10613569593844695041', '2026-08-01');
    expect(days).toHaveLength(1);
    expect(days[0].impHi).toBe(20000);
  });

  it('caps sentinel bounds and surfaces on read', async () => {
    const { logger } = capturingLogger();
    const rows: Record<string, unknown>[] = [
      {
        creative_id: 'CR1',
        advertiser_id: 'AR1',
        entity_id: null,
        disclosed_name: null,
        format: 'VIDEO',
        topic: null,
        page_url: null,
        first_shown: null,
        last_shown: null,
        imp_lo: 10000000,
        imp_hi: 9223372036854776000,
        audience: null,
        surfaces: '[{"surface":"SEARCH","lo":10000000,"hi":9223372036854776000}]',
        first_seen: '2026-09-03',
        last_seen: '2026-09-03',
      },
    ];
    const db2 = new MockD1((query) => {
      if (query.startsWith('SELECT creative_id, advertiser_id, entity_id')) {
        return { results: rows };
      }
      return { results: [] };
    });
    const storage2 = createStorage(db2, logger);
    const ads = await storage2.readGoogleAdsActive('AR1', '2026-08-27');
    expect(ads).toHaveLength(1);
    expect(ads[0].impLo).toBe(null);
    expect(ads[0].impHi).toBe(null);
    expect(ads[0].surfaces[0].lo).toBe(null);
    expect(ads[0].surfaces[0].hi).toBe(null);
  });

  it('logs and rethrows a failed upsert', async () => {
    const { logger, records } = capturingLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT INTO google_ads')) {
        throw new Error('boom');
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await expect(storage.upsertGoogleAds([googleAd()])).rejects.toThrow('boom');
    expect(records.some((record) => record.message === 'storage.upsertGoogleAds failed')).toBe(true);
  });

  it('logs and rethrows a failed days write', async () => {
    const { logger, records } = capturingLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('INSERT OR REPLACE INTO google_ad_days')) {
        throw new Error('boom');
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await expect(
      storage.writeGoogleAdDays([{ day: '2026-09-03', creativeId: 'CR1', advertiserId: 'AR1', impLo: 0, impHi: 1 }])
    ).rejects.toThrow('boom');
    expect(records.some((record) => record.message === 'storage.writeGoogleAdDays failed')).toBe(true);
  });

  it('logs and rethrows a failed active read', async () => {
    const { logger, records } = capturingLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT creative_id, advertiser_id, entity_id')) {
        throw new Error('boom');
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await expect(storage.readGoogleAdsActive('AR1', '2026-08-27')).rejects.toThrow('boom');
    expect(records.some((record) => record.message === 'storage.readGoogleAdsActive failed')).toBe(true);
  });

  it('logs and rethrows a failed days read', async () => {
    const { logger, records } = capturingLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT day, creative_id, advertiser_id')) {
        throw new Error('boom');
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    await expect(storage.readGoogleAdDays('AR1', '2026-08-01')).rejects.toThrow('boom');
    expect(records.some((record) => record.message === 'storage.readGoogleAdDays failed')).toBe(true);
  });
});
