// Leak probe for the Shopify cart cap. See docs/CLAMP-BYPASS.md.
// The extractors live in the providers package. The probe and the V2
// provider share one implementation.
// The probe runs on the developer machine only. The VPS is production.

import {
  parseDataInventoryQuantity,
  parseGrowInventory,
  parseKachingInventory,
  parseRestockProducts,
  parseShopDomain,
  parseStorefrontToken,
} from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';

export type LeakVector =
  'kaching-inventory' | 'data-inventory-quantity' | 'grow-inventory-map' | 'restock-quantity' | 'app-stock';

// A catalog leak holds the stock of the shop products.
// An app leak holds the stock of app items, for example reward gifts.
export type LeakScope = 'catalog' | 'app';

export interface LeakHit {
  readonly vector: LeakVector;
  readonly scope: LeakScope;
  readonly variants: ReadonlyMap<string, number>;
}

export interface LeakSample {
  readonly variantId: string;
  readonly quantity: number;
}

export function extractKaching(body: string, logger: Logger): Map<string, number> {
  return new Map(parseKachingInventory(body, logger));
}

export function extractDataInventoryQuantity(body: string, logger: Logger): Map<string, number> {
  return new Map(parseDataInventoryQuantity(body, logger));
}

export function extractGrowMap(body: string): Map<string, number> {
  return new Map(parseGrowInventory(body));
}

export function extractRestock(body: string, logger: Logger, domain: string = 'unknown'): Map<string, number> {
  const groups = parseRestockProducts(body, logger, domain);
  const variants = groups.get('restock-quantity');
  return variants === undefined ? new Map<string, number>() : new Map(variants);
}

// A loyalty app writes its reward stock. This is not the catalog stock.
// Each reward is a flat object. The match stays inside one object.
export function extractAppStock(body: string): Map<string, number> {
  const out = new Map<string, number>();
  const objects = body.matchAll(/\{[^{}]*"stockTracked"\s*:\s*true[^{}]*\}/g);
  for (const match of objects) {
    const text = match[0];
    if (text === undefined) {
      continue;
    }
    const idMatch = /"variantId"\s*:\s*(\d+)/.exec(text);
    const stockMatch = /"stock"\s*:\s*(\d+)/.exec(text);
    if (idMatch === null || stockMatch === null) {
      continue;
    }
    const id = idMatch[1];
    const quantity = stockMatch[1];
    if (id === undefined || id === '0' || quantity === undefined) {
      continue;
    }
    out.set(id, Number(quantity));
  }
  return out;
}

// The ReStock groups are A and B. Group A is the product variants.
// Group B is an unrelated app block. Each group returns products, not a
// plain count. A count is per object. A page holds two groups.
export function detectRestock(body: string, logger: Logger, domain: string): readonly LeakHit[] {
  const hits: LeakHit[] = [];
  for (const [vector, variants] of parseRestockProducts(body, logger, domain)) {
    if (variants.size > 0) {
      hits.push({ vector, scope: 'catalog', variants });
    }
  }
  return hits;
}

// Runs every known vector on one product page body.
export function detectLeaks(body: string, logger: Logger, domain: string = 'unknown'): readonly LeakHit[] {
  const hits: LeakHit[] = [];
  const push = (vector: LeakVector, scope: LeakScope, variants: Map<string, number>): void => {
    if (variants.size > 0) {
      hits.push({ vector, scope, variants });
    }
  };
  push('kaching-inventory', 'catalog', extractKaching(body, logger));
  push('data-inventory-quantity', 'catalog', extractDataInventoryQuantity(body, logger));
  push('grow-inventory-map', 'catalog', extractGrowMap(body));
  for (const hit of detectRestock(body, logger, domain)) {
    push('restock-quantity', 'catalog', new Map(hit.variants));
  }
  push('app-stock', 'app', extractAppStock(body));
  return hits;
}

// Picks the smallest count below the cap. The cart can verify that count.
export function pickVerifiable(hit: LeakHit, cap: number): LeakSample | null {
  let best: LeakSample | null = null;
  for (const [variantId, quantity] of hit.variants) {
    if (quantity <= 0 || quantity >= cap) {
      continue;
    }
    if (best === null || quantity < best.quantity) {
      best = { variantId, quantity };
    }
  }
  return best;
}

// Reads the clamp count from the cart message. Both languages are used.
export function parseClampMessage(text: string): number | null {
  const match = /(?:Tylko|Only)\s+(\d+)/.exec(text);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return Number(match[1]);
}

export function extractStorefrontToken(body: string): string | null {
  return parseStorefrontToken(body);
}

export function extractShopDomain(body: string): string | null {
  return parseShopDomain(body);
}
