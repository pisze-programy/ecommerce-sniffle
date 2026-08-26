import { describe, expect, it } from 'vitest';
import type { Catalog, Variant } from '@ecommerce-sniffle/providers';
import { catalogToSnapshot, currentWindow } from '../../../../packages/analysis/src/snapshot.ts';

function variant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'v1',
    title: 'S',
    sku: null,
    price: { amount: 100, currency: 'PLN' },
    regularPrice: null,
    available: true,
    quantity: 10,
    ...overrides,
  };
}

function catalog(): Catalog {
  return {
    domain: 'forcer.pl',
    fetchedAt: '2026-08-24T06:00:00.000Z',
    products: [
      { id: 'p1', title: 'SET AIR', url: 'https://forcer.pl/products/set-air', variants: [variant()] },
      {
        id: 'p2',
        title: 'BLUZA',
        url: 'https://forcer.pl/products/bluza',
        variants: [variant({ id: 'v2', quantity: 0, available: false })],
      },
    ],
  };
}

describe('catalogToSnapshot', () => {
  it('flattens products and variants into snapshot rows', () => {
    const snapshot = catalogToSnapshot(catalog(), 'morning', '2026-08-24T06:00:00.000Z');
    expect(snapshot.shop).toBe('forcer.pl');
    expect(snapshot.window).toBe('morning');
    expect(snapshot.snapshotAt).toBe('2026-08-24T06:00:00.000Z');
    expect(snapshot.variants).toHaveLength(2);
    expect(snapshot.variants[0]).toEqual({
      productId: 'p1',
      variantId: 'v1',
      quantity: 10,
      price: 100,
      regularPrice: null,
      available: true,
    });
    expect(snapshot.variants[1]?.quantity).toBe(0);
    expect(snapshot.variants[1]?.available).toBe(false);
  });

  it('maps regular price from the variant', () => {
    const withRegular: Catalog = {
      domain: 'forcer.pl',
      fetchedAt: '2026-08-24T06:00:00.000Z',
      products: [
        {
          id: 'p1',
          title: 'SET AIR',
          url: 'https://forcer.pl/products/set-air',
          variants: [variant({ regularPrice: { amount: 120, currency: 'PLN' } })],
        },
      ],
    };
    const snapshot = catalogToSnapshot(withRegular, 'morning', '2026-08-24T06:00:00.000Z');
    expect(snapshot.variants[0]?.regularPrice).toBe(120);
  });
});

describe('currentWindow', () => {
  it('returns morning before noon utc', () => {
    expect(currentWindow(new Date('2026-08-24T06:00:00.000Z'))).toBe('morning');
  });

  it('returns evening after noon utc', () => {
    expect(currentWindow(new Date('2026-08-24T16:00:00.000Z'))).toBe('evening');
  });

  it('returns morning exactly at noon', () => {
    expect(currentWindow(new Date('2026-08-24T12:00:00.000Z'))).toBe('evening');
  });
});
