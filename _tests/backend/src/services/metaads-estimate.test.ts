import { describe, expect, it } from 'vitest';
import type { MetaAd, MetaAdDay } from '../../../../backend/src/services/metaads/types.ts';
import {
  estimateAdDailyReach,
  estimateDailyCost,
  estimateDailyReach,
} from '../../../../backend/src/services/metaads/estimate.ts';

const TODAY = '2026-08-30';

function ad(overrides: Partial<MetaAd> = {}): MetaAd {
  return {
    adArchiveId: 'a1',
    pageId: '1527130717525496',
    entityId: 'laboratoriumpanidomu',
    adCreationTime: '2026-08-01',
    startDate: '2026-08-20',
    stopDate: null,
    creativeBody: ['Test'],
    linkTitle: ['Test'],
    linkCaption: ['test.pl'],
    linkDescription: [],
    publisherPlatforms: ['FACEBOOK'],
    languages: ['pl'],
    euTotalReach: 10000,
    reachByLocation: [],
    reachBreakdown: [],
    targetAges: [],
    targetGender: null,
    targetLocations: [],
    beneficiaryPayers: [],
    creativeHash: 'hash',
    ...overrides,
  };
}

function day(day: string, reach: number, adId = 'a1'): MetaAdDay {
  return { day, adArchiveId: adId, pageId: '1527130717525496', euTotalReach: reach };
}

describe('estimateAdDailyReach', () => {
  it('returns 0 when the ad has no reach', () => {
    expect(estimateAdDailyReach(ad({ euTotalReach: null }), [], TODAY)).toBe(0);
  });

  it('returns 0 without snapshots', () => {
    expect(estimateAdDailyReach(ad(), [], TODAY)).toBe(0);
  });

  it('uses reach divided by days since start for the first snapshot', () => {
    const a = ad({ euTotalReach: 50000 });
    expect(estimateAdDailyReach(a, [day(TODAY, 50000)], TODAY)).toBe(5000);
  });

  it('uses the full reach for an ad started today', () => {
    const a = ad({ euTotalReach: 1200, startDate: TODAY });
    expect(estimateAdDailyReach(a, [day(TODAY, 1200)], TODAY)).toBe(1200);
  });

  it('uses the real delta for two snapshots', () => {
    const a = ad({ euTotalReach: 13000 });
    const series = [day('2026-08-29', 10000), day(TODAY, 13000)];
    expect(estimateAdDailyReach(a, series, TODAY)).toBe(3000);
  });

  it('averages the deltas over several snapshots', () => {
    const a = ad({ euTotalReach: 15000 });
    const series = [day('2026-08-28', 10000), day('2026-08-29', 12000), day(TODAY, 15000)];
    expect(estimateAdDailyReach(a, series, TODAY)).toBe(2500);
  });

  it('clamps a negative average to zero', () => {
    const a = ad({ euTotalReach: 9000 });
    const series = [day('2026-08-29', 10000), day(TODAY, 9000)];
    expect(estimateAdDailyReach(a, series, TODAY)).toBe(0);
  });

  it('adjusts a delta for a missing day', () => {
    const a = ad({ euTotalReach: 14000 });
    const series = [day('2026-08-26', 10000), day(TODAY, 14000)];
    expect(estimateAdDailyReach(a, series, TODAY)).toBe(1000);
  });

  it('returns 0 for one snapshot without a start date', () => {
    const a = ad({ euTotalReach: 5000, startDate: null });
    expect(estimateAdDailyReach(a, [day(TODAY, 5000)], TODAY)).toBe(0);
  });
});

describe('estimateDailyReach', () => {
  it('sums the per-ad estimates and tracks the source', () => {
    const a1 = ad({ adArchiveId: 'a1', euTotalReach: 10000 });
    const a2 = ad({ adArchiveId: 'a2', euTotalReach: 13000 });
    const days = [day('2026-08-29', 10000, 'a2'), day(TODAY, 13000, 'a2'), day(TODAY, 10000, 'a1')];
    const result = estimateDailyReach([a1, a2], days, TODAY);
    expect(result.total).toBe(4000);
    expect(result.viaDelta).toBe(3000);
    expect(result.viaFallback).toBe(1000);
    expect(result.ads).toBe(2);
  });

  it('ignores ads with a zero estimate', () => {
    const a1 = ad({ adArchiveId: 'a1', euTotalReach: null });
    const a2 = ad({ adArchiveId: 'a2', euTotalReach: 1200, startDate: TODAY });
    const result = estimateDailyReach([a1, a2], [day(TODAY, 1200, 'a2')], TODAY);
    expect(result.total).toBe(1200);
    expect(result.ads).toBe(1);
  });

  it('returns zero for an empty set', () => {
    const result = estimateDailyReach([], [], TODAY);
    expect(result.total).toBe(0);
    expect(result.ads).toBe(0);
  });
});

describe('estimateDailyCost', () => {
  it('computes the cost range from the CPM', () => {
    expect(estimateDailyCost(1000, { min: 15, max: 30 })).toEqual({ low: 15, high: 30 });
    expect(estimateDailyCost(5000, { min: 20, max: 25 })).toEqual({ low: 100, high: 125 });
    expect(estimateDailyCost(0, { min: 15, max: 30 })).toEqual({ low: 0, high: 0 });
  });
});
