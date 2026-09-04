// Daily impressions and cost estimation for Google ads. See docs/GOOGLE-ADS.md.
// BigQuery reports lifetime impression bounds per creative, not daily rows.
// The estimator snapshots the bounds each day and reads the day-over-day
// growth of the range midpoint. The cost math reuses the Meta CPM helper.

import type { GoogleAd, GoogleAdDay } from './types.ts';
import { estimateDailyCost } from '../metaads/estimate.ts';
import type { CpmRange, DailyCostEstimate } from '../metaads/estimate.ts';

export type { CpmRange };
export { estimateDailyCost };

export interface DailyImpressionsEstimate {
  readonly total: number;
  readonly viaDelta: number;
  readonly viaFallback: number;
  readonly ads: number;
}

export interface AdDailyImpressions {
  readonly format: string | null;
  readonly daily: number;
  readonly viaDelta: boolean;
}

// CPM per creative format, PLN per 1000. Sources: 2026 benchmarks
// in USD at 4 PLN per dollar. Display (GDN) runs $2-5, YouTube for
// ecommerce $5-10. Search sells clicks, not impressions; the $60-120
// bridges a PL ecommerce CPC of $1-2 with a 1-2% CTR. Rough on
// purpose. A per-entity override replaces every range below.
export const FORMAT_CPM: Readonly<Record<string, CpmRange>> = {
  IMAGE: { min: 8, max: 20 },
  VIDEO: { min: 20, max: 40 },
  TEXT: { min: 60, max: 120 },
};

const FALLBACK_CPM: CpmRange = { min: 8, max: 20 };

export function formatCpm(format: string | null, override: CpmRange | null): CpmRange {
  if (override !== null) {
    return override;
  }
  if (format === null) {
    return FALLBACK_CPM;
  }
  return FORMAT_CPM[format] ?? FALLBACK_CPM;
}

export function midpoint(lo: number | null, hi: number | null): number {
  if (lo === null || hi === null) {
    return 0;
  }
  return (lo + hi) / 2;
}

// Google reports an open-ended upper bound as a near-INT64_MAX
// sentinel (observed 9223372036854776000). Real bounds top out
// around 8M. Anything at or above 1e12 is not a measurement.
// A capped bound poisons the midpoint, so both ends go null.
export const BOUNDS_CAP = 1000000000000;

export interface CleanBounds {
  readonly lo: number | null;
  readonly hi: number | null;
}

export function sanitizeBounds(lo: number | null, hi: number | null): CleanBounds {
  if (lo !== null && lo >= BOUNDS_CAP) {
    return { lo: null, hi: null };
  }
  if (hi !== null && hi >= BOUNDS_CAP) {
    return { lo: null, hi: null };
  }
  return { lo, hi };
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function estimateAdDailyImpressions(ad: GoogleAd, series: readonly GoogleAdDay[], today: string): number {
  const current = midpoint(ad.impLo, ad.impHi);
  if (current <= 0) {
    return 0;
  }
  const sorted = [...series].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (sorted.length < 2) {
    if (sorted.length === 0 || ad.firstShown === null) {
      return 0;
    }
    const days = Math.max(1, dayDiff(ad.firstShown, today));
    return Math.max(0, current / days);
  }
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev === undefined || curr === undefined) {
      continue;
    }
    const gap = Math.max(1, dayDiff(prev.day, curr.day));
    deltas.push((midpoint(curr.impLo, curr.impHi) - midpoint(prev.impLo, prev.impHi)) / gap);
  }
  const sum = deltas.reduce((acc, delta) => acc + delta, 0);
  return Math.max(0, sum / deltas.length);
}

export function estimateAdsDaily(
  ads: readonly GoogleAd[],
  days: readonly GoogleAdDay[],
  today: string
): readonly AdDailyImpressions[] {
  const byAd = new Map<string, GoogleAdDay[]>();
  for (const row of days) {
    const list = byAd.get(row.creativeId);
    if (list === undefined) {
      byAd.set(row.creativeId, [row]);
    } else {
      list.push(row);
    }
  }
  const items: AdDailyImpressions[] = [];
  for (const ad of ads) {
    const series = byAd.get(ad.creativeId) ?? [];
    const estimate = estimateAdDailyImpressions(ad, series, today);
    if (estimate <= 0) {
      continue;
    }
    items.push({ format: ad.format, daily: estimate, viaDelta: series.length >= 2 });
  }
  return items;
}

export function estimateDailyImpressions(
  ads: readonly GoogleAd[],
  days: readonly GoogleAdDay[],
  today: string
): DailyImpressionsEstimate {
  const items = estimateAdsDaily(ads, days, today);
  let total = 0;
  let viaDelta = 0;
  let viaFallback = 0;
  for (const item of items) {
    total += item.daily;
    if (item.viaDelta) {
      viaDelta += item.daily;
    } else {
      viaFallback += item.daily;
    }
  }
  return {
    total: Math.round(total),
    viaDelta: Math.round(viaDelta),
    viaFallback: Math.round(viaFallback),
    ads: items.length,
  };
}

export function estimateDailyCostByFormat(
  items: readonly AdDailyImpressions[],
  override: CpmRange | null
): DailyCostEstimate {
  let low = 0;
  let high = 0;
  for (const item of items) {
    const cpm = formatCpm(item.format, override);
    low += (item.daily / 1000) * cpm.min;
    high += (item.daily / 1000) * cpm.max;
  }
  return { low: Math.round(low), high: Math.round(high) };
}
