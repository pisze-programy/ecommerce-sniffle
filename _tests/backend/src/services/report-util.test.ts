import { describe, expect, it } from 'vitest';
import type { StockEvent } from '@ecommerce-sniffle/analysis';
import { aggregateProductEvents, eventTypeLabel, seedStats } from '../../../../backend/src/services/report-util.ts';

function event(overrides: Partial<StockEvent>): StockEvent {
  return {
    type: 'sold',
    productId: '1',
    variantId: '1-a',
    from: null,
    to: null,
    units: 1,
    confidence: 'exact',
    ...overrides,
  };
}

describe('aggregateProductEvents', () => {
  it('groups the variants under the product and sums the units per type', () => {
    const events: StockEvent[] = [
      event({ productId: '3728', variantId: '3728-smak-1', type: 'sold', units: 1 }),
      event({ productId: '3728', variantId: '3728-smak-2', type: 'sold', units: 3 }),
      event({ productId: '3728', variantId: '3728-rozmiar', type: 'restock', units: 5 }),
      event({ productId: '9', variantId: '9-x', type: 'soldOut' }),
    ];
    const groups = aggregateProductEvents(events);
    expect(groups).toHaveLength(2);
    const first = groups[0];
    expect(first?.productId).toBe('3728');
    expect(first?.sold).toBe(4);
    expect(first?.restocked).toBe(5);
    expect(first?.variants).toHaveLength(3);
    const second = groups[1];
    expect(second?.soldOut).toBe(1);
  });

  it('sorts the groups by the total change desc', () => {
    const events: StockEvent[] = [
      event({ productId: 'a', type: 'sold', units: 1 }),
      event({ productId: 'b', type: 'sold', units: 9 }),
    ];
    const groups = aggregateProductEvents(events);
    expect(groups[0]?.productId).toBe('b');
  });
});

describe('seedStats', () => {
  it('sums the units and counts per type', () => {
    const events: StockEvent[] = [
      event({ type: 'sold', units: 2 }),
      event({ type: 'sold', units: 3 }),
      event({ type: 'restock', units: 7 }),
      event({ type: 'soldOut' }),
      event({ type: 'backInStock' }),
      event({ type: 'promoStart' }),
    ];
    expect(seedStats(events)).toEqual({ sold: 5, restocked: 7, soldOut: 1, backInStock: 1, promo: 1 });
  });
});

describe('eventTypeLabel', () => {
  it('maps every type to a polish label', () => {
    expect(eventTypeLabel('sold')).toBe('sprzedane');
    expect(eventTypeLabel('restock')).toBe('dostawione');
    expect(eventTypeLabel('soldOut')).toBe('wyprzedane');
  });
});
