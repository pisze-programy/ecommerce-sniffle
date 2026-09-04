// Renders the Meta Ads card: the collected ad data for a shop.
// Data display only. No analytics, no spend, no CPA.
// The analytics module computes those later.

import type { MetaAd, MetaAdDay } from '../metaads/types.ts';
import { estimateAdDailyReach, estimateDailyCost, estimateDailyReach } from '../metaads/estimate.ts';
import type { CpmRange } from '../metaads/estimate.ts';
import { card, esc, sortableTable, statGrid } from '../report-components.ts';
import type { SortHeader } from '../report-components.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtInt(value: number): string {
  return value.toLocaleString('pl-PL');
}

function previewUrl(id: string): string {
  return `https://www.facebook.com/ads/library/?id=${id}`;
}

function daysAgo(day: string, today: string): number {
  const from = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 999;
  }
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function dailyReach(ad: MetaAd, series: readonly MetaAdDay[], today: string): string {
  const estimate = estimateAdDailyReach(ad, series, today);
  return estimate <= 0 ? '--' : fmtInt(Math.round(estimate));
}

interface GroupRow {
  readonly name: string;
  reach: number;
  count: number;
  readonly url: string;
}

function groupRows(ads: readonly MetaAd[]): readonly GroupRow[] {
  const groups = new Map<string, GroupRow>();
  for (const ad of ads) {
    const name = ad.linkTitle[0] ?? ad.creativeBody[0] ?? ad.adArchiveId;
    const group = groups.get(ad.creativeHash);
    if (group === undefined) {
      groups.set(ad.creativeHash, {
        name,
        reach: ad.euTotalReach ?? 0,
        count: 1,
        url: previewUrl(ad.adArchiveId),
      });
    } else {
      group.reach += ad.euTotalReach ?? 0;
      group.count += 1;
    }
  }
  return [...groups.values()];
}

interface CountryRow {
  readonly country: string;
  readonly reach: number;
}

function countryRows(ads: readonly MetaAd[]): readonly CountryRow[] {
  const countries = new Map<string, number>();
  for (const ad of ads) {
    for (const entry of ad.reachBreakdown) {
      const total = entry.age_gender_breakdowns.reduce((sum, band) => sum + band.female + band.male + band.unknown, 0);
      countries.set(entry.country, (countries.get(entry.country) ?? 0) + total);
    }
  }
  return [...countries.entries()].map(([country, reach]) => ({ country, reach })).sort((a, b) => b.reach - a.reach);
}

interface AgeGroupRow {
  readonly group: string;
  readonly reach: number;
}

function ageGroupRows(ads: readonly MetaAd[]): readonly AgeGroupRow[] {
  const byAge = new Map<string, number>();
  for (const ad of ads) {
    for (const entry of ad.reachBreakdown) {
      for (const band of entry.age_gender_breakdowns) {
        byAge.set(band.age_range, (byAge.get(band.age_range) ?? 0) + band.female + band.male + band.unknown);
      }
    }
  }
  return [...byAge.entries()].map(([group, reach]) => ({ group, reach })).sort((a, b) => b.reach - a.reach);
}

export interface MetaAdsSummary {
  readonly active: number;
  readonly newCount: number;
  readonly reachTotal: number;
  readonly dailyReach: number;
  readonly costLow: number;
  readonly costHigh: number;
}

export function metaAdsSummary(
  ads: readonly MetaAd[],
  days: readonly MetaAdDay[],
  today: string,
  cpm: CpmRange
): MetaAdsSummary {
  const newCount = ads.filter((ad) => ad.startDate !== null && daysAgo(ad.startDate, today) <= 7).length;
  const reachTotal = ads.reduce((sum, ad) => sum + (ad.euTotalReach ?? 0), 0);
  const reachEstimate = estimateDailyReach(ads, days, today);
  const costEstimate = estimateDailyCost(reachEstimate.total, cpm);
  return {
    active: ads.length,
    newCount,
    reachTotal,
    dailyReach: reachEstimate.total,
    costLow: costEstimate.low,
    costHigh: costEstimate.high,
  };
}

