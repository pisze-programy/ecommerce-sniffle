import type { Snapshot, VariantState } from '@ecommerce-sniffle/analysis';
import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from './storage.ts';
import { storeSnapshot } from './pipeline.ts';
import type { PipelineResult } from './pipeline.ts';

function parseVariantState(data: unknown): VariantState | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const obj = data as Readonly<Record<string, unknown>>;
  if (typeof obj['productId'] !== 'string' || typeof obj['variantId'] !== 'string') {
    return null;
  }
  let quantity: number | null = null;
  if (obj['quantity'] === null) {
    quantity = null;
  } else if (typeof obj['quantity'] === 'number') {
    quantity = obj['quantity'];
  } else {
    return null;
  }
  let price: number | null = null;
  if (obj['price'] === null) {
    price = null;
  } else if (typeof obj['price'] === 'number') {
    price = obj['price'];
  } else {
    return null;
  }
  let regularPrice: number | null = null;
  if (obj['regularPrice'] === null) {
    regularPrice = null;
  } else if (typeof obj['regularPrice'] === 'number') {
    regularPrice = obj['regularPrice'];
  } else {
    return null;
  }
  if (typeof obj['available'] !== 'boolean') {
    return null;
  }
  let productUrl: string | null = null;
  const rawUrl = obj['productUrl'];
  if (rawUrl === undefined || rawUrl === null) {
    productUrl = null;
  } else if (typeof rawUrl === 'string') {
    productUrl = rawUrl;
  } else {
    return null;
  }
  const productTitle = typeof obj['productTitle'] === 'string' ? obj['productTitle'] : null;
  const variantTitle = typeof obj['variantTitle'] === 'string' ? obj['variantTitle'] : null;
  return {
    productId: obj['productId'],
    variantId: obj['variantId'],
    quantity,
    price,
    regularPrice,
    available: obj['available'],
    productUrl,
    productTitle,
    variantTitle,
  };
}

export function parseSnapshotBody(data: unknown): Snapshot | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const shop = obj['shop'];
  const snapshotAt = obj['snapshotAt'];
  const window = obj['window'];
  if (typeof shop !== 'string' || shop.length === 0) {
    return null;
  }
  if (typeof snapshotAt !== 'string' || snapshotAt.length === 0) {
    return null;
  }
  if (window !== 'morning' && window !== 'evening' && window !== 'unknown') {
    return null;
  }
  const variantsRaw = obj['variants'];
  if (!Array.isArray(variantsRaw)) {
    return null;
  }
  const variants: VariantState[] = [];
  for (const rawVariant of variantsRaw) {
    const variant = parseVariantState(rawVariant);
    if (variant === null) {
      return null;
    }
    variants.push(variant);
  }
  return { shop, snapshotAt, window, variants };
}

export async function ingestSnapshot(storage: Storage, snapshot: Snapshot, logger: Logger): Promise<PipelineResult> {
  return storeSnapshot(storage, snapshot, logger);
}
