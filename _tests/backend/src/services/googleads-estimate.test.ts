import { describe, expect, it } from 'vitest';
import type { GoogleAd, GoogleAdDay } from '../../../../backend/src/services/googleads/types.ts';
import {
  estimateAdDailyImpressions,
  estimateDailyCost,
  estimateDailyImpressions,
  midpoint,
} from '../../../../backend/src/services/googleads/estimate.ts';

function ad(overrides: Partial<GoogleAd> = {}): GoogleAd {
  return {
    creativeId: 'CR05850846188550488065',
    advertiserId: 'AR10613569593844695041',
    entityId: 'laboratoriumpanidomu',
    disclosedName: 'Laboratorium Pani Domu Sp. z o.o.',
    format: 'VIDEO',
    topic: 'Home & Garden',
    pageUrl: 'https://adstransparency.google.com/advertiser/AR/creative/CR?region=anywhere',
    firstShown: '2025-09-10',
    lastShown: '2026-09-02',
    impLo: 15000,
    impHi: 20000,
    audience: { demographic: null, geo: null, contextual: null, customerLists: null, topics: null },
    surfaces: [],
    ...overrides,
  };
}

function day(day: string, lo: number, hi: number, creativeId = 'CR05850846188550488065'): GoogleAdDay {
  return { day, creativeId, advertiserId: 'AR10613569593844695041', impLo: lo, impHi: hi };
}

describe('midpoint', () => {
  it('averages the bounds', () => {
    expect(midpoint(15000, 20000)).toBe(17500);
  });

  it('returns zero on missing bounds', () => {
    expect(midpoint(null, 20000)).toBe(0);
    expect(midpoint(15000, null)).toBe(0);
  });
});

describe('estimateAdDailyImpressions', () => {
  it('reads the day-over-day growth of the midpoint', () => {
    const current = ad({ impLo: 19000, impHi: 21000 });
    const series = [day('2026-09-01', 15000, 20000), day('2026-09-02', 17000, 20000)];
    expect(estimateAdDailyImpressions(current, series, '2026-09-03')).toBe(1000);
  });

  it('falls back to the midpoint over days since first shown', () => {
    const current = ad({ impLo: 15000, impHi: 20000, firstShown: '2026-08-24' });
    expect(estimateAdDailyImpressions(current, [day('2026-09-02', 15000, 20000)], '2026-09-03')).toBe(1750);
  });

  it('returns zero without bounds or history', () => {
    expect(estimateAdDailyImpressions(ad({ impLo: null, impHi: null }), [], '2026-09-03')).toBe(0);
    expect(estimateAdDailyImpressions(ad({ firstShown: null }), [], '2026-09-03')).toBe(0);
  });

  it('clamps a shrinking series to zero', () => {
    const current = ad({ impLo: 10000, impHi: 12000 });
    const series = [day('2026-09-01', 15000, 20000), day('2026-09-02', 13000, 16000)];
    expect(estimateAdDailyImpressions(current, series, '2026-09-03')).toBe(0);
  });

  it('counts a future first shown date as one day', () => {
    const current = ad({ impLo: 15000, impHi: 20000, firstShown: '2026-09-10' });
    expect(estimateAdDailyImpressions(current, [day('2026-09-02', 1000, 2000)], '2026-09-03')).toBe(17500);
  });
});

describe('estimateDailyImpressions', () => {
  it('sums delta and fallback ads separately', () => {
    const ads = [
      ad({ creativeId: 'CR1', impLo: 19000, impHi: 21000, firstShown: '2026-08-24' }),
      ad({ creativeId: 'CR2', impLo: 9000, impHi: 11000, firstShown: '2026-08-24' }),
    ];
    const days = [
      { ...day('2026-09-01', 15000, 20000), creativeId: 'CR1' },
      { ...day('2026-09-02', 17000, 20000), creativeId: 'CR1' },
      { ...day('2026-09-02', 9000, 11000), creativeId: 'CR2' },
    ];
    const result = estimateDailyImpressions(ads, days, '2026-09-03');
    expect(result.ads).toBe(2);
    expect(result.viaDelta).toBe(1000);
    expect(result.viaFallback).toBe(1000);
    expect(result.total).toBe(2000);
  });

  it('skips ads without a positive estimate', () => {
    const result = estimateDailyImpressions([ad({ impLo: null, impHi: null })], [], '2026-09-03');
    expect(result).toEqual({ total: 0, viaDelta: 0, viaFallback: 0, ads: 0 });
  });
});

describe('estimateDailyCost', () => {
  it('prices the reach with the CPM range', () => {
    expect(estimateDailyCost(2000, { min: 15, max: 30 })).toEqual({ low: 30, high: 60 });
    expect(estimateDailyCost(0, { min: 15, max: 30 })).toEqual({ low: 0, high: 0 });
  });
});
