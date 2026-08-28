import { diffSnapshots } from './diff.js';
import { salePrice } from './classify.js';
import { isSuspectEvent } from './aggregate.js';
import type { Snapshot, StockEvent } from './types.js';

export interface CompareOptions {
  // The largest absolute quantity ever observed for the shop. An event
  // whose unit count exceeds it is suspect (phantom diff) and is excluded
  // from the estimates.
  readonly maxQuantity?: number;
}

export interface SalesEstimate {
  readonly itemsSold: number;
  readonly valueOfSales: number;
  readonly affectedProducts: number;
}

export interface RestockEstimate {
  readonly itemsAdded: number;
  readonly valueOfRestock: number;
  readonly affectedProducts: number;
}

export interface ProductChange {
  readonly productId: string;
  readonly sold: number;
  readonly soldValue: number;
  readonly restocked: number;
  readonly restockValue: number;
  readonly soldOut: boolean;
  readonly backInStock: boolean;
  readonly priceChanged: boolean;
  readonly variants: readonly StockEvent[];
}

export interface SnapshotComparison {
  readonly from: string;
  readonly to: string;
  readonly salesEstimate: SalesEstimate;
  readonly restockEstimate: RestockEstimate;
  readonly priceChanges: number;
  readonly productChanges: readonly ProductChange[];
}

export interface EventSummary {
  readonly sold: number;
  readonly soldValue: number;
  readonly restocked: number;
  readonly restockValue: number;
  readonly priceChanges: number;
  readonly suspectCount: number;
  readonly soldOut: number;
  readonly backInStock: number;
  readonly masked: number;
  readonly affectedProducts: number;
}

// Summarize a list of events (one snapshot window or one day) into sales,
// restock and price figures. Used by the per-snapshot comparison box.
export function summarizeEvents(events: readonly StockEvent[], options: CompareOptions = {}): EventSummary {
  let sold = 0;
  let soldValue = 0;
  let restocked = 0;
  let restockValue = 0;
  let priceChanges = 0;
  let suspectCount = 0;
  let soldOut = 0;
  let backInStock = 0;
  let masked = 0;
  const affected = new Set<string>();

  for (const event of events) {
    if (event.confidence === 'low') {
      masked += 1;
    }
    const overCap = options.maxQuantity !== undefined && isSuspectEvent(event, options.maxQuantity);
    if (overCap) {
      suspectCount += 1;
    }
    if (event.type === 'sold' || (event.type === 'soldOut' && event.confidence === 'exact')) {
      if (event.type === 'soldOut') {
        soldOut += 1;
      }
      if (overCap) {
        continue;
      }
      const price = event.to === null ? 0 : salePrice(event.to);
      sold += event.units;
      soldValue += event.units * price;
      affected.add(event.productId);
      continue;
    }
    if (event.type === 'soldOut') {
      soldOut += 1;
      continue;
    }
    if (event.type === 'restock') {
      if (overCap) {
        continue;
      }
      const price = event.to === null ? 0 : salePrice(event.to);
      restocked += event.units;
      restockValue += event.units * price;
      affected.add(event.productId);
      continue;
    }
    if (event.type === 'backInStock') {
      backInStock += 1;
      continue;
    }
    if (event.type === 'promoStart' || event.type === 'promoEnd') {
      priceChanges += 1;
      continue;
    }
  }

  return {
    sold,
    soldValue: round2(soldValue),
    restocked,
    restockValue: round2(restockValue),
    priceChanges,
    suspectCount,
    soldOut,
    backInStock,
    masked,
    affectedProducts: affected.size,
  };
}

interface MutableChange {
  productId: string;
  sold: number;
  soldValue: number;
  restocked: number;
  restockValue: number;
  soldOut: boolean;
  backInStock: boolean;
  priceChanged: boolean;
  variants: StockEvent[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function compareSnapshots(prev: Snapshot, curr: Snapshot, options: CompareOptions = {}): SnapshotComparison {
  const events = diffSnapshots(prev, curr);
  const map = new Map<string, MutableChange>();
  let itemsSold = 0;
  let valueOfSales = 0;
  let itemsAdded = 0;
  let valueOfRestock = 0;
  let priceChanges = 0;

  for (const event of events) {
    const overCap = options.maxQuantity !== undefined && isSuspectEvent(event, options.maxQuantity);
    let change = map.get(event.productId);
    if (change === undefined) {
      change = {
        productId: event.productId,
        sold: 0,
        soldValue: 0,
        restocked: 0,
        restockValue: 0,
        soldOut: false,
        backInStock: false,
        priceChanged: false,
        variants: [],
      };
      map.set(event.productId, change);
    }
    change.variants.push(event);
    if (event.type === 'sold' || (event.type === 'soldOut' && event.confidence === 'exact')) {
      if (event.type === 'soldOut') {
        change.soldOut = true;
      }
      if (overCap) {
        continue;
      }
      const price = event.to === null ? 0 : salePrice(event.to);
      const value = event.units * price;
      change.sold += event.units;
      change.soldValue += value;
      itemsSold += event.units;
      valueOfSales += value;
      continue;
    }
    if (event.type === 'soldOut') {
      change.soldOut = true;
      continue;
    }
    if (event.type === 'restock') {
      if (overCap) {
        continue;
      }
      const price = event.to === null ? 0 : salePrice(event.to);
      const value = event.units * price;
      change.restocked += event.units;
      change.restockValue += value;
      itemsAdded += event.units;
      valueOfRestock += value;
      continue;
    }
    if (event.type === 'backInStock') {
      change.backInStock = true;
      continue;
    }
    if (event.type === 'promoStart' || event.type === 'promoEnd') {
      change.priceChanged = true;
      priceChanges += 1;
      continue;
    }
  }

  const productChanges: ProductChange[] = [...map.values()]
    .map((change) => ({
      productId: change.productId,
      sold: change.sold,
      soldValue: round2(change.soldValue),
      restocked: change.restocked,
      restockValue: round2(change.restockValue),
      soldOut: change.soldOut,
      backInStock: change.backInStock,
      priceChanged: change.priceChanged,
      variants: change.variants,
    }))
    .sort((a, b) => b.sold + b.restocked - (a.sold + a.restocked));

  let soldAffected = 0;
  let restockAffected = 0;
  for (const change of productChanges) {
    if (change.sold > 0) {
      soldAffected += 1;
    }
    if (change.restocked > 0) {
      restockAffected += 1;
    }
  }

  return {
    from: prev.snapshotAt,
    to: curr.snapshotAt,
    salesEstimate: {
      itemsSold,
      valueOfSales: round2(valueOfSales),
      affectedProducts: soldAffected,
    },
    restockEstimate: {
      itemsAdded,
      valueOfRestock: round2(valueOfRestock),
      affectedProducts: restockAffected,
    },
    priceChanges,
    productChanges,
  };
}
