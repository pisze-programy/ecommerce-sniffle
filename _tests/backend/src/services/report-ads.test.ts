import { describe, expect, it } from 'vitest';
import type { MetaAd, MetaAdDay } from '../../../../backend/src/services/metaads/types.ts';
import type { GoogleAd, GoogleAdDay } from '../../../../backend/src/services/googleads/types.ts';
import { renderAdsSection } from '../../../../backend/src/services/report/ads.ts';

function metaAd(): MetaAd {
  return {
    adArchiveId: '635204772540093',
    pageId: '1527130717525496',
    entityId: 'laboratoriumpanidomu',
    adCreationTime: '2025-03-10',
    startDate: '2025-03-10',
    stopDate: null,
    creativeBody: ['Czyści kostkę brukową.'],
    linkTitle: ['Czyści kostkę brukową. 33% rabatu'],
    linkCaption: ['laboratoriumpanidomu.pl'],
    linkDescription: [],
    publisherPlatforms: ['FACEBOOK'],
    languages: ['pl'],
    euTotalReach: 4174096,
    reachByLocation: [],
    reachBreakdown: [],
    targetAges: [],
    targetGender: null,
    targetLocations: [],
    beneficiaryPayers: [],
    creativeHash: 'deadbeef',
  };
}

function googleAd(): GoogleAd {
  return {
    creativeId: 'CR05850846188550488065',
    advertiserId: 'AR10613569593844695041',
    entityId: 'laboratoriumpanidomu',
    disclosedName: 'Laboratorium Pani Domu Sp. z o.o.',
    format: 'VIDEO',
    topic: 'Home & Garden',
    pageUrl: null,
    firstShown: '2025-09-10',
    lastShown: '2026-09-02',
    impLo: 15000,
    impHi: 20000,
    audience: { demographic: null, geo: null, contextual: null, customerLists: null, topics: null },
    surfaces: [],
  };
}

describe('renderAdsSection', () => {
  it('groups both platforms under one card without outside summaries', () => {
    const html = renderAdsSection({
      metaAds: [metaAd()],
      metaDays: [],
      googleAds: [googleAd()],
      googleDays: [],
      today: '2026-09-03',
      cpm: { min: 15, max: 30 },
      googleCpmOverride: null,
    });
    expect(html).toContain('Reklamy');
    expect(html).not.toContain('Reklamy Google</h3>');
    expect(html).toContain('Meta 1 · ');
    expect(html).toContain('Google 1 · ');
    expect(html).toContain('/dzień · ');
    expect(html).toContain(' zł');
    expect(html).toContain('Czyści kostkę brukową. 33% rabatu');
    expect(html).toContain('VIDEO');
    expect(html).toContain('Lista reklam Meta');
    expect(html).toContain('Lista reklam Google');
  });

  it('shows only the meta part without google data', () => {
    const html = renderAdsSection({
      metaAds: [metaAd()],
      metaDays: [],
      googleAds: [],
      googleDays: [],
      today: '2026-09-03',
      cpm: { min: 15, max: 30 },
      googleCpmOverride: null,
    });
    expect(html).toContain('Meta 1 · ');
    expect(html).not.toContain('Google');
    expect(html).toContain('Lista reklam Meta');
  });

  it('shows only the google part without meta data', () => {
    const html = renderAdsSection({
      metaAds: [],
      metaDays: [],
      googleAds: [googleAd()],
      googleDays: [],
      today: '2026-09-03',
      cpm: { min: 15, max: 30 },
      googleCpmOverride: null,
    });
    expect(html).toContain('Google 1 · ');
    expect(html).not.toContain('Meta');
    expect(html).toContain('Lista reklam Google');
  });

  it('renders nothing without any ad data', () => {
    expect(
      renderAdsSection({
        metaAds: [],
        metaDays: [],
        googleAds: [],
        googleDays: [],
        today: '2026-09-03',
        cpm: { min: 15, max: 30 },
        googleCpmOverride: null,
      })
    ).toBe('');
  });

  it('counts days-only input as data', () => {
    const metaDays: MetaAdDay[] = [
      { day: '2026-09-02', adArchiveId: '635204772540093', pageId: '1527130717525496', euTotalReach: 100 },
    ];
    const googleDays: GoogleAdDay[] = [
      { day: '2026-09-02', creativeId: 'CR1', advertiserId: 'AR1', impLo: 10, impHi: 20 },
    ];
    const html = renderAdsSection({
      metaAds: [],
      metaDays,
      googleAds: [],
      googleDays,
      today: '2026-09-03',
      cpm: { min: 15, max: 30 },
      googleCpmOverride: null,
    });
    expect(html).toContain('Meta 0 · 0/dzień · 0–0 zł | Google 0 · 0/dzień · 0–0 zł');
  });
});
