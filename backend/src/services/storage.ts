import type { DailyStats, Snapshot, StockEvent, VariantState } from '@ecommerce-sniffle/analysis';
import type { Logger } from '@ecommerce-sniffle/providers';

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all(): Promise<{ results: unknown[] }>;
  first(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

export interface Storage {
  writeSnapshot(snapshot: Snapshot): Promise<void>;
  readLatestSnapshot(shop: string): Promise<Snapshot | null>;
  writeDailyStats(stats: DailyStats): Promise<void>;
  readDailyStats(shop: string, day: string): Promise<DailyStats | null>;
  writeEvents(shop: string, day: string, snapshotAt: string, events: readonly StockEvent[]): Promise<void>;
  readEvents(shop: string, day: string): Promise<readonly StockEvent[]>;
  readEventsByWindow(shop: string, day: string, window: 'morning' | 'evening'): Promise<readonly StockEvent[]>;
  readSeries(shop: string, productId: string): Promise<readonly SeriesPoint[]>;
  readAvailableDays(shop: string): Promise<readonly string[]>;
  readDayCount(shop: string): Promise<number>;
  readFirstSeed(shop: string): Promise<string | null>;
}

export interface SeriesPoint {
  readonly snapshotAt: string;
  readonly quantity: number | null;
  readonly price: number | null;
  readonly available: boolean;
}

interface SnapshotRow {
  shop: string;
  snapshot_at: string;
  window: string;
  product_id: string;
  variant_id: string;
  quantity: number | null;
  price: number | null;
  regular_price: number | null;
  available: number;
  product_url: string | null;
}

interface StatsRow {
  shop: string;
  day: string;
  units_sold: number;
  revenue: number;
  restocked: number;
  sold_out_count: number;
  promotion_count: number;
  masked_count: number;
}

interface EventRow {
  type: string;
  product_id: string;
  variant_id: string;
  from_quantity: number | null;
  to_quantity: number | null;
  from_price: number | null;
  to_price: number | null;
  units: number;
  confidence: string;
}

interface EventWriteRow {
  shop: string;
  snapshot_at: string;
  day: string;
  type: string;
  product_id: string;
  variant_id: string;
  from_quantity: number | null;
  to_quantity: number | null;
  from_price: number | null;
  to_price: number | null;
  units: number;
  confidence: string;
}

function toRow(snapshot: Snapshot): SnapshotRow[] {
  return snapshot.variants.map((variant) => ({
    shop: snapshot.shop,
    snapshot_at: snapshot.snapshotAt,
    window: snapshot.window,
    product_id: variant.productId,
    variant_id: variant.variantId,
    quantity: variant.quantity,
    price: variant.price,
    regular_price: variant.regularPrice,
    available: variant.available ? 1 : 0,
    product_url: variant.productUrl === undefined ? null : variant.productUrl,
  }));
}

function fromRow(row: SnapshotRow): VariantState {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    price: row.price,
    regularPrice: row.regular_price,
    available: row.available === 1,
    productUrl: row.product_url,
  };
}

function toStatsRow(stats: DailyStats): StatsRow {
  return {
    shop: stats.shop,
    day: stats.day,
    units_sold: stats.unitsSold,
    revenue: stats.revenue,
    restocked: stats.restocked,
    sold_out_count: stats.soldOutCount,
    promotion_count: stats.promotionCount,
    masked_count: stats.maskedCount,
  };
}

function fromStatsRow(row: StatsRow): DailyStats {
  return {
    shop: row.shop,
    day: row.day,
    unitsSold: row.units_sold,
    revenue: row.revenue,
    restocked: row.restocked,
    soldOutCount: row.sold_out_count,
    promotionCount: row.promotion_count,
    maskedCount: row.masked_count,
  };
}

function toEventRow(event: StockEvent, shop: string, day: string, snapshotAt: string): EventWriteRow {
  return {
    shop,
    snapshot_at: snapshotAt,
    day,
    type: event.type,
    product_id: event.productId,
    variant_id: event.variantId,
    from_quantity: event.from === null ? null : event.from.quantity,
    to_quantity: event.to === null ? null : event.to.quantity,
    from_price: event.from === null ? null : event.from.price,
    to_price: event.to === null ? null : event.to.price,
    units: event.units,
    confidence: event.confidence,
  };
}

function fromEventRow(row: EventRow): StockEvent {
  return {
    type: row.type as StockEvent['type'],
    productId: row.product_id,
    variantId: row.variant_id,
    from: null,
    to: null,
    units: row.units,
    confidence: row.confidence as StockEvent['confidence'],
  };
}

