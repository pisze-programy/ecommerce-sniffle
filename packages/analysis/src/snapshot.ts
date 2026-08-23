import type { Catalog, Variant } from "@ecommerce-sniffle/providers";
import type { Snapshot, SnapshotWindow, VariantState } from "./types.ts";

export function currentWindow(at: Date = new Date()): SnapshotWindow {
  const hour = at.getUTCHours();
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

export function catalogToSnapshot(
  catalog: Catalog,
  window: SnapshotWindow,
  snapshotAt: string,
): Snapshot {
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
