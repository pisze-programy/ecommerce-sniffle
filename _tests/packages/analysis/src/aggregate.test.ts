import { describe, expect, it } from 'vitest';
import { aggregateDaily, mergeDailyStats } from '../../../../packages/analysis/src/aggregate.ts';
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

  it('counts restock but does not count it as masked', () => {
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
    expect(stats.maskedCount).toBe(0);
  });

  it('counts low confidence events as masked', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [
        {
          type: 'sold',
          productId: 'p1',
          variantId: 'v6',
          from: variant({ quantity: null }),
          to: variant({ quantity: null }),
          units: 2,
          confidence: 'low',
        },
      ],
    });
    expect(stats.maskedCount).toBe(1);
  });

  it('rounds revenue to two decimals', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [sold(3, 100), sold(1, 0.004), sold(1, 0.006)],
    });
    expect(stats.revenue).toBe(300.01);
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
      suspectCount: 0,
    });
  });

  it('flags and excludes events above the max observed quantity', () => {
    const stats = aggregateDaily(
      {
        shop: 'forcer.pl',
        day: '2026-08-24',
        events: [sold(5, 100), sold(10164, 50)],
      },
      { maxQuantity: 50 }
    );
    expect(stats.unitsSold).toBe(5);
    expect(stats.revenue).toBe(500);
    expect(stats.suspectCount).toBe(1);
  });

  it('excludes a suspect restock but keeps a normal one', () => {
    const stats = aggregateDaily(
      {
        shop: 'forcer.pl',
        day: '2026-08-24',
        events: [
          {
            type: 'restock',
            productId: 'p1',
            variantId: 'v7',
            from: variant({ quantity: 50 }),
            to: variant({ quantity: 70 }),
            units: 20,
            confidence: 'masked',
          },
          {
            type: 'restock',
            productId: 'p1',
            variantId: 'v8',
            from: variant({ quantity: 50 }),
            to: variant({ quantity: 10264 }),
            units: 10214,
            confidence: 'masked',
          },
        ],
      },
      { maxQuantity: 50 }
    );
    expect(stats.restocked).toBe(20);
    expect(stats.suspectCount).toBe(1);
  });

  it('does not flag anything when no max quantity is given', () => {
    const stats = aggregateDaily({
      shop: 'forcer.pl',
      day: '2026-08-24',
      events: [sold(10164, 50)],
    });
    expect(stats.unitsSold).toBe(10164);
    expect(stats.suspectCount).toBe(0);
  });

  it('flags an event whose starting quantity exceeds the observed max', () => {
    const stats = aggregateDaily(
      {
        shop: 'gymglamour.com',
        day: '2026-08-24',
        events: [
          {
            type: 'sold',
            productId: 'p1',
            variantId: 'v9',
            from: variant({ quantity: 55 }),
            to: variant({ quantity: 50 }),
            units: 5,
            confidence: 'exact',
          },
        ],
      },
      { maxQuantity: 50 }
    );
    expect(stats.unitsSold).toBe(0);
    expect(stats.suspectCount).toBe(1);
  });

  it('keeps a legitimate negative starting quantity below the observed max', () => {
    const stats = aggregateDaily(
      {
        shop: 'bloozie.com',
        day: '2026-08-24',
        events: [
          {
            type: 'sold',
            productId: 'p1',
            variantId: 'v10',
            from: variant({ quantity: -150 }),
            to: variant({ quantity: -151 }),
            units: 1,
            confidence: 'exact',
          },
        ],
      },
      { maxQuantity: 151 }
    );
    expect(stats.unitsSold).toBe(1);
    expect(stats.suspectCount).toBe(0);
  });
});

describe('mergeDailyStats', () => {
  function stats(unitsSold: number, revenue: number): ReturnType<typeof aggregateDaily> {
    return aggregateDaily({
      shop: 'laboratoriumpanidomu.pl',
      day: '2026-08-26',
      events: [sold(unitsSold, revenue)],
    });
  }

  it('returns the diff when there is no previous total', () => {
    const next = stats(322, 100);
    expect(mergeDailyStats(null, next)).toEqual(next);
  });

  it('accumulates two diffs of the same day', () => {
    const first = stats(322, 2);
    const second = stats(2487, 2);
    const merged = mergeDailyStats(first, second);
    expect(merged.unitsSold).toBe(2809);
    expect(merged.revenue).toBe(5618);
  });

  it('accumulates all counters', () => {
    const first = stats(1, 1);
    const second = {
      ...stats(1, 1),
      restocked: 5,
      soldOutCount: 2,
      promotionCount: 3,
      maskedCount: 4,
      suspectCount: 6,
    };
    const merged = mergeDailyStats(first, second);
    expect(merged.unitsSold).toBe(2);
    expect(merged.restocked).toBe(5);
    expect(merged.soldOutCount).toBe(2);
    expect(merged.promotionCount).toBe(3);
    expect(merged.maskedCount).toBe(4);
    expect(merged.suspectCount).toBe(6);
  });
});
