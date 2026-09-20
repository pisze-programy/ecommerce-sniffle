import type { Catalog, Variant } from '@ecommerce-sniffle/providers';
import type { Snapshot, SnapshotWindow, VariantState } from './types.ts';

function variantToState(product: { id: string; url: string; title: string }, variant: Variant): VariantState {
  return {
    productId: product.id,
    variantId: variant.id,
    quantity: variant.quantity,
    price: variant.price.amount,
    regularPrice: variant.regularPrice === null ? null : variant.regularPrice.amount,
    available: variant.available,
    productUrl: product.url,
    productTitle: product.title,
    variantTitle: variant.title,
  };
}

export function catalogToSnapshot(catalog: Catalog, window: SnapshotWindow, snapshotAt: string): Snapshot {
  const variants: VariantState[] = [];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variants.push(variantToState(product, variant));
    }
  }
  return {
    shop: catalog.domain,
    snapshotAt,
    window,
    variants,
  };
}

// A masked variant has no quantity. The report must see it. Some
// variants stay masked on purpose (the shop does not track the stock).
// The config holds those ids. The count skips them.
export function countMaskedVariants(
  variants: readonly VariantState[],
  expectedMaskedVariantIds?: readonly string[]
): number {
  const expected = new Set<string>(expectedMaskedVariantIds ?? []);
  let masked = 0;
  for (const variant of variants) {
    if (variant.quantity === null && !expected.has(variant.variantId)) {
      masked += 1;
    }
  }
  return masked;
}
