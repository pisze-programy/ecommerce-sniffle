import { describe, expect, it } from 'vitest';
import { aggregateDaily } from '../../../../packages/analysis/src/aggregate.ts';
import type { StockEvent, VariantState } from '../../../../packages/analysis/src/types.ts';

function variant(overrides: Partial<VariantState> = {}): VariantState {
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

function sold(units: number, price: number): StockEvent {
  const to = variant({ price });
  return {
    type: 'sold',
    productId: 'p1',
    variantId: 'v1',
    from: variant(),
    to,
    units,
    confidence: 'exact',
  };
}

describe('aggregateDaily', () => {
  it('sums sold units and revenue', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [sold(5, 100), sold(2, 90)],
    });
    expect(stats.unitsSold).toBe(7);
    expect(stats.revenue).toBe(680);
  });

  it('counts restock and marks it as masked', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [
        sold(3, 100),
        {
          type: 'restock',
          productId: 'p1',
          variantId: 'v2',
          from: variant(),
          to: variant({ quantity: 8 }),
          units: 5,
          confidence: 'masked',
        },
      ],
    });
    expect(stats.unitsSold).toBe(3);
    expect(stats.restocked).toBe(5);
    expect(stats.maskedCount).toBe(1);
  });

  it('counts sold out events with exact units', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [
        {
          type: 'soldOut',
          productId: 'p1',
          variantId: 'v3',
          from: variant({ quantity: 9 }),
          to: variant({ quantity: 0, available: false }),
          units: 9,
          confidence: 'exact',
        },
      ],
    });
    expect(stats.soldOutCount).toBe(1);
    expect(stats.unitsSold).toBe(9);
  });

  it('counts a sold out event with low confidence but not the units', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [
        {
          type: 'soldOut',
          productId: 'p1',
          variantId: 'v4',
          from: variant({ quantity: null }),
          to: variant({ quantity: null, available: false }),
          units: 0,
          confidence: 'low',
        },
      ],
    });
    expect(stats.soldOutCount).toBe(1);
    expect(stats.unitsSold).toBe(0);
  });

  it('counts active promotions', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [
        {
          type: 'promoStart',
          productId: 'p1',
          variantId: 'v5',
          from: variant({ price: 1290 }),
          to: variant({ price: 990 }),
          units: 0,
          confidence: 'exact',
        },
      ],
    });
    expect(stats.promotionCount).toBe(1);
  });

  it('returns zeros for empty events', () => {
    const stats = aggregateDaily({ shop: 'forcer.pl', day: '2026-08-24', events: [] });
    expect(stats).toEqual({
      shop: 'forcer.pl',
      day: '2026-08-24',
      unitsSold: 0,
      revenue: 0,
      restocked: 0,
      soldOutCount: 0,
      promotionCount: 0,
      maskedCount: 0,
    });
  });
});
