import { salePrice } from './classify.js';
import type { DailyStats, StockEvent, VariantState } from './types.js';

export interface DailyStatsInput {
  readonly shop: string;
  readonly day: string;
  readonly events: readonly StockEvent[];
}

export interface AggregateDailyOptions {
  // The largest absolute quantity ever observed for the shop. Any event
  // whose unit count exceeds it is suspect (phantom diff). It is excluded
  // from the sales and restock totals and counted in suspectCount.
  readonly maxQuantity?: number;
}

export function maxAbsQuantity(variants: readonly VariantState[]): number {
  let max = 0;
  for (const variant of variants) {
    if (variant.quantity !== null) {
      const abs = Math.abs(variant.quantity);
      if (abs > max) {
        max = abs;
      }
    }
  }
  return max;
}

// An event is suspect when its unit count or its starting quantity exceeds
// the largest quantity ever observed for the shop. Such a starting quantity
// was never persisted, so the diff is a phantom. Negative quantities are
// legitimate; the absolute value is compared.
export function isSuspectEvent(event: StockEvent, maxQuantity: number): boolean {
  if (event.units > maxQuantity) {
    return true;
  }
  if (event.from !== null && event.from.quantity !== null && Math.abs(event.from.quantity) > maxQuantity) {
    return true;
  }
  return false;
}

export function aggregateDaily(input: DailyStatsInput, options: AggregateDailyOptions = {}): DailyStats {
  let unitsSold = 0;
  let revenue = 0;
  let restocked = 0;
  let soldOutCount = 0;
  let promotionCount = 0;
  let maskedCount = 0;
  let suspectCount = 0;
  let soldMinPrice: number | null = null;
  let soldMaxPrice: number | null = null;

  const countSale = (event: StockEvent): void => {
    const price = event.to === null ? 0 : salePrice(event.to);
    unitsSold += event.units;
    revenue += event.units * price;
    if (soldMinPrice === null || price < soldMinPrice) {
      soldMinPrice = price;
    }
    if (soldMaxPrice === null || price > soldMaxPrice) {
      soldMaxPrice = price;
    }
  };

  for (const event of input.events) {
    if (event.confidence === 'low') {
      maskedCount += 1;
    }
    const overCap = options.maxQuantity !== undefined && isSuspectEvent(event, options.maxQuantity);
    if (overCap) {
      suspectCount += 1;
    }
    if (event.type === 'sold') {
      if (overCap) {
        continue;
      }
      countSale(event);
      continue;
    }
    if (event.type === 'soldOut') {
      soldOutCount += 1;
      if (overCap) {
        continue;
      }
      if (event.confidence === 'exact') {
        countSale(event);
      }
      continue;
    }
    if (event.type === 'restock') {
      if (overCap) {
        continue;
      }
      restocked += event.units;
      continue;
    }
    if (event.type === 'promoStart') {
      promotionCount += 1;
      continue;
    }
  }

  const roundedRevenue = Math.round(revenue * 100) / 100;

  return {
    shop: input.shop,
    day: input.day,
    unitsSold,
    revenue: roundedRevenue,
    restocked,
    soldOutCount,
    promotionCount,
    maskedCount,
    suspectCount,
    soldMinPrice,
    soldMaxPrice,
  };
}

// The lower price bound wins for the minimum. The higher for the maximum.
// A null side is ignored. Both null means nothing sold.
function combineBounds(
  current: number | null | undefined,
  incoming: number | null | undefined,
  pickLower: boolean
): number | null {
  if (incoming === null || incoming === undefined) {
    return current === undefined ? null : current;
  }
  if (current === null || current === undefined) {
    return incoming;
  }
  return pickLower ? Math.min(current, incoming) : Math.max(current, incoming);
}

// Combine a previous daily total with a new diff. The pipeline ingests a
// shop several times per day; each diff must add to the day total, not
// replace it. The previous total may be null for the first diff of the day.
export function mergeDailyStats(prev: DailyStats | null, next: DailyStats): DailyStats {
  if (prev === null) {
    return next;
  }
  return {
    shop: prev.shop,
    day: prev.day,
    unitsSold: prev.unitsSold + next.unitsSold,
    revenue: Math.round((prev.revenue + next.revenue) * 100) / 100,
    restocked: prev.restocked + next.restocked,
    soldOutCount: prev.soldOutCount + next.soldOutCount,
    promotionCount: prev.promotionCount + next.promotionCount,
    maskedCount: prev.maskedCount + next.maskedCount,
    suspectCount: prev.suspectCount + next.suspectCount,
    soldMinPrice: combineBounds(prev.soldMinPrice, next.soldMinPrice, true),
    soldMaxPrice: combineBounds(prev.soldMaxPrice, next.soldMaxPrice, false),
  };
}
