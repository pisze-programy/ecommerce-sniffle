import { describe, expect, it } from 'vitest';
import { computeVariantDelta } from '../../../../packages/analysis/src/classify.ts';
import type { VariantState } from '../../../../packages/analysis/src/types.ts';

function state(overrides: Partial<VariantState> = {}): VariantState {
  return {
    productId: 'p1',
    variantId: 'v1',
    quantity: 10,
    price: 100,
    regularPrice: 100,
    available: true,
    ...overrides,
  };
}

describe('computeVariantDelta - quantity', () => {
  it('returns a sold event when quantity decreased', () => {
    const event = computeVariantDelta(state({ quantity: 12 }), state({ quantity: 7 }));
    expect(event?.type).toBe('sold');
    expect(event?.units).toBe(5);
    expect(event?.confidence).toBe('exact');
  });

  it('returns a restock event when quantity increased', () => {
    const event = computeVariantDelta(state({ quantity: 0 }), state({ quantity: 3 }));
    expect(event?.type).toBe('restock');
    expect(event?.units).toBe(3);
    expect(event?.confidence).toBe('masked');
  });

  it('returns null when quantity is unchanged', () => {
    const event = computeVariantDelta(state({ quantity: 7 }), state({ quantity: 7 }));
    expect(event).toBeNull();
  });
});

describe('computeVariantDelta - availability', () => {
  it('returns a soldOut event for a tracked variant', () => {
    const event = computeVariantDelta(
      state({ quantity: 9, available: true }),
      state({ quantity: 0, available: false })
    );
    expect(event?.type).toBe('soldOut');
    expect(event?.units).toBe(9);
    expect(event?.confidence).toBe('exact');
  });

  it('returns a soldOut event with low confidence for an untracked variant', () => {
    const event = computeVariantDelta(
      state({ quantity: null, available: true }),
      state({ quantity: null, available: false })
    );
    expect(event?.type).toBe('soldOut');
    expect(event?.units).toBe(0);
    expect(event?.confidence).toBe('low');
  });

  it('returns a backInStock event', () => {
    const event = computeVariantDelta(state({ available: false }), state({ available: true }));
    expect(event?.type).toBe('backInStock');
  });
});

describe('computeVariantDelta - price', () => {
  it('returns a promoStart event on a price drop', () => {
    const event = computeVariantDelta(state({ price: 1290 }), state({ price: 990 }));
    expect(event?.type).toBe('promoStart');
  });

  it('returns a promoEnd event on a price rise', () => {
    const event = computeVariantDelta(state({ price: 990 }), state({ price: 1290 }));
    expect(event?.type).toBe('promoEnd');
  });

  it('returns null when price is unchanged', () => {
    const event = computeVariantDelta(state({ price: 990 }), state({ price: 990 }));
    expect(event).toBeNull();
  });
});

describe('computeVariantDelta - priority and wrong input', () => {
  it('favours soldOut over a plain sold event', () => {
    const event = computeVariantDelta(
      state({ quantity: 2, available: true }),
      state({ quantity: 0, available: false })
    );
    expect(event?.type).toBe('soldOut');
  });

  it('favours quantity change over price change', () => {
    const event = computeVariantDelta(state({ quantity: 12, price: 1290 }), state({ quantity: 7, price: 990 }));
    expect(event?.type).toBe('sold');
  });

  it('returns a sold event for a boolean-only variant when it cannot change', () => {
    const event = computeVariantDelta(state({ quantity: null }), state({ quantity: null, price: 90 }));
    expect(event?.type).toBe('promoStart');
  });
});
