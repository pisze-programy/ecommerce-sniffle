import { computeVariantDelta } from "./classify.js";
import type { Snapshot, StockEvent, VariantState } from "./types.js";

function indexVariants(variants: readonly VariantState[]): ReadonlyMap<string, VariantState> {
  const index = new Map<string, VariantState>();
  for (const variant of variants) {
    index.set(variant.variantId, variant);
  }
  return index;
}

export function diffSnapshots(prev: Snapshot, curr: Snapshot): readonly StockEvent[] {
  if (prev.shop !== curr.shop) {
    throw new Error(`Shop mismatch: ${prev.shop} vs ${curr.shop}`);
  }

  const prevById = indexVariants(prev.variants);
  const currById = indexVariants(curr.variants);
  const events: StockEvent[] = [];

  for (const currVariant of curr.variants) {
    const prevVariant = prevById.get(currVariant.variantId);
    if (prevVariant === undefined) {
      events.push({
        type: "productNew",
        productId: currVariant.productId,
        variantId: currVariant.variantId,
        from: null,
        to: currVariant,
        units: currVariant.quantity === null ? 0 : currVariant.quantity,
        confidence: "exact",
      });
      continue;
    }
    const event = computeVariantDelta(prevVariant, currVariant);
    if (event !== null) {
      events.push(event);
    }
  }

  for (const prevVariant of prev.variants) {
    if (!currById.has(prevVariant.variantId)) {
      events.push({
        type: "productRemoved",
        productId: prevVariant.productId,
        variantId: prevVariant.variantId,
        from: prevVariant,
        to: null,
        units: 0,
        confidence: "exact",
      });
    }
  }

  return events;
}
