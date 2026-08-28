import type { Provider } from '@ecommerce-sniffle/providers';
import {
  aggregateDaily,
  catalogToSnapshot,
  currentWindow,
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
}

export async function storeSnapshot(storage: Storage, snapshot: Snapshot, logger: Logger): Promise<PipelineResult> {
  const previous = await storage.readLatestSnapshot(snapshot.shop);
  await storage.writeSnapshot(snapshot);
  if (previous === null) {
    logger.info('pipeline.seeded', { shop: snapshot.shop, variants: snapshot.variants.length });
    return { shop: snapshot.shop, snapshotAt: snapshot.snapshotAt, seeded: true, events: 0, stats: null };
  }
  const events: readonly StockEvent[] = diffSnapshots(previous, snapshot);
  const day = snapshot.snapshotAt.slice(0, 10);
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

export async function runShopPipeline(provider: Provider, storage: Storage, logger: Logger): Promise<PipelineResult> {
  const shop = provider.config.domain;
  logger.info('pipeline.fetchCatalog', { providerId: provider.config.id, shop });
  const catalog = await provider.fetchCatalog();
  const snapshotAt = new Date().toISOString();
  const snapshot = catalogToSnapshot(catalog, currentWindow(), snapshotAt);
  return storeSnapshot(storage, snapshot, logger);
}
