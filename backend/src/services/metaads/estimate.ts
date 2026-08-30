// Daily reach and cost estimation for Meta ads. See docs/META-ADS.md.
// The estimator corrects itself from the daily snapshots.
// The first snapshot uses reach divided by days since start.
// The next snapshots use the real day-over-day reach growth.

import type { MetaAd, MetaAdDay } from './types.ts';

export interface CpmRange {
  readonly min: number;
  readonly max: number;
}

export interface DailyReachEstimate {
  readonly total: number;
  readonly viaDelta: number;
  readonly viaFallback: number;
  readonly ads: number;
}

export interface DailyCostEstimate {
  readonly low: number;
  readonly high: number;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function estimateAdDailyReach(ad: MetaAd, series: readonly MetaAdDay[], today: string): number {
  if (ad.euTotalReach === null) {
    return 0;
  }
  const sorted = [...series].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (sorted.length < 2) {
    if (sorted.length === 0 || ad.startDate === null) {
      return 0;
    }
    const days = Math.max(1, dayDiff(ad.startDate, today));
    return Math.max(0, ad.euTotalReach / days);
  }
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev === undefined || curr === undefined) {
      continue;
    }
    const gap = Math.max(1, dayDiff(prev.day, curr.day));
    deltas.push((curr.euTotalReach - prev.euTotalReach) / gap);
  }
  const sum = deltas.reduce((acc, delta) => acc + delta, 0);
  return Math.max(0, sum / deltas.length);
}

export function estimateDailyReach(
  ads: readonly MetaAd[],
  days: readonly MetaAdDay[],
  today: string
): DailyReachEstimate {
  const byAd = new Map<string, MetaAdDay[]>();
  for (const row of days) {
    const list = byAd.get(row.adArchiveId);
    if (list === undefined) {
      byAd.set(row.adArchiveId, [row]);
    } else {
      list.push(row);
    }
  }
  let total = 0;
  let viaDelta = 0;
  let viaFallback = 0;
  let adsCount = 0;
  for (const ad of ads) {
    const series = byAd.get(ad.adArchiveId) ?? [];
    const estimate = estimateAdDailyReach(ad, series, today);
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

export function estimateDailyCost(reach: number, cpm: CpmRange): DailyCostEstimate {
  return {
    low: Math.round((reach / 1000) * cpm.min),
    high: Math.round((reach / 1000) * cpm.max),
  };
}
