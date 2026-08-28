import { describe, expect, it } from 'vitest';
import { calculateShopSummary, SENTINEL_QTY } from '../../../../packages/analysis/src/summary.ts';
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

describe('calculateShopSummary', () => {
  it('sums items, value and prices for a normal shop', () => {
    const shop = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { productId: 'p1', quantity: 10, price: 100 }),
      variant('b', { productId: 'p1', quantity: 5, price: 200 }),
      variant('c', { productId: 'p2', quantity: 0, price: 50 }),
    ]);
    const summary = calculateShopSummary([shop]);
    expect(summary.totalItems).toBe(15);
    expect(summary.totalValue).toBe(2000);
    expect(summary.variantCount).toBe(3);
    expect(summary.uniqueProducts).toBe(2);
    expect(summary.meanPrice).toBeCloseTo(116.67, 2);
    expect(summary.medianPrice).toBe(100);
    expect(summary.bias.sentinelVariants).toBe(0);
    expect(summary.bias.countdown).toBe(false);
  });

  it('computes the median for an even count as the average of the middle pair', () => {
    const shop = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { price: 100 }),
      variant('b', { price: 200 }),
      variant('c', { price: 300 }),
      variant('d', { price: 400 }),
    ]);
    const summary = calculateShopSummary([shop]);
    expect(summary.medianPrice).toBe(250);
  });

  it('computes the median for an odd count as the middle value', () => {
    const shop = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { price: 90 }),
      variant('b', { price: 110 }),
      variant('c', { price: 130 }),
    ]);
    const summary = calculateShopSummary([shop]);
    expect(summary.medianPrice).toBe(110);
  });

  it('counts sentinel quantities as bias', () => {
    const shop = snapshot('wkdzik.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { productId: 'x1', quantity: SENTINEL_QTY, price: 10 }),
      variant('b', { productId: 'x2', quantity: 100000, price: 20 }),
      variant('c', { productId: 'x3', quantity: 5, price: 30 }),
    ]);
    const summary = calculateShopSummary([shop]);
    expect(summary.bias.sentinelVariants).toBe(2);
  });

  it('marks a countdown shop', () => {
    const shop = snapshot('wkdzik.pl', '2026-08-28T04:00:00.000Z', [variant('a', { quantity: 100000 })]);
    const summary = calculateShopSummary([shop]);
    expect(summary.bias.countdown).toBe(true);
  });

  it('returns zeros for an empty snapshot list', () => {
    const summary = calculateShopSummary([]);
    expect(summary.totalItems).toBe(0);
    expect(summary.totalValue).toBe(0);
    expect(summary.variantCount).toBe(0);
    expect(summary.uniqueProducts).toBe(0);
    expect(summary.meanPrice).toBeNull();
    expect(summary.medianPrice).toBeNull();
    expect(summary.bias.sentinelVariants).toBe(0);
    expect(summary.bias.countdown).toBe(false);
  });

  it('excludes null quantities from the item total', () => {
    const shop = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [
      variant('a', { quantity: null, price: 100 }),
      variant('b', { quantity: 3, price: 100 }),
    ]);
    const summary = calculateShopSummary([shop]);
    expect(summary.totalItems).toBe(3);
    expect(summary.variantCount).toBe(2);
  });

  it('keeps negative quantities as-is', () => {
    const shop = snapshot('bloozie.com', '2026-08-28T04:00:00.000Z', [variant('a', { quantity: -150, price: 10 })]);
    const summary = calculateShopSummary([shop]);
    expect(summary.totalItems).toBe(-150);
    expect(summary.totalValue).toBe(-1500);
  });

  it('uses the last snapshot in the list', () => {
    const early = snapshot('forcer.pl', '2026-08-27T04:00:00.000Z', [variant('a', { quantity: 1 })]);
    const late = snapshot('forcer.pl', '2026-08-28T04:00:00.000Z', [variant('a', { quantity: 9 })]);
    const summary = calculateShopSummary([early, late]);
    expect(summary.snapshotAt).toBe('2026-08-28T04:00:00.000Z');
    expect(summary.totalItems).toBe(9);
  });
});
