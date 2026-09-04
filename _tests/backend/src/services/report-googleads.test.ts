import { describe, expect, it } from 'vitest';
import type { GoogleAd, GoogleAdDay } from '../../../../backend/src/services/googleads/types.ts';
import { renderGoogleAdsInner } from '../../../../backend/src/services/report/googleads.ts';

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
    surfaces: [{ surface: 'YOUTUBE', lo: 15000, hi: 20000 }],
    ...overrides,
  };
}

describe('renderGoogleAdsInner', () => {
  it('renders the collected ad data without analytics', () => {
    const ads: GoogleAd[] = [
      ad(),
      ad({
        creativeId: 'CR01740043198962597889',
        format: 'IMAGE',
        topic: null,
        pageUrl: null,
        firstShown: '2026-08-28',
        lastShown: '2026-09-02',
        impLo: 0,
        impHi: 1000,
        surfaces: [],
      }),
    ];
    const days: GoogleAdDay[] = [
      {
        day: '2026-09-01',
        creativeId: 'CR05850846188550488065',
        advertiserId: 'AR10613569593844695041',
        impLo: 14000,
        impHi: 19000,
      },
      {
        day: '2026-09-02',
        creativeId: 'CR05850846188550488065',
        advertiserId: 'AR10613569593844695041',
        impLo: 15000,
        impHi: 20000,
      },
    ];
    const html = renderGoogleAdsInner(ads, days, '2026-09-03', { min: 15, max: 30 });
    expect(html).toContain('Aktywne');
    expect(html).toContain('Wyświetlenia (suma środków)');
    expect(html).toContain('Est. wyświetlenia/dzień');
    expect(html).toContain('Est. koszt/dzień');
    expect(html).toContain('Powierzchnie');
    expect(html).toContain('YOUTUBE');
    expect(html).toContain('Lista reklam');
    expect(html).toContain('Wyśw./dzień');
    expect(html).toContain('VIDEO · Home &amp; Garden');
    expect(html).toContain('/advertiser/AR/creative/CR?region=anywhere');
    expect(html).toContain('data-page-size="5"');
    expect(html).not.toContain('CPA');
    expect(html).not.toContain('wydatek');
  });

  it('excludes sentinel bounds from totals', () => {
    const ads: GoogleAd[] = [ad(), ad({ creativeId: 'CR2', impLo: null, impHi: null, surfaces: [] })];
    const html = renderGoogleAdsInner(ads, [], '2026-09-03', null);
    expect(html).toContain('17 500');
    expect(html).not.toContain('9223372036854776000');
  });

  it('renders stats for empty input; the section hides it', () => {
    const html = renderGoogleAdsInner([], [], '2026-09-03', { min: 15, max: 30 });
    expect(html).toContain('Lista reklam Google');
    expect(html).toContain('Aktywne');
  });
});
