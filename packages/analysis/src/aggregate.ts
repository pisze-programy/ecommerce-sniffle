import { salePrice } from './classify.js';
import type { DailyStats, StockEvent } from './types.js';

export interface DailyStatsInput {
  readonly shop: string;
  readonly day: string;
  readonly events: readonly StockEvent[];
}

export function aggregateDaily(input: DailyStatsInput): DailyStats {
  let unitsSold = 0;
  let revenue = 0;
  let restocked = 0;
  let soldOutCount = 0;
  let promotionCount = 0;
  let maskedCount = 0;

  for (const event of input.events) {
    if (event.type === 'sold') {
      const price = event.to === null ? 0 : salePrice(event.to);
      unitsSold += event.units;
      revenue += event.units * price;
      continue;
    }
    if (event.type === 'soldOut') {
      soldOutCount += 1;
      if (event.confidence === 'exact') {
        const price = event.to === null ? 0 : salePrice(event.to);
        unitsSold += event.units;
        revenue += event.units * price;
      }
      continue;
    }
    if (event.type === 'restock') {
      restocked += event.units;
      maskedCount += 1;
      continue;
    }
    if (event.type === 'promoStart') {
      promotionCount += 1;
      continue;
    }
  }

  return {
    shop: input.shop,
    day: input.day,
    unitsSold,
    revenue,
    restocked,
    soldOutCount,
    promotionCount,
    maskedCount,
  };
}
