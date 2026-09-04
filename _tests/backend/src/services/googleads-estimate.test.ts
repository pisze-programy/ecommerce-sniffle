import { describe, expect, it } from 'vitest';
import type { GoogleAd, GoogleAdDay } from '../../../../backend/src/services/googleads/types.ts';
import {
  estimateAdDailyImpressions,
  estimateAdsDaily,
  estimateDailyCost,
  estimateDailyCostByFormat,
  estimateDailyImpressions,
  formatCpm,
  midpoint,
  sanitizeBounds,
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

describe('sanitizeBounds', () => {
  it('passes real bounds through', () => {
    expect(sanitizeBounds(15000, 20000)).toEqual({ lo: 15000, hi: 20000 });
    expect(sanitizeBounds(null, null)).toEqual({ lo: null, hi: null });
  });

  it('nulls the INT64_MAX sentinel upper bound', () => {
    expect(sanitizeBounds(10000000, 9223372036854776000)).toEqual({ lo: null, hi: null });
  });

  it('nulls an absurd lower bound too', () => {
    expect(sanitizeBounds(9223372036854776000, 9223372036854776000)).toEqual({ lo: null, hi: null });
  });

  it('keeps the largest real bound seen (8M)', () => {
    expect(sanitizeBounds(0, 8000000)).toEqual({ lo: 0, hi: 8000000 });
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

describe('formatCpm', () => {
  it('prices display, video, and search apart', () => {
    expect(formatCpm('IMAGE', null)).toEqual({ min: 8, max: 20 });
    expect(formatCpm('VIDEO', null)).toEqual({ min: 20, max: 40 });
    expect(formatCpm('TEXT', null)).toEqual({ min: 60, max: 120 });
  });

  it('falls back to display pricing on unknown formats', () => {
    expect(formatCpm(null, null)).toEqual({ min: 8, max: 20 });
    expect(formatCpm('BANNER', null)).toEqual({ min: 8, max: 20 });
  });

  it('lets the entity override win over every format', () => {
    expect(formatCpm('VIDEO', { min: 15, max: 30 })).toEqual({ min: 15, max: 30 });
    expect(formatCpm('TEXT', { min: 15, max: 30 })).toEqual({ min: 15, max: 30 });
  });
});

describe('estimateDailyCostByFormat', () => {
  it('sums each ad with its own format range', () => {
    const items = [
      { format: 'IMAGE', daily: 10000, viaDelta: true },
      { format: 'VIDEO', daily: 1000, viaDelta: false },
    ];
    expect(estimateDailyCostByFormat(items, null)).toEqual({ low: 100, high: 240 });
  });

  it('prices everything with the override when set', () => {
    const items = [
      { format: 'IMAGE', daily: 10000, viaDelta: true },
      { format: 'TEXT', daily: 1000, viaDelta: true },
    ];
    expect(estimateDailyCostByFormat(items, { min: 15, max: 30 })).toEqual({ low: 165, high: 330 });
  });

  it('returns zero without items', () => {
    expect(estimateDailyCostByFormat([], null)).toEqual({ low: 0, high: 0 });
  });
});

describe('estimateAdsDaily', () => {
  it('returns the per-ad daily with the format attached', () => {
    const ads = [ad({ creativeId: 'CR1', format: 'VIDEO', impLo: 19000, impHi: 21000, firstShown: '2026-08-24' })];
    const days = [day('2026-09-01', 15000, 20000, 'CR1'), day('2026-09-02', 17000, 20000, 'CR1')];
    expect(estimateAdsDaily(ads, days, '2026-09-03')).toEqual([{ format: 'VIDEO', daily: 1000, viaDelta: true }]);
  });

  it('skips ads without a positive estimate', () => {
    expect(estimateAdsDaily([ad({ impLo: null, impHi: null })], [], '2026-09-03')).toEqual([]);
  });
});
