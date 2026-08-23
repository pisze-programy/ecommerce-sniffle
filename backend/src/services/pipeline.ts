import type { Catalog, Provider, Variant } from "@ecommerce-sniffle/providers";
import { aggregateDaily, diffSnapshots } from "@ecommerce-sniffle/analysis";
import type { DailyStats, Snapshot, SnapshotWindow, StockEvent, VariantState } from "@ecommerce-sniffle/analysis";
import type { Logger } from "@ecommerce-sniffle/providers";
import type { Storage } from "../services/storage.ts";

export interface PipelineResult {
  readonly shop: string;
  readonly snapshotAt: string;
  readonly seeded: boolean;
  readonly events: number;
  readonly stats: DailyStats | null;
}

function currentWindow(): SnapshotWindow {
  const hour = new Date().getUTCHours();
  if (hour < 12) {
    return "morning";
  }
  return "evening";
}

function variantToState(productId: string, variant: Variant): VariantState {
  return {
    productId,
    variantId: variant.id,
    quantity: variant.quantity,
    price: variant.price.amount,
    regularPrice: variant.regularPrice === null ? null : variant.regularPrice.amount,
    available: variant.available,
  };
}

export function catalogToSnapshot(catalog: Catalog, window: SnapshotWindow, snapshotAt: string): Snapshot {
  const variants: VariantState[] = [];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variants.push(variantToState(product.id, variant));
    }
  }
  return {
    shop: catalog.domain,
    snapshotAt,
    window,
    variants,
  };
}

export async function runShopPipeline(provider: Provider, storage: Storage, logger: Logger): Promise<PipelineResult> {
  const shop = provider.config.domain;
  logger.info("pipeline.fetchCatalog", { providerId: provider.config.id, shop });
  const catalog = await provider.fetchCatalog();

  const previous = await storage.readLatestSnapshot(shop);
  const snapshotAt = new Date().toISOString();
  const snapshot = catalogToSnapshot(catalog, currentWindow(), snapshotAt);
  await storage.writeSnapshot(snapshot);

  if (previous === null) {
    logger.info("pipeline.seeded", { providerId: provider.config.id, shop, variants: snapshot.variants.length });
    return { shop, snapshotAt, seeded: true, events: 0, stats: null };
  }

  const events: readonly StockEvent[] = diffSnapshots(previous, snapshot);
  const day = snapshotAt.slice(0, 10);
  await storage.writeEvents(shop, day, snapshotAt, events);
  const stats = aggregateDaily({ shop, day, events });
  await storage.writeDailyStats(stats);

  logger.info("pipeline.finished", {
    providerId: provider.config.id,
    shop,
    events: events.length,
    unitsSold: stats.unitsSold,
  });

  return { shop, snapshotAt, seeded: false, events: events.length, stats };
}
