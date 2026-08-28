import { diffSnapshots } from './diff.js';
import { salePrice } from './classify.js';
import { isCountdownShop } from './countdown.js';
import { isSuspectEvent } from './aggregate.js';
import type { Snapshot } from './types.js';

export interface TopProduct {
  readonly productId: string;
  readonly itemsSold: number;
  readonly salesValue: number;
  readonly countdown: boolean;
}

export interface TopProductsOptions {
  readonly maxQuantity?: number;
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
}

interface MutableTop {
  itemsSold: number;
  salesValue: number;
  countdown: boolean;
}

export function topSellingProducts(
  snapshots: readonly Snapshot[],
  options: TopProductsOptions = {}
): readonly TopProduct[] {
  const limit = options.limit === undefined ? 20 : options.limit;
  const filtered = snapshots.filter((snapshot) => {
    if (options.from !== undefined && snapshot.snapshotAt < options.from) {
      return false;
    }
    if (options.to !== undefined && snapshot.snapshotAt > options.to) {
      return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => (a.snapshotAt < b.snapshotAt ? -1 : 1));
  const map = new Map<string, MutableTop>();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev === undefined || curr === undefined) {
      continue;
    }
    const events = diffSnapshots(prev, curr);
    for (const event of events) {
      if (event.type !== 'sold' && !(event.type === 'soldOut' && event.confidence === 'exact')) {
        continue;
      }
      if (options.maxQuantity !== undefined && isSuspectEvent(event, options.maxQuantity)) {
        continue;
      }
      const price = event.to === null ? 0 : salePrice(event.to);
      const value = event.units * price;
      let entry = map.get(event.productId);
      if (entry === undefined) {
        entry = { itemsSold: 0, salesValue: 0, countdown: isCountdownShop(curr.shop) };
        map.set(event.productId, entry);
      }
      entry.itemsSold += event.units;
      entry.salesValue += value;
    }
  }
  return [...map.entries()]
    .map(([productId, entry]) => ({
      productId,
      itemsSold: entry.itemsSold,
      salesValue: Math.round(entry.salesValue * 100) / 100,
      countdown: entry.countdown,
    }))
    .sort((a, b) => b.salesValue - a.salesValue)
    .slice(0, limit);
}
