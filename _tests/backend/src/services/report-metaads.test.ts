import { describe, expect, it } from 'vitest';
import type { MetaAd, MetaAdDay } from '../../../../backend/src/services/metaads/types.ts';
import { renderMetaAdsCard } from '../../../../backend/src/services/report/metaads.ts';

function ad(overrides: Partial<MetaAd> = {}): MetaAd {
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
    publisherPlatforms: ['FACEBOOK', 'INSTAGRAM'],
    languages: ['pl'],
    euTotalReach: 4174096,
    reachByLocation: [{ key: 'EU', value: 4174096 }],
    reachBreakdown: [
      {
        country: 'PL',
        age_gender_breakdowns: [{ age_range: '25-34', female: 526027, male: 321382, unknown: 0 }],
      },
    ],
    targetAges: ['18', '65'],
    targetGender: 'All',
    targetLocations: [{ name: 'Poland', type: 'countries', excluded: false, num_obfuscated: 0 }],
    beneficiaryPayers: [{ payer: 'Laboratorium Pani Domu', beneficiary: 'Laboratorium Pani Domu', current: true }],
    creativeHash: 'deadbeef',
    ...overrides,
  };
}

describe('renderMetaAdsCard', () => {
  it('renders the collected ad data without analytics', () => {
    const ads: MetaAd[] = [
      ad(),
      ad({
        adArchiveId: '1508266897314177',
        creativeHash: 'deadbeef',
        euTotalReach: 1975883,
        startDate: '2026-08-25',
      }),
    ];
    const days: MetaAdDay[] = [
      { day: '2026-08-29', adArchiveId: '635204772540093', pageId: '1527130717525496', euTotalReach: 4000000 },
      { day: '2026-08-30', adArchiveId: '635204772540093', pageId: '1527130717525496', euTotalReach: 4174096 },
      { day: '2026-08-30', adArchiveId: '1508266897314177', pageId: '1527130717525496', euTotalReach: 1975883 },
    ];
    const html = renderMetaAdsCard(ads, days, '2026-08-30', { min: 15, max: 30 });
    expect(html).toContain('Reklamy');
    expect(html).toContain('Aktywne');
    expect(html).toContain('Zasięg (suma)');
    expect(html).toContain('Est. zasięg/dzień');
    expect(html).toContain('Est. koszt/dzień');
    expect(html).toContain('Zasięg grup i kraje');
    expect(html).toContain('Grupy wiekowe');
    expect(html).toContain('Kraje');
    expect(html).toContain('Grupy kreatywa');
    expect(html).toContain('Czyści kostkę brukową. 33% rabatu');
    expect(html).toContain('>PL<');
    expect(html).not.toContain('deadbeef');
    expect(html).not.toContain('(ten sam tekst)');
    expect(html).toContain('/ads/library/?id=635204772540093');
    expect(html).not.toContain('Platformy');
    expect(html).not.toContain('ti-brand-facebook');
    expect(html).not.toContain('ti-globe');
    expect(html).toContain('data-page-size="5"');
    expect(html).not.toContain('CPA');
    expect(html).not.toContain('wydatek');
  });

  it('renders nothing for an empty shop', () => {
    expect(renderMetaAdsCard([], [], '2026-08-30')).toBe('');
  });
});
