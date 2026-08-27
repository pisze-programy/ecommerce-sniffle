import type { StockEvent } from '@ecommerce-sniffle/analysis';

export interface ProductChangeAggregate {
  readonly productId: string;
  readonly sold: number;
  readonly restocked: number;
  readonly soldOut: number;
  readonly backInStock: number;
  readonly promo: number;
  readonly variants: readonly StockEvent[];
}

export interface SeedStats {
  readonly sold: number;
  readonly restocked: number;
  readonly soldOut: number;
  readonly backInStock: number;
  readonly promo: number;
}

interface MutableAggregate {
  productId: string;
  sold: number;
  restocked: number;
  soldOut: number;
  backInStock: number;
  promo: number;
  variants: StockEvent[];
}

function addType(
  stats: { sold: number; restocked: number; soldOut: number; backInStock: number; promo: number },
  event: StockEvent
): void {
  switch (event.type) {
    case 'sold':
      stats.sold += event.units;
      break;
    case 'restock':
      stats.restocked += event.units;
      break;
    case 'soldOut':
      stats.soldOut += 1;
      break;
    case 'backInStock':
      stats.backInStock += 1;
      break;
    case 'promoStart':
    case 'promoEnd':
      stats.promo += 1;
      break;
  }
}

// Group the per-variant events by product. The product row holds the
// sum of units per type. The variants stay for the sub-table.
export function aggregateProductEvents(events: readonly StockEvent[]): readonly ProductChangeAggregate[] {
  const map = new Map<string, MutableAggregate>();
  for (const event of events) {
    let aggregate = map.get(event.productId);
    if (aggregate === undefined) {
      aggregate = {
        productId: event.productId,
        sold: 0,
        restocked: 0,
        soldOut: 0,
        backInStock: 0,
        promo: 0,
        variants: [],
      };
      map.set(event.productId, aggregate);
    }
    addType(aggregate, event);
    aggregate.variants.push(event);
  }
  return [...map.values()]
    .map((aggregate) => ({
      productId: aggregate.productId,
      sold: aggregate.sold,
      restocked: aggregate.restocked,
      soldOut: aggregate.soldOut,
      backInStock: aggregate.backInStock,
      promo: aggregate.promo,
      variants: aggregate.variants,
    }))
    .sort(
      (a, b) => b.sold + b.restocked + b.soldOut + b.backInStock - (a.sold + a.restocked + a.soldOut + a.backInStock)
    );
}

export function seedStats(events: readonly StockEvent[]): SeedStats {
  const stats: SeedStats = { sold: 0, restocked: 0, soldOut: 0, backInStock: 0, promo: 0 };
  for (const event of events) {
    addType(stats, event);
  }
  return stats;
}

export function eventTypeLabel(type: StockEvent['type']): string {
  switch (type) {
    case 'sold':
      return 'sprzedane';
    case 'restock':
      return 'dostawione';
    case 'soldOut':
      return 'wyprzedane';
    case 'backInStock':
      return 'powrót';
    case 'promoStart':
      return 'promo start';
    case 'promoEnd':
      return 'promo koniec';
    case 'productNew':
      return 'nowy';
    case 'productRemoved':
      return 'usunięty';
  }
}