export function renderMetaAdsInner(
  ads: readonly MetaAd[],
  days: readonly MetaAdDay[],
  today: string,
  cpm: CpmRange
): string {
  const summary = metaAdsSummary(ads, days, today, cpm);

  const statItems = [
    { label: 'Aktywne', value: fmtInt(summary.active) },
    ...(summary.newCount > 0 ? [{ label: 'Nowe w 7 dni', value: fmtInt(summary.newCount) }] : []),
    { label: 'Zasięg (suma)', value: fmtInt(summary.reachTotal) },
    { label: 'Est. zasięg/dzień', value: fmtInt(summary.dailyReach) },
    { label: 'Est. koszt/dzień', value: `${fmtInt(summary.costLow)}–${fmtInt(summary.costHigh)} zł` },
  ];

  const groups = groupRows(ads);
  const countries = countryRows(ads);
  const ageGroups = ageGroupRows(ads);

  const ageRows = ageGroups
    .map((entry) => `<tr><td>${esc(entry.group)}</td><td class="text-end">${fmtInt(entry.reach)}</td></tr>`)
    .join('');
  const countryHtml = countries
    .map((entry) => `<tr><td>${esc(entry.country)}</td><td class="text-end">${fmtInt(entry.reach)}</td></tr>`)
    .join('');
  const reachHeaders: readonly SortHeader[] = [
    { label: 'Nazwa' },
    { label: 'Zasięg', sortType: 'number', defaultSort: 'desc' },
  ];
  const combinedBlock =
    ageRows.length === 0 && countryHtml.length === 0
      ? ''
      : card({
          title: 'Zasięg grup i kraje',
          body: `${ageRows.length === 0 ? '' : `<div class="subheader">Grupy wiekowe</div>${sortableTable(reachHeaders, ageRows, 'table-hover', 5, 'meta-ads-ages')}`}${
            countryHtml.length === 0
              ? ''
              : `<div class="subheader mt-2">Kraje</div>${sortableTable(reachHeaders, countryHtml, 'table-hover', 5, 'meta-ads-countries')}`
          }`,
          collapsed: true,
        });

  const collationRows = groups
    .filter((group) => group.count > 1)
    .sort((a, b) => b.reach - a.reach)
    .map(
      (group) =>
        `<tr><td><a href="${esc(group.url)}" target="_blank" rel="noopener">${esc(group.name)}</a></td><td class="text-end">${group.count}</td><td class="text-end">${fmtInt(group.reach)}</td></tr>`
    );
  const collationHeaders: readonly SortHeader[] = [
    { label: 'Grupa' },
    { label: 'Ilość', sortType: 'number' },
    { label: 'Zasięg', sortType: 'number', defaultSort: 'desc' },
  ];
  const collationBlock =
    collationRows.length === 0
      ? ''
      : card({
          title: 'Grupy kreatywa',
          body: sortableTable(collationHeaders, collationRows.join(''), 'table-hover', 5, 'meta-ads-groups-collated'),
          collapsed: true,
        });

  const adRows = [...ads]
    .sort((a, b) => (b.euTotalReach ?? 0) - (a.euTotalReach ?? 0))
    .map((ad) => {
      const start = ad.startDate === null ? '--' : ad.startDate;
      const title = ad.linkTitle[0] ?? ad.creativeBody[0] ?? ad.adArchiveId;
      const series = days.filter((row) => row.adArchiveId === ad.adArchiveId);
      return `<tr>
  <td><a href="${esc(previewUrl(ad.adArchiveId))}" target="_blank" rel="noopener">${esc(title)}</a></td>
  <td class="text-nowrap">${esc(start)}</td>
  <td class="text-end">${fmtInt(ad.euTotalReach ?? 0)}</td>
  <td class="text-end">${dailyReach(ad, series, today)}</td>
</tr>`;
    })
    .join('');
  const adHeaders: readonly SortHeader[] = [
    { label: 'Reklama' },
    { label: 'Start' },
    { label: 'Zasięg', sortType: 'number', defaultSort: 'desc' },
    { label: 'Reach/dzień', sortType: 'number' },
  ];
  const adsBlock = card({
    title: 'Lista reklam Meta',
    body: sortableTable(adHeaders, adRows, 'table-hover', 5, 'meta-ads-list'),
    collapsed: true,
    className: 'mt-2',
  });

  const body = `${statGrid(statItems)}${combinedBlock}${collationBlock}${adsBlock}`;
  return body;
}
