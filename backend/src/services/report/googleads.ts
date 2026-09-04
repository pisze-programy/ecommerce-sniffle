// Renders the Google Ads card: the collected ad data for a shop.
// Data display only. No analytics, no spend, no CPA.
// BigQuery holds no creative text, only the format and the topic.

import type { GoogleAd, GoogleAdDay } from '../googleads/types.ts';
import {
  estimateAdDailyImpressions,
  estimateAdsDaily,
  estimateDailyCostByFormat,
  midpoint,
} from '../googleads/estimate.ts';
import type { CpmRange } from '../googleads/estimate.ts';
import { card, esc, sortableTable, statGrid } from '../report-components.ts';
import type { SortHeader } from '../report-components.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtInt(value: number): string {
  return value.toLocaleString('pl-PL');
}

function previewUrl(ad: GoogleAd): string {
  if (ad.pageUrl !== null) {
    return ad.pageUrl;
  }
  return `https://adstransparency.google.com/advertiser/${ad.advertiserId}/creative/${ad.creativeId}?region=anywhere`;
}

function daysAgo(day: string, today: string): number {
  const from = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 999;
  }
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function title(ad: GoogleAd): string {
  const kind = ad.format ?? 'reklama';
  const topic = ad.topic === null ? '' : ` · ${ad.topic}`;
  return `${kind}${topic} ${ad.creativeId.slice(-6)}`;
}

function dailyImpressions(ad: GoogleAd, series: readonly GoogleAdDay[], today: string): string {
  const estimate = estimateAdDailyImpressions(ad, series, today);
  return estimate <= 0 ? '--' : fmtInt(Math.round(estimate));
}

export interface GoogleAdsSummary {
  readonly active: number;
  readonly newCount: number;
  readonly impTotal: number;
  readonly dailyImp: number;
  readonly costLow: number;
  readonly costHigh: number;
}

export function googleAdsSummary(
  ads: readonly GoogleAd[],
  days: readonly GoogleAdDay[],
  today: string,
  override: CpmRange | null
): GoogleAdsSummary {
  const newCount = ads.filter((ad) => ad.firstShown !== null && daysAgo(ad.firstShown, today) <= 7).length;
  const impTotal = ads.reduce((sum, ad) => sum + midpoint(ad.impLo, ad.impHi), 0);
  const items = estimateAdsDaily(ads, days, today);
  const dailyImp = items.reduce((sum, item) => sum + item.daily, 0);
  const costEstimate = estimateDailyCostByFormat(items, override);
  return {
    active: ads.length,
    newCount,
    impTotal,
    dailyImp: Math.round(dailyImp),
    costLow: costEstimate.low,
    costHigh: costEstimate.high,
  };
}

export function renderGoogleAdsInner(
  ads: readonly GoogleAd[],
  days: readonly GoogleAdDay[],
  today: string,
  override: CpmRange | null
): string {
  const summary = googleAdsSummary(ads, days, today, override);

  const statItems = [
    { label: 'Aktywne', value: fmtInt(summary.active) },
    ...(summary.newCount > 0 ? [{ label: 'Nowe w 7 dni', value: fmtInt(summary.newCount) }] : []),
    { label: 'Wyświetlenia (suma środków)', value: fmtInt(Math.round(summary.impTotal)) },
    { label: 'Est. wyświetlenia/dzień', value: fmtInt(summary.dailyImp) },
    { label: 'Est. koszt/dzień', value: `${fmtInt(summary.costLow)}–${fmtInt(summary.costHigh)} zł` },
  ];

  const surfaceTotals = new Map<string, number>();
  for (const ad of ads) {
    for (const entry of ad.surfaces) {
      surfaceTotals.set(entry.surface, (surfaceTotals.get(entry.surface) ?? 0) + midpoint(entry.lo, entry.hi));
    }
  }
  const surfaceRows = [...surfaceTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([surface, total]) => `<tr><td>${esc(surface)}</td><td class="text-end">${fmtInt(Math.round(total))}</td></tr>`
    )
    .join('');
  const surfaceHeaders: readonly SortHeader[] = [
    { label: 'Powierzchnia' },
    { label: 'Wyświetlenia', sortType: 'number', defaultSort: 'desc' },
  ];
  const surfaceBlock =
    surfaceRows.length === 0
      ? ''
      : card({
          title: 'Powierzchnie',
          body: sortableTable(surfaceHeaders, surfaceRows, 'table-hover', 5, 'google-ads-surfaces'),
          collapsed: true,
        });

  const adRows = [...ads]
    .sort((a, b) => midpoint(b.impLo, b.impHi) - midpoint(a.impLo, a.impHi))
    .map((ad) => {
      const first = ad.firstShown === null ? '--' : ad.firstShown;
      const last = ad.lastShown === null ? '--' : ad.lastShown;
      const series = days.filter((row) => row.creativeId === ad.creativeId);
      return `<tr>
  <td><a href="${esc(previewUrl(ad))}" target="_blank" rel="noopener">${esc(title(ad))}</a></td>
  <td class="text-nowrap">${esc(first)}</td>
  <td class="text-nowrap">${esc(last)}</td>
  <td class="text-end">${fmtInt(Math.round(midpoint(ad.impLo, ad.impHi)))}</td>
  <td class="text-end">${dailyImpressions(ad, series, today)}</td>
</tr>`;
    })
    .join('');
  const adHeaders: readonly SortHeader[] = [
    { label: 'Reklama' },
    { label: 'Od' },
    { label: 'Do' },
    { label: 'Wyświetlenia', sortType: 'number', defaultSort: 'desc' },
    { label: 'Wyśw./dzień', sortType: 'number' },
  ];
  const adsBlock = card({
    title: 'Lista reklam Google',
    body: sortableTable(adHeaders, adRows, 'table-hover', 5, 'google-ads-list'),
    collapsed: true,
    className: 'mt-2',
  });

  const body = `${statGrid(statItems)}${surfaceBlock}${adsBlock}`;
  return body;
}
