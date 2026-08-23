import type { Confidence, StockEvent, VariantState } from "./types.js";

export function computeVariantDelta(prev: VariantState, curr: VariantState): StockEvent | null {
  const prevQty = prev.quantity;
  const currQty = curr.quantity;
  const bothTracked = prevQty !== null && currQty !== null;

  // Priority 1: availability transition (strongest signal)
  if (prev.available && !curr.available) {
    const units = bothTracked && prevQty !== null ? prevQty : 0;
    const confidence: Confidence = bothTracked ? "exact" : "low";
    return {
      type: "soldOut",
      productId: curr.productId,
      variantId: curr.variantId,
      from: prev,
      to: curr,
      units,
      confidence,
    };
  }

  if (!prev.available && curr.available) {
    return {
      type: "backInStock",
      productId: curr.productId,
      variantId: curr.variantId,
      from: prev,
      to: curr,
      units: 0,
      confidence: "exact",
    };
  }

  // Priority 2: tracked quantity change
  if (prevQty !== null && currQty !== null) {
    const delta = currQty - prevQty;
    if (delta < 0) {
      return {
        type: "sold",
        productId: curr.productId,
        variantId: curr.variantId,
        from: prev,
        to: curr,
        units: -delta,
        confidence: "exact",
      };
    }
    if (delta > 0) {
      return {
        type: "restock",
        productId: curr.productId,
        variantId: curr.variantId,
        from: prev,
        to: curr,
        units: delta,
        confidence: "masked",
      };
    }
  }

  // Priority 3: price change
  if (priceDrop(prev, curr)) {
    return {
      type: "promoStart",
      productId: curr.productId,
      variantId: curr.variantId,
      from: prev,
      to: curr,
      units: 0,
      confidence: "exact",
    };
  }

  if (priceRise(prev, curr)) {
    return {
      type: "promoEnd",
      productId: curr.productId,
      variantId: curr.variantId,
      from: prev,
      to: curr,
      units: 0,
      confidence: "exact",
    };
  }

  return null;
}

export function salePrice(state: VariantState): number {
  if (state.price !== null) {
    return state.price;
  }
  if (state.regularPrice !== null) {
    return state.regularPrice;
  }
  return 0;
}

function priceDrop(from: VariantState, to: VariantState): boolean {
  if (from.price === null || to.price === null) {
    return false;
  }
  return to.price < from.price;
}

function priceRise(from: VariantState, to: VariantState): boolean {
  if (from.price === null || to.price === null) {
    return false;
  }
  return to.price > from.price;
}
