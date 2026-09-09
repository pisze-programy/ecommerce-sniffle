import type { Provider } from '@ecommerce-sniffle/providers';
import {
  aggregateDaily,
  catalogToSnapshot,
  diffSnapshots,
  maxAbsQuantity,
  mergeDailyStats,
} from '@ecommerce-sniffle/analysis';
import type { DailyStats, Snapshot, StockEvent } from '@ecommerce-sniffle/analysis';
import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from '../services/storage.ts';

export interface PipelineResult {
  readonly shop: string;
  readonly snapshotAt: string;
  readonly seeded: boolean;
  readonly events: number;
  readonly stats: DailyStats | null;
  readonly rejected?: boolean;
  readonly maskedCount?: number;
  readonly gapped?: boolean;
}

// The calendar days between two ISO snapshots. Same day is zero.
// One full day without a seed makes the value two.
function calendarDayGap(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export async function storeSnapshot(storage: Storage, snapshot: Snapshot, logger: Logger): Promise<PipelineResult> {
  const previous = await storage.readLatestSnapshot(snapshot.shop);

  // A run where every available variant is masked is not a valid seed.
  // The shop returned no counts (for example the proxy or the clamp
  // failed). Storing it makes the real stock look empty and poisons the
  // next diff. Keep the previous snapshot as the latest instead.
  const tracked = snapshot.variants.filter((variant) => variant.quantity !== null);
  const fullyMasked =
    snapshot.variants.length > 0 && tracked.length === 0 && snapshot.variants.some((variant) => variant.available);
  if (fullyMasked) {
    logger.warn('pipeline.rejected', {
      shop: snapshot.shop,
      variants: snapshot.variants.length,
      reason: 'fully-masked',
    });
    return {
      shop: snapshot.shop,
      snapshotAt: snapshot.snapshotAt,
      seeded: false,
      events: 0,
      stats: null,
      rejected: true,
      maskedCount: snapshot.variants.length,
    };
  }

  await storage.writeSnapshot(snapshot);
  if (previous === null) {
    logger.info('pipeline.seeded', { shop: snapshot.shop, variants: snapshot.variants.length });
    return { shop: snapshot.shop, snapshotAt: snapshot.snapshotAt, seeded: true, events: 0, stats: null };
  }

  const events: readonly StockEvent[] = diffSnapshots(previous, snapshot);
  const day = snapshot.snapshotAt.slice(0, 10);
  const gapDays = calendarDayGap(previous.snapshotAt, snapshot.snapshotAt);

  if (gapDays > 1) {
    // A missed seed makes the diff span several calendar days. The
    // whole change cannot be claimed as one day of activity. Write the
    // stats with every event suspect so the day stays visible but the
    // sold and restock totals stay zero.
    const suspectStats = aggregateDaily({ shop: snapshot.shop, day, events }, { maxQuantity: 0 });
    const existing = await storage.readDailyStats(snapshot.shop, day);
    const stats = mergeDailyStats(existing, suspectStats);
    await storage.writeDailyStats(stats);
    logger.warn('pipeline.gap', { shop: snapshot.shop, gapDays, events: events.length });
    return {
      shop: snapshot.shop,
      snapshotAt: snapshot.snapshotAt,
      seeded: false,
      events: 0,
      stats,
      gapped: true,
    };
  }

  await storage.writeEvents(snapshot.shop, day, snapshot.snapshotAt, events);
  const maxQuantity = Math.max(maxAbsQuantity(previous.variants), maxAbsQuantity(snapshot.variants));
  const diffStats = aggregateDaily({ shop: snapshot.shop, day, events }, { maxQuantity });
  const existing = await storage.readDailyStats(snapshot.shop, day);
  const stats = mergeDailyStats(existing, diffStats);
  await storage.writeDailyStats(stats);
  logger.info('pipeline.finished', {
    shop: snapshot.shop,
    events: events.length,
    unitsSold: stats.unitsSold,
  });
  return { shop: snapshot.shop, snapshotAt: snapshot.snapshotAt, seeded: false, events: events.length, stats };
}

export async function runShopPipeline(
  provider: Provider,
  storage: Storage,
  logger: Logger,
  window: string
): Promise<PipelineResult> {
  const shop = provider.config.domain;
  logger.info('pipeline.fetchCatalog', { providerId: provider.config.id, shop });
  const catalog = await provider.fetchCatalog();
  const snapshotAt = new Date().toISOString();
  const snapshot = catalogToSnapshot(catalog, window, snapshotAt);
  return storeSnapshot(storage, snapshot, logger);
}
