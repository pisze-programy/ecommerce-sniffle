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

export interface ShopNames {
  readonly productUrls: Map<string, string>;
  readonly productTitles: Map<string, string>;
  readonly variantTitles: Map<string, string>;
}

export interface Storage {
  writeSnapshot(snapshot: Snapshot): Promise<void>;
  readLatestSnapshot(shop: string): Promise<Snapshot | null>;
  readSnapshots(shop: string, from?: string, to?: string): Promise<readonly Snapshot[]>;
  readShopNames(shop: string): Promise<ShopNames>;
  upsertNames(
    shop: string,
    products: readonly { productId: string; url: string; title: string }[],
    variants: readonly { productId: string; variantId: string; title: string }[]
  ): Promise<void>;
  readShops(): Promise<string[]>;
  readMaxObservedQuantity(shop: string): Promise<number>;
  readShopDailyRange(shop: string, fromDay: string, toDay: string): Promise<readonly DailyPoint[]>;
  readPortfolioDaily(fromDay: string, toDay: string, excludeShops?: readonly string[]): Promise<readonly DailyPoint[]>;
  searchProducts(query: string): Promise<readonly { shop: string; productId: string }[]>;
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

export interface DailyPoint {
  readonly day: string;
  readonly sold: number;
  readonly soldValue: number;
  readonly restocked: number;
  readonly restockValue: number;
  readonly suspect: number;
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
  suspect_count: number;
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
  }));
}

