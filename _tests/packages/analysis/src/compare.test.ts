import { describe, expect, it } from 'vitest';
import { compareSnapshots, summarizeEvents } from '../../../../packages/analysis/src/compare.ts';
import type { Snapshot, VariantState } from '../../../../packages/analysis/src/types.ts';

function variant(id: string, overrides: Partial<VariantState> = {}): VariantState {
  return {
    productId: 'p1',
    variantId: id,
    quantity: 10,
    price: 100,
    regularPrice: 100,
    available: true,
    ...overrides,
  };
}

function snapshot(shop: string, at: string, variants: readonly VariantState[]): Snapshot {
  return {
    shop,
    snapshotAt: at,
    window: 'morning',
    variants,
  };
}

describe('compareSnapshots', () => {
  it('counts a quantity decrease as a sale with its value', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 12 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 7 })]);
    const result = compareSnapshots(prev, curr);
    expect(result.salesEstimate.itemsSold).toBe(5);
    expect(result.salesEstimate.valueOfSales).toBe(500);
    expect(result.salesEstimate.affectedProducts).toBe(1);
    expect(result.restockEstimate.itemsAdded).toBe(0);
  });

  it('counts a quantity increase as a restock', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 5 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 40 })]);
    const result = compareSnapshots(prev, curr);
    expect(result.restockEstimate.itemsAdded).toBe(35);
    expect(result.restockEstimate.valueOfRestock).toBe(3500);
  });

  it('counts a sold-out with exact confidence as a sale', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 9 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 0, available: false })]);
    const result = compareSnapshots(prev, curr);
    expect(result.salesEstimate.itemsSold).toBe(9);
    expect(result.salesEstimate.valueOfSales).toBe(900);
  });

  it('records a price change without any quantity change', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { price: 120 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { price: 99 })]);
    const result = compareSnapshots(prev, curr);
    expect(result.priceChanges).toBe(1);
    expect(result.salesEstimate.itemsSold).toBe(0);
    const change = result.productChanges[0];
    expect(change?.priceChanged).toBe(true);
    expect(change?.sold).toBe(0);
  });

  it('aggregates multi-variant products into one product line', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [
      variant('a', { productId: 'p1', quantity: 10 }),
      variant('b', { productId: 'p1', quantity: 10 }),
    ]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [
      variant('a', { productId: 'p1', quantity: 6 }),
      variant('b', { productId: 'p1', quantity: 4 }),
    ]);
    const result = compareSnapshots(prev, curr);
    expect(result.productChanges).toHaveLength(1);
    const change = result.productChanges[0];
    expect(change?.productId).toBe('p1');
    expect(change?.sold).toBe(10);
    expect(change?.variants).toHaveLength(2);
    expect(result.salesEstimate.itemsSold).toBe(10);
  });

  it('excludes an over-cap sale from the estimate', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 10264 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 50 })]);
    const result = compareSnapshots(prev, curr, { maxQuantity: 50 });
    expect(result.salesEstimate.itemsSold).toBe(0);
    expect(result.salesEstimate.valueOfSales).toBe(0);
  });

  it('returns zeros for two identical snapshots', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a')]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a')]);
    const result = compareSnapshots(prev, curr);
    expect(result.salesEstimate.itemsSold).toBe(0);
    expect(result.restockEstimate.itemsAdded).toBe(0);
    expect(result.productChanges).toHaveLength(0);
    expect(result.priceChanges).toBe(0);
  });

  it('returns zeros for two empty snapshots', () => {
    const result = compareSnapshots(
      snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', []),
      snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [])
    );
    expect(result.salesEstimate.itemsSold).toBe(0);
    expect(result.salesEstimate.affectedProducts).toBe(0);
  });

  it('throws when the shops differ', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', []);
    const curr = snapshot('wkdzik.pl', '2026-08-24T18:00:00.000Z', []);
    expect(() => compareSnapshots(prev, curr)).toThrow('Shop mismatch');
  });

  it('flags a back-in-stock event without counting units', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 0, available: false })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 3, available: true })]);
    const result = compareSnapshots(prev, curr);
    expect(result.restockEstimate.itemsAdded).toBe(0);
    const change = result.productChanges[0];
    expect(change?.backInStock).toBe(true);
  });

  it('rounds money to two decimals', () => {
    const prev = snapshot('forcer.pl', '2026-08-24T06:00:00.000Z', [variant('a', { quantity: 10, price: 0.333 })]);
    const curr = snapshot('forcer.pl', '2026-08-24T18:00:00.000Z', [variant('a', { quantity: 4, price: 0.333 })]);
    const result = compareSnapshots(prev, curr);
    expect(result.salesEstimate.valueOfSales).toBe(2.0);
  });
});

describe('summarizeEvents', () => {
  it('sums sales, restock and price changes from events', () => {
    const events = [
      {
        type: 'sold',
        productId: 'p1',
        variantId: 'v1',
        from: null,
        to: variant('v1', { productId: 'p1', quantity: 7, price: 100 }),
        units: 5,
        confidence: 'exact',
      },
      {
        type: 'restock',
        productId: 'p2',
        variantId: 'v2',
        from: null,
        to: variant('v2', { productId: 'p2', quantity: 40, price: 50 }),
        units: 35,
        confidence: 'masked',
      },
      {
        type: 'promoStart',
        productId: 'p3',
        variantId: 'v3',
        from: null,
        to: null,
        units: 0,
        confidence: 'exact',
      },
    ];
    const summary = summarizeEvents(events);
    expect(summary.sold).toBe(5);
    expect(summary.soldValue).toBe(500);
    expect(summary.restocked).toBe(35);
    expect(summary.restockValue).toBe(1750);
    expect(summary.priceChanges).toBe(1);
    expect(summary.affectedProducts).toBe(2);
  });

  it('counts a sold-out and a back-in-stock event', () => {
    const events = [
      {
        type: 'soldOut',
        productId: 'p1',
        variantId: 'v1',
        from: null,
        to: variant('v1', { quantity: 0, available: false }),
        units: 4,
        confidence: 'exact',
      },
      {
        type: 'backInStock',
        productId: 'p2',
        variantId: 'v2',
        from: null,
        to: null,
        units: 0,
        confidence: 'exact',
      },
    ];
    const summary = summarizeEvents(events);
    expect(summary.sold).toBe(4);
    expect(summary.soldOut).toBe(1);
    expect(summary.backInStock).toBe(1);
  });

  it('flags and excludes an over-cap event', () => {
    const events = [
      {
        type: 'sold',
        productId: 'p1',
        variantId: 'v1',
        from: null,
        to: variant('v1', { quantity: 50 }),
        units: 10214,
        confidence: 'exact',
      },
    ];
    const summary = summarizeEvents(events, { maxQuantity: 50 });
    expect(summary.sold).toBe(0);
    expect(summary.suspectCount).toBe(1);
  });

  it('returns zeros for no events', () => {
    const summary = summarizeEvents([]);
    expect(summary).toEqual({
      sold: 0,
      soldValue: 0,
      restocked: 0,
      restockValue: 0,
      priceChanges: 0,
      suspectCount: 0,
      soldOut: 0,
      backInStock: 0,
      masked: 0,
      affectedProducts: 0,
    });
  });

  it('counts low confidence events as masked', () => {
    const events = [
      {
        type: 'sold',
        productId: 'p1',
        variantId: 'v1',
        from: null,
        to: null,
        units: 2,
        confidence: 'low',
      },
    ];
    const summary = summarizeEvents(events);
    expect(summary.masked).toBe(1);
  });
});
