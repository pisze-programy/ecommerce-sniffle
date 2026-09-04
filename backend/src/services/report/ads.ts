// One ads section for a shop. It groups the Meta and Google ads
// under a single Reklamy card. The details wait inside the collapsed
// card. The header note shows both counts.

import type { MetaAd, MetaAdDay } from '../metaads/types.ts';
import type { GoogleAd, GoogleAdDay } from '../googleads/types.ts';
import type { CpmRange } from '../metaads/estimate.ts';
import { card } from '../report-components.ts';
import { googleAdsSummary, renderGoogleAdsInner } from './googleads.ts';
import { metaAdsSummary, renderMetaAdsInner } from './metaads.ts';

function fmtInt(value: number): string {
  return value.toLocaleString('pl-PL');
}

export interface AdsSectionInput {
  readonly metaAds: readonly MetaAd[];
  readonly metaDays: readonly MetaAdDay[];
  readonly googleAds: readonly GoogleAd[];
  readonly googleDays: readonly GoogleAdDay[];
  readonly today: string;
  readonly cpm: CpmRange;
  readonly googleCpmOverride: CpmRange | null;
}

export function renderAdsSection(input: AdsSectionInput): string {
  const hasMeta = input.metaAds.length > 0 || input.metaDays.length > 0;
  const hasGoogle = input.googleAds.length > 0 || input.googleDays.length > 0;
  if (!hasMeta && !hasGoogle) {
    return '';
  }
  const noteParts: string[] = [];
  if (hasMeta) {
    const summary = metaAdsSummary(input.metaAds, input.metaDays, input.today, input.cpm);
    noteParts.push(
      `Meta ${summary.active} · ${fmtInt(summary.dailyReach)}/dzień · ${fmtInt(summary.costLow)}–${fmtInt(summary.costHigh)} zł`
    );
  }
  if (hasGoogle) {
    const summary = googleAdsSummary(input.googleAds, input.googleDays, input.today, input.googleCpmOverride);
    noteParts.push(
      `Google ${summary.active} · ${fmtInt(summary.dailyImp)}/dzień · ${fmtInt(summary.costLow)}–${fmtInt(summary.costHigh)} zł`
    );
  }
  const sections: string[] = [];
  if (hasMeta) {
    sections.push(
      `<div class="subheader">Meta</div>${renderMetaAdsInner(input.metaAds, input.metaDays, input.today, input.cpm)}`
    );
  }
  if (hasGoogle) {
    sections.push(
      `<div class="subheader${hasMeta ? ' mt-2' : ''}">Google</div>${renderGoogleAdsInner(input.googleAds, input.googleDays, input.today, input.googleCpmOverride)}`
    );
  }
  return card({ title: 'Reklamy', titleNote: noteParts.join(' | '), body: sections.join(''), collapsed: true });
}
