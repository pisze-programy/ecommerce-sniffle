import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../../../../packages/analysis/src/diff.ts';
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

function snapshot(shop: string, variants: readonly VariantState[]): Snapshot {
  return {
    shop,
    snapshotAt: '2026-08-24T06:00:00.000Z',
    window: 'morning',
    variants,
  };
}

describe('diffSnapshots', () => {
  it('returns events for changed variants', () => {
    const prev = snapshot('forcer.pl', [variant('a', { quantity: 12 }), variant('b', { quantity: 0 })]);
    const curr = snapshot('forcer.pl', [variant('a', { quantity: 7 }), variant('b', { quantity: 3 })]);
    const events = diffSnapshots(prev, curr);
    expect(events.map((e) => e.type)).toEqual(['sold', 'restock']);
  });

  it('emits productNew for a new variant', () => {
    const prev = snapshot('forcer.pl', [variant('a')]);
    const curr = snapshot('forcer.pl', [variant('a'), variant('b')]);
    const events = diffSnapshots(prev, curr);
    expect(events.some((e) => e.type === 'productNew' && e.variantId === 'b')).toBe(true);
  });

  it('emits productRemoved for a removed variant', () => {
    const prev = snapshot('forcer.pl', [variant('a'), variant('b')]);
    const curr = snapshot('forcer.pl', [variant('a')]);
    const events = diffSnapshots(prev, curr);
    expect(events.some((e) => e.type === 'productRemoved' && e.variantId === 'b')).toBe(true);
  });

  it('returns no events when nothing changed', () => {
    const prev = snapshot('forcer.pl', [variant('a'), variant('b')]);
    const curr = snapshot('forcer.pl', [variant('a'), variant('b')]);
    expect(diffSnapshots(prev, curr)).toHaveLength(0);
  });

  it('handles empty snapshots', () => {
    const prev = snapshot('forcer.pl', []);
    const curr = snapshot('forcer.pl', []);
    expect(diffSnapshots(prev, curr)).toHaveLength(0);
  });

  it('throws when the shops differ', () => {
    const prev = snapshot('forcer.pl', []);
    const curr = snapshot('wkdzik.pl', []);
    expect(() => diffSnapshots(prev, curr)).toThrow('Shop mismatch');
  });
});
