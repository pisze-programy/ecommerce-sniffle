// Daily impressions and cost estimation for Google ads. See docs/GOOGLE-ADS.md.
// BigQuery reports lifetime impression bounds per creative, not daily rows.
// The estimator snapshots the bounds each day and reads the day-over-day
// growth of the range midpoint. The cost math reuses the Meta CPM helper.

import type { GoogleAd, GoogleAdDay } from './types.ts';
import { estimateDailyCost } from '../metaads/estimate.ts';
import type { CpmRange } from '../metaads/estimate.ts';

export type { CpmRange };
export { estimateDailyCost };

export interface DailyImpressionsEstimate {
  readonly total: number;
  readonly viaDelta: number;
  readonly viaFallback: number;
  readonly ads: number;
}

export function midpoint(lo: number | null, hi: number | null): number {
  if (lo === null || hi === null) {
    return 0;
  }
  return (lo + hi) / 2;
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

export function estimateDailyImpressions(
  ads: readonly GoogleAd[],
  days: readonly GoogleAdDay[],
  today: string
): DailyImpressionsEstimate {
  const byAd = new Map<string, GoogleAdDay[]>();
  for (const row of days) {
    const list = byAd.get(row.creativeId);
    if (list === undefined) {
      byAd.set(row.creativeId, [row]);
    } else {
      list.push(row);
    }
  }
  let total = 0;
  let viaDelta = 0;
  let viaFallback = 0;
  let adsCount = 0;
  for (const ad of ads) {
    const series = byAd.get(ad.creativeId) ?? [];
    const estimate = estimateAdDailyImpressions(ad, series, today);
    if (estimate <= 0) {
      continue;
    }
    total += estimate;
    adsCount += 1;
    if (series.length >= 2) {
      viaDelta += estimate;
    } else {
      viaFallback += estimate;
    }
  }
  return {
    total: Math.round(total),
    viaDelta: Math.round(viaDelta),
    viaFallback: Math.round(viaFallback),
    ads: adsCount,
  };
}
