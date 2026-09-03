import type { DailyStats, Snapshot, StockEvent, VariantState } from '@ecommerce-sniffle/analysis';
import type { Logger } from '@ecommerce-sniffle/providers';
import type {
  EntityFinancials,
  EntityKind,
  EntityRelationType,
  EntityStore,
  PersonRole,
  SocialLink,
  SocialPlatform,
} from '../entities.ts';
import type { SocialPost, SocialProfile, SocialStory } from './social/types.ts';
import type { MetaAd, MetaAdDay } from './metaads/types.ts';
import { isMetaPlatform } from './metaads/types.ts';

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all(): Promise<{ results: unknown[] }>;
  first(): Promise<unknown>;
  run(): Promise<unknown>;
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
  readEntityStore(): Promise<EntityStore>;
  upsertSocialProfile(profile: SocialProfile): Promise<void>;
  writeSocialPosts(posts: readonly SocialPost[]): Promise<void>;
  writeSocialStories(stories: readonly SocialStory[]): Promise<void>;
  readSocialProfiles(): Promise<readonly SocialProfile[]>;
  readSocialPosts(userIds: readonly string[], limit: number): Promise<readonly SocialPost[]>;
  readSocialStories(userIds: readonly string[], limit: number): Promise<readonly SocialStory[]>;
  upsertEntityFinancials(entry: EntityFinancials): Promise<void>;
  readEntityFinancials(entityId: string): Promise<EntityFinancials | null>;
  setEntityLogo(entityId: string, logoKey: string): Promise<void>;
  setEntityBg(entityId: string, bgKey: string): Promise<void>;
  setPersonAvatar(personId: string, avatarKey: string): Promise<void>;
  upsertMetaAds(ads: readonly MetaAd[]): Promise<void>;
  writeMetaAdDays(rows: readonly MetaAdDay[]): Promise<void>;
  readMetaAdsActive(pageId: string): Promise<readonly MetaAd[]>;
  readMetaAdDays(pageId: string, dayFrom: string): Promise<readonly MetaAdDay[]>;
  endMetaAds(pageId: string, stopDate: string, beforeDay: string): Promise<number>;
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
  // The price bounds of a unit sold that day. Null when nothing sold.
  readonly soldMinPrice?: number | null;
  readonly soldMaxPrice?: number | null;
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
  sold_min_price: number | null;
  sold_max_price: number | null;
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

interface SocialPostRow {
  platform: string;
  id: string;
  user_id: string;
  shortcode: string;
  media_type: string;
  is_reel: number;
  taken_at: string;
  caption: string | null;
  media_urls: string;
  is_paid_partnership: number;
  is_commercial: number;
  tagged_users: string;
  r2_key: string | null;
  fetched_at: string;
}

interface SocialStoryRow {
  platform: string;
  id: string;
  user_id: string;
  media_type: string;
  media_urls: string;
  taken_at: string;
  expiring_at: string;
  is_paid_partnership: number;
  is_commercial: number;
  has_cta_sticker: number;
  mentions: string;
  r2_key: string | null;
  fetched_at: string;
}

interface MetaAdRow {
  ad_archive_id: string;
  page_id: string;
  entity_id: string | null;
  ad_creation_time: string | null;
  start_date: string | null;
  stop_date: string | null;
  creative_body: string | null;
  link_title: string | null;
  link_caption: string | null;
  link_description: string | null;
  publisher_platforms: string | null;
  languages: string | null;
  eu_total_reach: number | null;
  reach_by_location: string | null;
  reach_breakdown: string | null;
  target_ages: string | null;
  target_gender: string | null;
  target_locations: string | null;
  beneficiary_payers: string | null;
  creative_hash: string | null;
  first_seen: string;
  last_seen: string;
}

function fromMetaAdRow(row: MetaAdRow): MetaAd {
  return {
    adArchiveId: row.ad_archive_id,
    pageId: row.page_id,
    entityId: row.entity_id,
    adCreationTime: row.ad_creation_time,
    startDate: row.start_date,
    stopDate: row.stop_date,
    creativeBody: jsonArray(row.creative_body),
    linkTitle: jsonArray(row.link_title),
    linkCaption: jsonArray(row.link_caption),
    linkDescription: jsonArray(row.link_description),
    publisherPlatforms: jsonArray(row.publisher_platforms).filter(isMetaPlatform),
    languages: jsonArray(row.languages),
    euTotalReach: row.eu_total_reach,
    reachByLocation: jsonParse(row.reach_by_location) ?? [],
    reachBreakdown: jsonParse(row.reach_breakdown) ?? [],
    targetAges: jsonArray(row.target_ages),
    targetGender: row.target_gender,
    targetLocations: jsonParse(row.target_locations) ?? [],
    beneficiaryPayers: jsonParse(row.beneficiary_payers) ?? [],
    creativeHash: row.creative_hash ?? '',
  };
}

