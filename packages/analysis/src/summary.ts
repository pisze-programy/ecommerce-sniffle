import { isCountdownShop } from './countdown.js';
import type { Snapshot } from './types.js';

export const SENTINEL_QTY = 99999;

export interface ShopBias {
  // Variants whose quantity is at or above the sentinel threshold. Such
  // quantities are a countdown marker, not real stock.
  readonly sentinelVariants: number;
  readonly countdown: boolean;
}

export interface ShopSummary {
  readonly shop: string;
  readonly snapshotAt: string | null;
  readonly totalItems: number;
  readonly totalValue: number;
  readonly variantCount: number;
  readonly uniqueProducts: number;
  readonly meanPrice: number | null;
  readonly medianPrice: number | null;
  readonly bias: ShopBias;
}

function median(prices: readonly number[]): number | null {
  const size = prices.length;
  if (size === 0) {
    return null;
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(size / 2);
  const center = sorted[mid];
  if (center === undefined) {
    return null;
  }
  if (size % 2 === 1) {
    return center;
  }
  const lower = sorted[mid - 1];
  if (lower === undefined) {
    return null;
  }
  return Math.round((lower + center) * 50) / 100;
}

export function calculateShopSummary(snapshots: readonly Snapshot[]): ShopSummary {
  const latest = snapshots.length === 0 ? undefined : snapshots[snapshots.length - 1];
  const variants = latest === undefined ? [] : latest.variants;

  let totalItems = 0;
  let totalValue = 0;
  let sentinelVariants = 0;
  let sumPrice = 0;
  let priceCount = 0;
  const prices: number[] = [];
  const products = new Set<string>();

  for (const variant of variants) {
    products.add(variant.productId);
    if (variant.quantity !== null) {
      totalItems += variant.quantity;
      if (variant.quantity >= SENTINEL_QTY) {
        sentinelVariants += 1;
      }
    }
    if (variant.quantity !== null && variant.price !== null) {
      totalValue += variant.quantity * variant.price;
    }
    if (variant.price !== null) {
      sumPrice += variant.price;
      priceCount += 1;
      prices.push(variant.price);
    }
  }

  const meanPrice = priceCount === 0 ? null : Math.round((sumPrice / priceCount) * 100) / 100;
  const medianPrice = median(prices);

  const shop = latest === undefined ? '' : latest.shop;
  const snapshotAt = latest === undefined ? null : latest.snapshotAt;
  const countdown = latest !== undefined && isCountdownShop(latest.shop);

  return {
    shop,
    snapshotAt,
    totalItems,
    totalValue: Math.round(totalValue * 100) / 100,
    variantCount: variants.length,
    uniqueProducts: products.size,
    meanPrice,
    medianPrice,
    bias: {
      sentinelVariants,
      countdown,
    },
  };
}