function toProductRows(
  snapshot: Snapshot
): Array<{ shop: string; productId: string; url: string; title: string | null }> {
  const seen = new Set<string>();
  const rows: Array<{ shop: string; productId: string; url: string; title: string | null }> = [];
  for (const variant of snapshot.variants) {
    const url = variant.productUrl;
    if (url === undefined || url === null) {
      continue;
    }
    const key = `${variant.productId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const title = variant.productTitle === undefined ? null : variant.productTitle;
    rows.push({ shop: snapshot.shop, productId: variant.productId, url, title });
  }
  return rows;
}

function toVariantRows(
  snapshot: Snapshot
): Array<{ shop: string; productId: string; variantId: string; title: string }> {
  const rows: Array<{ shop: string; productId: string; variantId: string; title: string }> = [];
  for (const variant of snapshot.variants) {
    const title = variant.variantTitle;
    if (title === undefined || title === null || title.length === 0) {
      continue;
    }
    if (title === 'default' || title === 'Default Title') {
      continue;
    }
    rows.push({ shop: snapshot.shop, productId: variant.productId, variantId: variant.variantId, title });
  }
  return rows;
}

function fromRow(row: SnapshotRow): VariantState {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    price: row.price,
    regularPrice: row.regular_price,
    available: row.available === 1,
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
    suspect_count: stats.suspectCount,
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
    suspectCount: row.suspect_count,
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

function eventState(row: EventRow, quantity: number | null, price: number | null): VariantState {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    quantity,
    price,
    regularPrice: null,
    available: quantity !== null && quantity > 0,
  };
}

function fromEventRow(row: EventRow): StockEvent {
  return {
    type: row.type as StockEvent['type'],
    productId: row.product_id,
    variantId: row.variant_id,
    from:
      row.from_price === null && row.from_quantity === null ? null : eventState(row, row.from_quantity, row.from_price),
    to: row.to_price === null && row.to_quantity === null ? null : eventState(row, row.to_quantity, row.to_price),
    units: row.units,
    confidence: row.confidence as StockEvent['confidence'],
  };
}

function nameStatements(
  db: D1Like,
  products: readonly { shop: string; productId: string; url: string; title: string | null }[],
  variants: readonly { shop: string; productId: string; variantId: string; title: string }[]
): D1Statement[] {
  const statements: D1Statement[] = [];
  for (const product of products) {
    statements.push(
      db
        .prepare(
          'INSERT INTO products (shop, product_id, url, title) VALUES (?, ?, ?, ?) ON CONFLICT(shop, product_id) DO UPDATE SET url = excluded.url, title = COALESCE(excluded.title, products.title)'
        )
        .bind(product.shop, product.productId, product.url, product.title)
    );
  }
  for (const variant of variants) {
    statements.push(
      db
        .prepare(
          'INSERT INTO variants (shop, product_id, variant_id, title) VALUES (?, ?, ?, ?) ON CONFLICT(shop, variant_id) DO UPDATE SET product_id = excluded.product_id, title = excluded.title'
        )
        .bind(variant.shop, variant.productId, variant.variantId, variant.title)
    );
  }
  return statements;
}

export function createStorage(db: D1Like, logger: Logger): Storage {
  return {
    async writeSnapshot(snapshot: Snapshot): Promise<void> {
      const rows = toRow(snapshot);
      const productRows = toProductRows(snapshot);
      const variantRows = toVariantRows(snapshot);
      if (rows.length === 0) {
        return;
      }
      const statements = rows.map((row) =>
        db
          .prepare(
            'INSERT INTO snapshots (shop, snapshot_at, window, product_id, variant_id, quantity, price, regular_price, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
            row.available
          )
      );
      statements.push(...nameStatements(db, productRows, variantRows));
      try {
        await db.batch(statements);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeSnapshot failed', { shop: snapshot.shop, error: message });
        throw error;
      }
    },

    async upsertNames(
      shop: string,
      products: readonly { productId: string; url: string; title: string }[],
      variants: readonly { productId: string; variantId: string; title: string }[]
    ): Promise<void> {
      const productRows = products.map((product) => ({
        shop,
        productId: product.productId,
        url: product.url,
        title: product.title,
      }));
      const variantRows = variants.map((variant) => ({
        shop,
        productId: variant.productId,
        variantId: variant.variantId,
        title: variant.title,
      }));
      try {
        await db.batch(nameStatements(db, productRows, variantRows));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.upsertNames failed', { shop, error: message });
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

    async readShopNames(shop: string): Promise<ShopNames> {
      const products = (await db
        .prepare('SELECT product_id, url, title FROM products WHERE shop = ?')
        .bind(shop)
        .all()) as {
        results: Array<{ product_id: string; url: string; title: string | null }>;
      };
      const variants = (await db.prepare('SELECT variant_id, title FROM variants WHERE shop = ?').bind(shop).all()) as {
        results: Array<{ variant_id: string; title: string }>;
      };
      const productUrls = new Map<string, string>();
      const productTitles = new Map<string, string>();
      for (const row of products.results) {
        productUrls.set(row.product_id, row.url);
        if (row.title !== null && row.title.length > 0) {
          productTitles.set(row.product_id, row.title);
        }
      }
      const variantTitles = new Map<string, string>();
      for (const row of variants.results) {
        variantTitles.set(row.variant_id, row.title);
      }
      return { productUrls, productTitles, variantTitles };
    },

    async readSnapshots(shop: string, from?: string, to?: string): Promise<readonly Snapshot[]> {
      let query = 'SELECT * FROM snapshots WHERE shop = ?';
      const binds: Array<string | number> = [shop];
      if (from !== undefined) {
        query += ' AND snapshot_at >= ?';
        binds.push(from);
      }
      if (to !== undefined) {
        query += ' AND snapshot_at <= ?';
        binds.push(to);
      }
      query += ' ORDER BY snapshot_at';
      const result = (await db
        .prepare(query)
        .bind(...binds)
        .all()) as { results: SnapshotRow[] };
      const snapshots: Snapshot[] = [];
      let current: {
        snapshotAt: string;
        window: 'morning' | 'evening';
        variants: VariantState[];
      } | null = null;
      for (const row of result.results) {
        if (current === null || current.snapshotAt !== row.snapshot_at) {
          current = {
            snapshotAt: row.snapshot_at,
            window: row.window === 'evening' ? 'evening' : 'morning',
            variants: [],
          };
          snapshots.push({
            shop,
            snapshotAt: current.snapshotAt,
            window: current.window,
            variants: current.variants,
          });
        }
        current.variants.push(fromRow(row));
      }
      return snapshots;
    },

    async readShops(): Promise<string[]> {
      const result = (await db.prepare('SELECT DISTINCT shop FROM snapshots ORDER BY shop').all()) as {
        results: Array<{ shop: string }>;
      };
      return result.results.map((row) => row.shop);
    },

    async readMaxObservedQuantity(shop: string): Promise<number> {
      const row = (await db
        .prepare('SELECT MAX(ABS(quantity)) AS max_q FROM snapshots WHERE shop = ?')
        .bind(shop)
        .first()) as { max_q: number | null } | null;
      return row === null || row.max_q === null ? 0 : Number(row.max_q);
    },

    async readShopDailyRange(shop: string, fromDay: string, toDay: string): Promise<readonly DailyPoint[]> {
      const result = (await db
        .prepare(
          'SELECT day, units_sold, revenue, restocked, suspect_count FROM daily_stats WHERE shop = ? AND day >= ? AND day <= ? ORDER BY day'
        )
        .bind(shop, fromDay, toDay)
        .all()) as {
        results: Array<{ day: string; units_sold: number; revenue: number; restocked: number; suspect_count: number }>;
      };
      return result.results.map((row) => ({
        day: row.day,
        sold: Number(row.units_sold),
        soldValue: Number(row.revenue),
        restocked: Number(row.restocked),
        restockValue: 0,
        suspect: Number(row.suspect_count),
      }));
    },

    async readPortfolioDaily(
      fromDay: string,
      toDay: string,
      excludeShops: readonly string[] = []
    ): Promise<readonly DailyPoint[]> {
      let query =
        'SELECT day, SUM(units_sold) AS sold, SUM(revenue) AS sold_value, SUM(restocked) AS restocked FROM daily_stats WHERE day >= ? AND day <= ?';
      const binds: Array<string> = [fromDay, toDay];
      if (excludeShops.length > 0) {
        const placeholders = excludeShops.map(() => '?').join(', ');
        query += ` AND shop NOT IN (${placeholders})`;
        binds.push(...excludeShops);
      }
      query += ' GROUP BY day ORDER BY day';
      const result = (await db
        .prepare(query)
        .bind(...binds)
        .all()) as {
        results: Array<{ day: string; sold: number; sold_value: number; restocked: number }>;
      };
      return result.results.map((row) => ({
        day: row.day,
        sold: Number(row.sold),
        soldValue: Number(row.sold_value),
        restocked: Number(row.restocked),
        restockValue: 0,
        suspect: 0,
      }));
    },

    async searchProducts(query: string): Promise<readonly { shop: string; productId: string }[]> {
      if (query.length === 0) {
        return [];
      }
      const pattern = `%${query}%`;
      const result = (await db
        .prepare('SELECT shop, product_id FROM products WHERE product_id LIKE ? OR url LIKE ? OR title LIKE ? LIMIT 20')
        .bind(pattern, pattern, pattern)
        .all()) as { results: Array<{ shop: string; product_id: string }> };
      return result.results.map((row) => ({ shop: row.shop, productId: row.product_id }));
    },

    async writeDailyStats(stats: DailyStats): Promise<void> {
      const row = toStatsRow(stats);
      try {
        await db
          .prepare(
            'INSERT OR REPLACE INTO daily_stats (shop, day, units_sold, revenue, restocked, sold_out_count, promotion_count, masked_count, suspect_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            row.shop,
            row.day,
            row.units_sold,
            row.revenue,
            row.restocked,
            row.sold_out_count,
            row.promotion_count,
            row.masked_count,
            row.suspect_count
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
