import type { Snapshot, StockEvent } from '@ecommerce-sniffle/analysis';
import type { DailyPoint, SeriesPoint } from './storage.ts';

// Fixed FX rate per shop currency. The display layer converts non-PLN
// prices to PLN. ponytail: fixed rate map. Fetch the NBP daily mid-rate
// when the rate drift starts to matter.
const PLN_PER_UNIT: Readonly<Record<string, number>> = { EUR: 4.35, USD: 3.72 };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function plnRate(currency: string | undefined): number {
  if (currency === undefined) {
    return 1;
  }
  return PLN_PER_UNIT[currency] === undefined ? 1 : PLN_PER_UNIT[currency];
}

export function toPln(amount: number, currency: string | undefined): number {
  return amount * plnRate(currency);
}

function priceOrNull(price: number | null | undefined, rate: number): number | null {
  return price === null || price === undefined ? null : round2(price * rate);
}

export function toPlnSnapshot(snapshot: Snapshot, currency: string | undefined): Snapshot {
  const rate = plnRate(currency);
  if (rate === 1) {
    return snapshot;
  }
  return {
    ...snapshot,
    variants: snapshot.variants.map((variant) => ({
      ...variant,
      price: priceOrNull(variant.price, rate),
      regularPrice: priceOrNull(variant.regularPrice, rate),
    })),
  };
}

export function toPlnEvents(events: readonly StockEvent[], currency: string | undefined): readonly StockEvent[] {
  const rate = plnRate(currency);
  if (rate === 1) {
    return events;
  }
  return events.map((event) => ({
    ...event,
    from: event.from === null ? null : { ...event.from, price: priceOrNull(event.from.price, rate) },
    to: event.to === null ? null : { ...event.to, price: priceOrNull(event.to.price, rate) },
  }));
}

export function toPlnPoint(point: DailyPoint, currency: string | undefined): DailyPoint {
  const rate = plnRate(currency);
  if (rate === 1) {
    return point;
  }
  return {
    ...point,
    soldValue: round2(point.soldValue * rate),
    soldMinPrice: priceOrNull(point.soldMinPrice, rate),
    soldMaxPrice: priceOrNull(point.soldMaxPrice, rate),
  };
}

export function toPlnSeriesPoint(point: SeriesPoint, currency: string | undefined): SeriesPoint {
  const rate = plnRate(currency);
  if (rate === 1) {
    return point;
  }
  return { ...point, price: priceOrNull(point.price, rate) };
}