export function createStorage(db: D1Like, logger: Logger): Storage {
  return {
    async writeSnapshot(snapshot: Snapshot): Promise<void> {
      const rows = toRow(snapshot);
      if (rows.length === 0) {
        return;
      }
      const statements = rows.map((row) =>
        db
          .prepare(
            'INSERT INTO snapshots (shop, snapshot_at, window, product_id, variant_id, quantity, price, regular_price, available, product_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            row.shop,
            row.snapshot_at,
            row.window,
            row.product_id,
            row.variant_id,
            row.quantity,
            row.price,
            row.regular_price,
            row.available,
            row.product_url
          )
      );
      try {
        await db.batch(statements);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeSnapshot failed', { shop: snapshot.shop, error: message });
        throw error;
      }
    },

    async readLatestSnapshot(shop: string): Promise<Snapshot | null> {
      const first = (await db
        .prepare('SELECT DISTINCT snapshot_at FROM snapshots WHERE shop = ? ORDER BY snapshot_at DESC LIMIT 1')
        .bind(shop)
        .first()) as { snapshot_at: string } | null;
      if (first === null) {
        return null;
      }
      const result = (await db
        .prepare('SELECT * FROM snapshots WHERE shop = ? AND snapshot_at = ? ORDER BY variant_id')
        .bind(shop, first.snapshot_at)
        .all()) as { results: SnapshotRow[] };
      if (result.results.length === 0) {
        return null;
      }
      return {
        shop,
        snapshotAt: result.results[0]?.snapshot_at ?? '',
        window: result.results[0]?.window === 'evening' ? 'evening' : 'morning',
        variants: result.results.map(fromRow),
      };
    },

    async writeDailyStats(stats: DailyStats): Promise<void> {
      const row = toStatsRow(stats);
      try {
        await db
          .prepare(
            'INSERT OR REPLACE INTO daily_stats (shop, day, units_sold, revenue, restocked, sold_out_count, promotion_count, masked_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            row.shop,
            row.day,
            row.units_sold,
            row.revenue,
            row.restocked,
            row.sold_out_count,
            row.promotion_count,
            row.masked_count
          )
          .all();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeDailyStats failed', { shop: stats.shop, day: stats.day, error: message });
        throw error;
      }
    },

    async readDailyStats(shop: string, day: string): Promise<DailyStats | null> {
      const row = (await db
        .prepare('SELECT * FROM daily_stats WHERE shop = ? AND day = ?')
        .bind(shop, day)
        .first()) as StatsRow | null;
      if (row === null) {
        return null;
      }
      return fromStatsRow(row);
    },

    async writeEvents(shop: string, day: string, snapshotAt: string, events: readonly StockEvent[]): Promise<void> {
      if (events.length === 0) {
        return;
      }
      const statements = events.map((event) => {
        const row = toEventRow(event, shop, day, snapshotAt);
        return db
          .prepare(
            'INSERT INTO events (shop, snapshot_at, day, type, product_id, variant_id, from_quantity, to_quantity, from_price, to_price, units, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            row.shop,
            row.snapshot_at,
            row.day,
            row.type,
            row.product_id,
            row.variant_id,
            row.from_quantity,
            row.to_quantity,
            row.from_price,
            row.to_price,
            row.units,
            row.confidence
          );
      });
      try {
        await db.batch(statements);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeEvents failed', { shop, day, error: message });
        throw error;
      }
    },

    async readEvents(shop: string, day: string): Promise<readonly StockEvent[]> {
      const result = (await db
        .prepare('SELECT * FROM events WHERE shop = ? AND day = ? ORDER BY snapshot_at')
        .bind(shop, day)
        .all()) as { results: EventRow[] };
      return result.results.map(fromEventRow);
    },

    async readEventsByWindow(shop: string, day: string, window: 'morning' | 'evening'): Promise<readonly StockEvent[]> {
      const operator = window === 'morning' ? '<' : '>=';
      const result = (await db
        .prepare(
          `SELECT * FROM events WHERE shop = ? AND day = ? AND CAST(substr(snapshot_at, 12, 2) AS INTEGER) ${operator} 12 ORDER BY snapshot_at`
        )
        .bind(shop, day)
        .all()) as { results: EventRow[] };
      return result.results.map(fromEventRow);
    },

    async readSeries(shop: string, productId: string): Promise<readonly SeriesPoint[]> {
      const result = (await db
        .prepare(
          'SELECT snapshot_at, quantity, price, available FROM snapshots WHERE shop = ? AND product_id = ? ORDER BY snapshot_at'
        )
        .bind(shop, productId)
        .all()) as {
        results: { snapshot_at: string; quantity: number | null; price: number | null; available: number }[];
      };
      return result.results.map((row) => ({
        snapshotAt: row.snapshot_at,
        quantity: row.quantity,
        price: row.price,
        available: row.available === 1,
      }));
    },

    async readAvailableDays(shop: string): Promise<readonly string[]> {
      const result = (await db
        .prepare('SELECT DISTINCT date(snapshot_at) AS day FROM snapshots WHERE shop = ? ORDER BY day DESC')
        .bind(shop)
        .all()) as { results: { day: string | null }[] };
      const days: string[] = [];
      for (const row of result.results) {
        if (row.day !== null) {
          days.push(row.day);
        }
      }
      return days;
    },

    async readDayCount(shop: string): Promise<number> {
      const row = (await db
        .prepare('SELECT COUNT(DISTINCT date(snapshot_at)) AS c FROM snapshots WHERE shop = ?')
        .bind(shop)
        .first()) as { c: number } | null;
      return row === null ? 0 : Number(row.c);
    },

    async readFirstSeed(shop: string): Promise<string | null> {
      const row = (await db
        .prepare('SELECT MIN(date(snapshot_at)) AS day FROM snapshots WHERE shop = ?')
        .bind(shop)
        .first()) as { day: string | null } | null;
      return row === null || row.day === null ? null : row.day;
    },
  };
}
