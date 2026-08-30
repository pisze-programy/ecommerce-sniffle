import { describe, expect, it } from 'vitest';
import {
  plnRate,
  toPln,
  toPlnEvents,
  toPlnPoint,
  toPlnSeriesPoint,
  toPlnSnapshot,
} from '../../../../backend/src/services/currency.ts';
import type { Snapshot, StockEvent } from '@ecommerce-sniffle/analysis';

const SNAPSHOT: Snapshot = {
  shop: 'icon-amsterdam.com',
  snapshotAt: '2026-08-29T04:00:00.000Z',
  window: 'morning',
  variants: [
    { productId: 'p1', variantId: 'v1', quantity: 21, price: 39, regularPrice: 85, available: true },
    { productId: 'p2', variantId: 'v2', quantity: null, price: null, regularPrice: null, available: true },
  ],
};

const EVENT: StockEvent = {
  type: 'sold',
  productId: 'p1',
  variantId: 'v1',
  from: { productId: 'p1', variantId: 'v1', quantity: 25, price: 39, regularPrice: 85, available: true },
  to: { productId: 'p1', variantId: 'v1', quantity: 21, price: 39, regularPrice: 85, available: true },
  units: 4,
  confidence: 'exact',
};

describe('plnRate', () => {
  it('returns the fixed rate for EUR', () => {
    expect(plnRate('EUR')).toBe(4.35);
  });

  it('returns the fixed rate for USD', () => {
    expect(plnRate('USD')).toBe(3.72);
  });

  it('returns 1 for PLN', () => {
    expect(plnRate('PLN')).toBe(1);
  });

  it('returns 1 when the currency is undefined', () => {
    expect(plnRate(undefined)).toBe(1);
  });

  it('returns 1 for an unknown currency', () => {
    expect(plnRate('GBP')).toBe(1);
  });
});

describe('toPln', () => {
  it('multiplies the amount for EUR', () => {
    expect(toPln(10, 'EUR')).toBe(43.5);
  });

  it('multiplies the amount for USD', () => {
    expect(toPln(100, 'USD')).toBe(372);
  });

  it('keeps the amount for PLN', () => {
    expect(toPln(10, 'PLN')).toBe(10);
  });

  it('keeps the amount when the currency is undefined', () => {
    expect(toPln(10, undefined)).toBe(10);
  });
});

describe('toPlnSnapshot', () => {
  it('converts price and regular price for EUR', () => {
    const converted = toPlnSnapshot(SNAPSHOT, 'EUR');
    expect(converted.variants[0]?.price).toBe(169.65);
    expect(converted.variants[0]?.regularPrice).toBe(369.75);
    expect(converted.variants[0]?.quantity).toBe(21);
  });

  it('keeps null prices null', () => {
    const converted = toPlnSnapshot(SNAPSHOT, 'EUR');
    expect(converted.variants[1]?.price).toBeNull();
    expect(converted.variants[1]?.regularPrice).toBeNull();
  });

  it('returns the same object for PLN', () => {
    expect(toPlnSnapshot(SNAPSHOT, 'PLN')).toBe(SNAPSHOT);
  });

  it('returns the same object when the currency is undefined', () => {
    expect(toPlnSnapshot(SNAPSHOT, undefined)).toBe(SNAPSHOT);
  });
});

describe('toPlnEvents', () => {
  it('converts from and to prices for EUR', () => {
    const converted = toPlnEvents([EVENT], 'EUR');
    expect(converted[0]?.from?.price).toBe(169.65);
    expect(converted[0]?.to?.price).toBe(169.65);
    expect(converted[0]?.units).toBe(4);
    expect(converted[0]?.type).toBe('sold');
  });

  it('keeps a null from side null', () => {
    const withNullFrom = { ...EVENT, from: null };
    const converted = toPlnEvents([withNullFrom], 'EUR');
    expect(converted[0]?.from).toBeNull();
  });

  it('returns the same array for PLN', () => {
    const events = [EVENT];
    expect(toPlnEvents(events, 'PLN')).toBe(events);
  });
});

describe('toPlnPoint', () => {
  it('converts the sold value for EUR', () => {
    const point = { day: '2026-08-29', sold: 56, soldValue: 2839, restocked: 1, restockValue: 0, suspect: 0 };
    const converted = toPlnPoint(point, 'EUR');
    expect(converted.soldValue).toBe(12349.65);
    expect(converted.sold).toBe(56);
  });

  it('returns the same object for PLN', () => {
    const point = { day: '2026-08-29', sold: 56, soldValue: 2839, restocked: 1, restockValue: 0, suspect: 0 };
    expect(toPlnPoint(point, 'PLN')).toBe(point);
  });
});

describe('toPlnSeriesPoint', () => {
  it('converts the price for EUR', () => {
    const point = { snapshotAt: '2026-08-29T04:00:00.000Z', quantity: 21, price: 39, available: true };
    const converted = toPlnSeriesPoint(point, 'EUR');
    expect(converted.price).toBe(169.65);
    expect(converted.quantity).toBe(21);
  });

  it('keeps a null price null', () => {
    const point = { snapshotAt: '2026-08-29T04:00:00.000Z', quantity: null, price: null, available: true };
    const converted = toPlnSeriesPoint(point, 'EUR');
    expect(converted.price).toBeNull();
  });

  it('returns the same object for PLN', () => {
    const point = { snapshotAt: '2026-08-29T04:00:00.000Z', quantity: 21, price: 39, available: true };
    expect(toPlnSeriesPoint(point, 'PLN')).toBe(point);
  });
});