function fromSocialPostRow(row: SocialPostRow): SocialPost {
  return {
    platform: row.platform as 'instagram',
    id: row.id,
    userId: row.user_id,
    shortcode: row.shortcode,
    type: row.media_type as 'photo' | 'video' | 'carousel',
    isReel: row.is_reel === 1,
    takenAt: row.taken_at,
    caption: row.caption,
    mediaUrls: jsonArray(row.media_urls),
    isPaidPartnership: row.is_paid_partnership === 1,
    isCommercial: row.is_commercial === 1,
    taggedUsers: jsonArray(row.tagged_users),
    r2Key: row.r2_key,
    fetchedAt: row.fetched_at,
  };
}

function fromSocialStoryRow(row: SocialStoryRow): SocialStory {
  return {
    platform: row.platform as 'instagram',
    id: row.id,
    userId: row.user_id,
    mediaType: row.media_type as 'photo' | 'video',
    mediaUrls: jsonArray(row.media_urls),
    takenAt: row.taken_at,
    expiringAt: row.expiring_at,
    isPaidPartnership: row.is_paid_partnership === 1,
    isCommercial: row.is_commercial === 1,
    hasCtaSticker: row.has_cta_sticker === 1,
    mentions: jsonArray(row.mentions),
    r2Key: row.r2_key,
    fetchedAt: row.fetched_at,
  };
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
    sold_min_price: stats.soldMinPrice === undefined ? null : stats.soldMinPrice,
    sold_max_price: stats.soldMaxPrice === undefined ? null : stats.soldMaxPrice,
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
    soldMinPrice: row.sold_min_price,
    soldMaxPrice: row.sold_max_price,
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

function jsonString(value: readonly string[]): string {
  return JSON.stringify(value);
}

function jsonArray(value: string | null): readonly string[] {
  if (value === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function jsonParse<T>(value: string | null): T | null {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function jsonObjectString(value: unknown): string | null {
  return JSON.stringify(value);
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
          'SELECT day, units_sold, revenue, restocked, suspect_count, sold_min_price, sold_max_price FROM daily_stats WHERE shop = ? AND day >= ? AND day <= ? ORDER BY day'
        )
        .bind(shop, fromDay, toDay)
        .all()) as {
        results: Array<{
          day: string;
          units_sold: number;
          revenue: number;
          restocked: number;
          suspect_count: number;
          sold_min_price: number | null;
          sold_max_price: number | null;
        }>;
      };
      return result.results.map((row) => ({
        day: row.day,
        sold: Number(row.units_sold),
        soldValue: Number(row.revenue),
        restocked: Number(row.restocked),
        restockValue: 0,
        suspect: Number(row.suspect_count),
        soldMinPrice: row.sold_min_price === null ? null : Number(row.sold_min_price),
        soldMaxPrice: row.sold_max_price === null ? null : Number(row.sold_max_price),
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
            'INSERT OR REPLACE INTO daily_stats (shop, day, units_sold, revenue, restocked, sold_out_count, promotion_count, masked_count, suspect_count, sold_min_price, sold_max_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
            row.suspect_count,
            row.sold_min_price,
            row.sold_max_price
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

    async readEntityStore(): Promise<EntityStore> {
      const entityRows = (await db
        .prepare(
          'SELECT id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, cpm_min, cpm_max, logo_key, bg_key FROM entities ORDER BY id'
        )
        .all()) as {
        results: Array<{
          id: string;
          name: string;
          kind: string;
          krs: string | null;
          regon: string | null;
          nip: string | null;
          bizraport_url: string | null;
          meta_page_id: string | null;
          cpm_min: number | null;
          cpm_max: number | null;
          logo_key: string | null;
          bg_key: string | null;
        }>;
      };
      const personRows = (await db
        .prepare('SELECT id, name, linkedin_url, avatar_key FROM persons ORDER BY id')
        .all()) as {
        results: Array<{ id: string; name: string; linkedin_url: string | null; avatar_key: string | null }>;
      };
      const socialRows = (await db
        .prepare('SELECT owner_kind, owner_id, platform, handle, url FROM socials')
        .all()) as {
        results: Array<{ owner_kind: string; owner_id: string; platform: string; handle: string; url: string }>;
      };
      const relationRows = (await db
        .prepare('SELECT person_id, entity_id, role, label, from_day, to_day FROM person_relations')
        .all()) as {
        results: Array<{
          person_id: string;
          entity_id: string;
          role: string;
          label: string;
          from_day: string | null;
          to_day: string | null;
        }>;
      };
      const entityRelationRows = (await db
        .prepare('SELECT from_entity_id, to_entity_id, type, label, from_day, to_day FROM entity_relations')
        .all()) as {
        results: Array<{
          from_entity_id: string;
          to_entity_id: string;
          type: string;
          label: string;
          from_day: string | null;
          to_day: string | null;
        }>;
      };
      const socialsByOwner = new Map<string, SocialLink[]>();
      for (const row of socialRows.results) {
        const key = `${row.owner_kind}:${row.owner_id}`;
        const list = socialsByOwner.get(key) ?? [];
        list.push({ platform: row.platform as SocialPlatform, handle: row.handle, url: row.url });
        socialsByOwner.set(key, list);
      }
      const entities = entityRows.results.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind as EntityKind,
        krs: row.krs,
        regon: row.regon,
        nip: row.nip,
        bizraportUrl: row.bizraport_url,
        metaPageId: row.meta_page_id,
        cpmOverride: row.cpm_min === null || row.cpm_max === null ? null : { min: row.cpm_min, max: row.cpm_max },
        logoKey: row.logo_key,
        bgKey: row.bg_key,
        socials: socialsByOwner.get(`entity:${row.id}`) ?? [],
      }));
      const persons = personRows.results.map((row) => ({
        id: row.id,
        name: row.name,
        linkedinUrl: row.linkedin_url,
        avatarKey: row.avatar_key,
        socials: socialsByOwner.get(`person:${row.id}`) ?? [],
      }));
      const personRelations = relationRows.results.map((row) => ({
        personId: row.person_id,
        entityId: row.entity_id,
        role: row.role as PersonRole,
        from: row.from_day,
        to: row.to_day,
      }));
      const entityRelations = entityRelationRows.results.map((row) => ({
        fromEntityId: row.from_entity_id,
        toEntityId: row.to_entity_id,
        type: row.type as EntityRelationType,
        label: row.label,
        from: row.from_day,
        to: row.to_day,
      }));
      return { entities, persons, personRelations, entityRelations };
    },

    async upsertSocialProfile(profile: SocialProfile): Promise<void> {
      try {
        await db
          .prepare('INSERT OR REPLACE INTO social_profiles (platform, user_id, handle, full_name) VALUES (?, ?, ?, ?)')
          .bind(profile.platform, profile.userId, profile.handle, profile.fullName)
          .run();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.upsertSocialProfile failed', { userId: profile.userId, error: message });
        throw error;
      }
    },

    async writeSocialPosts(posts: readonly SocialPost[]): Promise<void> {
      if (posts.length === 0) {
        return;
      }
      try {
        await db.batch(
          posts.map((post) =>
            db
              .prepare(
                'INSERT OR REPLACE INTO social_posts (platform, id, user_id, shortcode, media_type, is_reel, taken_at, caption, media_urls, is_paid_partnership, is_commercial, tagged_users, r2_key, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              )
              .bind(
                post.platform,
                post.id,
                post.userId,
                post.shortcode,
                post.type,
                post.isReel ? 1 : 0,
                post.takenAt,
                post.caption,
                jsonString(post.mediaUrls),
                post.isPaidPartnership ? 1 : 0,
                post.isCommercial ? 1 : 0,
                jsonString(post.taggedUsers),
                post.r2Key,
                post.fetchedAt
              )
          )
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeSocialPosts failed', { count: posts.length, error: message });
        throw error;
      }
    },

    async writeSocialStories(stories: readonly SocialStory[]): Promise<void> {
      if (stories.length === 0) {
        return;
      }
      try {
        await db.batch(
          stories.map((story) =>
            db
              .prepare(
                'INSERT OR REPLACE INTO social_stories (platform, id, user_id, media_type, media_urls, taken_at, expiring_at, is_paid_partnership, is_commercial, has_cta_sticker, mentions, r2_key, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              )
              .bind(
                story.platform,
                story.id,
                story.userId,
                story.mediaType,
                jsonString(story.mediaUrls),
                story.takenAt,
                story.expiringAt,
                story.isPaidPartnership ? 1 : 0,
                story.isCommercial ? 1 : 0,
                story.hasCtaSticker ? 1 : 0,
                jsonString(story.mentions),
                story.r2Key,
                story.fetchedAt
              )
          )
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeSocialStories failed', { count: stories.length, error: message });
        throw error;
      }
    },

    async readSocialProfiles(): Promise<readonly SocialProfile[]> {
      const result = (await db.prepare('SELECT platform, user_id, handle, full_name FROM social_profiles').all()) as {
        results: Array<{ platform: string; user_id: string; handle: string; full_name: string | null }>;
      };
      return result.results.map((row) => ({
        platform: row.platform as 'instagram',
        userId: row.user_id,
        handle: row.handle,
        fullName: row.full_name,
      }));
    },

    async readSocialPosts(userIds: readonly string[], limit: number): Promise<readonly SocialPost[]> {
      if (userIds.length === 0) {
        return [];
      }
      const placeholders = userIds.map(() => '?').join(',');
      const result = (await db
        .prepare(
          `SELECT platform, id, user_id, shortcode, media_type, is_reel, taken_at, caption, media_urls, is_paid_partnership, is_commercial, tagged_users, r2_key, fetched_at FROM social_posts WHERE user_id IN (${placeholders}) ORDER BY taken_at DESC LIMIT ?`
        )
        .bind(...userIds, limit)
        .all()) as { results: SocialPostRow[] };
      return result.results.map(fromSocialPostRow);
    },

    async readSocialStories(userIds: readonly string[], limit: number): Promise<readonly SocialStory[]> {
      if (userIds.length === 0) {
        return [];
      }
      const placeholders = userIds.map(() => '?').join(',');
      const result = (await db
        .prepare(
          `SELECT platform, id, user_id, media_type, media_urls, taken_at, expiring_at, is_paid_partnership, is_commercial, has_cta_sticker, mentions, r2_key, fetched_at FROM social_stories WHERE user_id IN (${placeholders}) ORDER BY taken_at DESC LIMIT ?`
        )
        .bind(...userIds, limit)
        .all()) as { results: SocialStoryRow[] };
      return result.results.map(fromSocialStoryRow);
    },

    async upsertEntityFinancials(entry: EntityFinancials): Promise<void> {
      try {
        await db
          .prepare(
            'INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            entry.entityId,
            entry.year,
            entry.assets,
            entry.revenue,
            entry.netProfit,
            entry.valuation,
            entry.fetchedAt
          )
          .run();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.upsertEntityFinancials failed', { entityId: entry.entityId, error: message });
        throw error;
      }
    },

    async readEntityFinancials(entityId: string): Promise<EntityFinancials | null> {
      const row = (await db
        .prepare(
          'SELECT entity_id, year, assets, revenue, net_profit, valuation, fetched_at FROM entity_financials WHERE entity_id = ?'
        )
        .bind(entityId)
        .first()) as {
        entity_id: string;
        year: number | null;
        assets: number | null;
        revenue: number | null;
        net_profit: number | null;
        valuation: number | null;
        fetched_at: string;
      } | null;
      if (row === null) {
        return null;
      }
      return {
        entityId: row.entity_id,
        year: row.year,
        assets: row.assets,
        revenue: row.revenue,
        netProfit: row.net_profit,
        valuation: row.valuation,
        fetchedAt: row.fetched_at,
      };
    },

    async setEntityLogo(entityId: string, logoKey: string): Promise<void> {
      await db.prepare('UPDATE entities SET logo_key = ? WHERE id = ?').bind(logoKey, entityId).run();
    },

    async setEntityBg(entityId: string, bgKey: string): Promise<void> {
      await db.prepare('UPDATE entities SET bg_key = ? WHERE id = ?').bind(bgKey, entityId).run();
    },

    async setPersonAvatar(personId: string, avatarKey: string): Promise<void> {
      await db.prepare('UPDATE persons SET avatar_key = ? WHERE id = ?').bind(avatarKey, personId).run();
    },

    async upsertMetaAds(ads: readonly MetaAd[]): Promise<void> {
      if (ads.length === 0) {
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      try {
        await db.batch(
          ads.map((ad) =>
            db
              .prepare(
                'INSERT INTO meta_ads (ad_archive_id, page_id, entity_id, ad_creation_time, start_date, stop_date, creative_body, link_title, link_caption, link_description, publisher_platforms, languages, eu_total_reach, reach_by_location, reach_breakdown, target_ages, target_gender, target_locations, beneficiary_payers, creative_hash, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT first_seen FROM meta_ads WHERE ad_archive_id = ?), ?), ?) ON CONFLICT(ad_archive_id) DO UPDATE SET page_id = excluded.page_id, entity_id = excluded.entity_id, ad_creation_time = excluded.ad_creation_time, start_date = excluded.start_date, stop_date = excluded.stop_date, creative_body = excluded.creative_body, link_title = excluded.link_title, link_caption = excluded.link_caption, link_description = excluded.link_description, publisher_platforms = excluded.publisher_platforms, languages = excluded.languages, eu_total_reach = excluded.eu_total_reach, reach_by_location = excluded.reach_by_location, reach_breakdown = excluded.reach_breakdown, target_ages = excluded.target_ages, target_gender = excluded.target_gender, target_locations = excluded.target_locations, beneficiary_payers = excluded.beneficiary_payers, creative_hash = excluded.creative_hash, last_seen = excluded.last_seen'
              )
              .bind(
                ad.adArchiveId,
                ad.pageId,
                ad.entityId,
                ad.adCreationTime,
                ad.startDate,
                ad.stopDate,
                jsonObjectString(ad.creativeBody),
                jsonObjectString(ad.linkTitle),
                jsonObjectString(ad.linkCaption),
                jsonObjectString(ad.linkDescription),
                jsonObjectString(ad.publisherPlatforms),
                jsonObjectString(ad.languages),
                ad.euTotalReach,
                jsonObjectString(ad.reachByLocation),
                jsonObjectString(ad.reachBreakdown),
                jsonObjectString(ad.targetAges),
                ad.targetGender,
                jsonObjectString(ad.targetLocations),
                jsonObjectString(ad.beneficiaryPayers),
                ad.creativeHash,
                ad.adArchiveId,
                today,
                today
              )
          )
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.upsertMetaAds failed', { count: ads.length, error: message });
        throw error;
      }
    },

    async writeMetaAdDays(rows: readonly MetaAdDay[]): Promise<void> {
      if (rows.length === 0) {
        return;
      }
      try {
        await db.batch(
          rows.map((row) =>
            db
              .prepare(
                'INSERT OR REPLACE INTO meta_ad_days (day, ad_archive_id, page_id, eu_total_reach) VALUES (?, ?, ?, ?)'
              )
              .bind(row.day, row.adArchiveId, row.pageId, row.euTotalReach)
          )
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.writeMetaAdDays failed', { count: rows.length, error: message });
        throw error;
      }
    },

    async readMetaAdsActive(pageId: string): Promise<readonly MetaAd[]> {
      try {
        const result = (await db
          .prepare(
            'SELECT ad_archive_id, page_id, entity_id, ad_creation_time, start_date, stop_date, creative_body, link_title, link_caption, link_description, publisher_platforms, languages, eu_total_reach, reach_by_location, reach_breakdown, target_ages, target_gender, target_locations, beneficiary_payers, creative_hash, first_seen, last_seen FROM meta_ads WHERE page_id = ? AND stop_date IS NULL ORDER BY eu_total_reach DESC'
          )
          .bind(pageId)
          .all()) as { results: MetaAdRow[] };
        return result.results.map(fromMetaAdRow);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.readMetaAdsActive failed', { pageId, error: message });
        throw error;
      }
    },

    async readMetaAdDays(pageId: string, dayFrom: string): Promise<readonly MetaAdDay[]> {
      try {
        const result = (await db
          .prepare(
            'SELECT day, ad_archive_id, page_id, eu_total_reach FROM meta_ad_days WHERE page_id = ? AND day >= ? ORDER BY day'
          )
          .bind(pageId, dayFrom)
          .all()) as {
          results: Array<{ day: string; ad_archive_id: string; page_id: string; eu_total_reach: number }>;
        };
        return result.results.map((row) => ({
          day: row.day,
          adArchiveId: row.ad_archive_id,
          pageId: row.page_id,
          euTotalReach: row.eu_total_reach,
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.readMetaAdDays failed', { pageId, error: message });
        throw error;
      }
    },

    async endMetaAds(pageId: string, stopDate: string, beforeDay: string): Promise<number> {
      try {
        const result = (await db
          .prepare('UPDATE meta_ads SET stop_date = ? WHERE page_id = ? AND stop_date IS NULL AND last_seen < ?')
          .bind(stopDate, pageId, beforeDay)
          .run()) as { meta?: { changes?: number } };
        return result.meta?.changes ?? 0;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('storage.endMetaAds failed', { pageId, error: message });
        throw error;
      }
    },
  };
}
