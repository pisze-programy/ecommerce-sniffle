import { describe, expect, it } from 'vitest';
import { topSellingProducts } from '../../../../packages/analysis/src/top.ts';
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

describe('topSellingProducts', () => {
  it('sums the decreases across snapshots per product and sorts by value', () => {
    const s1 = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [
      variant('a', { productId: 'shoe', quantity: 100, price: 500 }),
      variant('b', { productId: 'shirt', quantity: 100, price: 50 }),
    ]);
    const s2 = snapshot('forcer.pl', '2026-08-27T16:00:00.000Z', [
      variant('a', { productId: 'shoe', quantity: 90, price: 500 }),
      variant('b', { productId: 'shirt', quantity: 80, price: 50 }),
    ]);
    const s3 = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { productId: 'shoe', quantity: 85, price: 500 }),
      variant('b', { productId: 'shirt', quantity: 79, price: 50 }),
    ]);
    const tops = topSellingProducts([s1, s2, s3]);
    expect(tops[0]?.productId).toBe('shoe');
    expect(tops[0]?.itemsSold).toBe(15);
    expect(tops[0]?.salesValue).toBe(7500);
    expect(tops[1]?.productId).toBe('shirt');
    expect(tops[1]?.itemsSold).toBe(21);
    expect(tops[1]?.salesValue).toBe(1050);
  });

  it('dedupes multi-variant products into one line', () => {
    const s1 = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [
      variant('a', { productId: 'jeans', quantity: 10 }),
      variant('b', { productId: 'jeans', quantity: 10 }),
    ]);
    const s2 = snapshot('forcer.pl', '2026-08-27T16:00:00.000Z', [
      variant('a', { productId: 'jeans', quantity: 7 }),
      variant('b', { productId: 'jeans', quantity: 6 }),
    ]);
    const tops = topSellingProducts([s1, s2]);
    expect(tops).toHaveLength(1);
    expect(tops[0]?.productId).toBe('jeans');
    expect(tops[0]?.itemsSold).toBe(7);
  });

  it('excludes over-cap suspect events', () => {
    const s1 = snapshot('gymglamour.com', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: 10264 })]);
    const s2 = snapshot('gymglamour.com', '2026-08-27T16:00:00.000Z', [variant('a', { quantity: 50 })]);
    const tops = topSellingProducts([s1, s2], { maxQuantity: 50 });
    expect(tops).toHaveLength(0);
  });

  it('flags a countdown shop product', () => {
    const s1 = snapshot('wkdzik.pl', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: 100000 })]);
    const s2 = snapshot('wkdzik.pl', '2026-08-27T16:00:00.000Z', [variant('a', { quantity: 99900 })]);
    const tops = topSellingProducts([s1, s2]);
    expect(tops[0]?.countdown).toBe(true);
  });

  it('returns an empty list for a single snapshot', () => {
    const s1 = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: 10 })]);
    expect(topSellingProducts([s1])).toHaveLength(0);
  });

  it('returns an empty list for no snapshots', () => {
    expect(topSellingProducts([])).toHaveLength(0);
  });

  it('respects the limit option', () => {
    const s1 = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [
      variant('a', { productId: 'p1', quantity: 10 }),
      variant('b', { productId: 'p2', quantity: 10 }),
      variant('c', { productId: 'p3', quantity: 10 }),
    ]);
    const s2 = snapshot('forcer.pl', '2026-08-27T16:00:00.000Z', [
      variant('a', { productId: 'p1', quantity: 5 }),
      variant('b', { productId: 'p2', quantity: 6 }),
      variant('c', { productId: 'p3', quantity: 7 }),
    ]);
    const tops = topSellingProducts([s1, s2], { limit: 2 });
    expect(tops).toHaveLength(2);
  });

  it('computes sales for negative base quantities', () => {
    const s1 = snapshot('bloozie.com', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: -150, price: 10 })]);
    const s2 = snapshot('bloozie.com', '2026-08-27T16:00:00.000Z', [variant('a', { quantity: -151, price: 10 })]);
    const tops = topSellingProducts([s1, s2]);
    expect(tops[0]?.itemsSold).toBe(1);
    expect(tops[0]?.salesValue).toBe(10);
  });

  it('filters by the from and to range', () => {
    const s1 = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: 10 })]);
    const s2 = snapshot('forcer.pl', '2026-08-27T16:00:00.000Z', [variant('a', { quantity: 8 })]);
    const s3 = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [variant('a', { quantity: 5 })]);
    const tops = topSellingProducts([s1, s2, s3], { from: '2026-08-27T12:00:00.000Z', to: '2026-08-29T00:00:00.000Z' });
    expect(tops[0]?.itemsSold).toBe(3);
  });
});
