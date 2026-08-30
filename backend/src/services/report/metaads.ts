// Renders the Meta Ads card: the collected ad data for a shop.
// Data display only. No analytics, no spend, no CPA.
// The analytics module computes those later.

import type { MetaAd, MetaAdDay } from '../metaads/types.ts';
import { badge, card, esc, table } from '../report-components.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtInt(value: number): string {
  return value.toLocaleString('pl-PL');
}

function previewUrl(id: string): string {
  return `https://www.facebook.com/ads/archive/render_ad/?id=${id}`;
}

function daysAgo(day: string, today: string): number {
  const from = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 999;
  }
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function platformShort(platform: string): string {
  if (platform === 'FACEBOOK') {
    return 'FB';
  }
  if (platform === 'INSTAGRAM') {
    return 'IG';
  }
  if (platform === 'AUDIENCE_NETWORK') {
    return 'AN';
  }
  if (platform === 'MESSENGER') {
    return 'MSGR';
  }
  if (platform === 'THREADS') {
    return 'TH';
  }
  return platform.slice(0, 4).toUpperCase();
}

interface AgeSum {
  readonly age: string;
  readonly female: number;
  readonly male: number;
  readonly unknown: number;
}

function ageSummary(ads: readonly MetaAd[]): readonly AgeSum[] {
  const byAge = new Map<string, { female: number; male: number; unknown: number }>();
  for (const ad of ads) {
    for (const country of ad.reachBreakdown) {
      for (const band of country.age_gender_breakdowns) {
        const entry = byAge.get(band.age_range);
        if (entry === undefined) {
          byAge.set(band.age_range, { female: band.female, male: band.male, unknown: band.unknown });
        } else {
          entry.female += band.female;
          entry.male += band.male;
          entry.unknown += band.unknown;
        }
      }
    }
  }
  return [...byAge.entries()]
    .map(([age, value]) => ({ age, ...value }))
    .sort((a, b) => b.female + b.male + b.unknown - (a.female + a.male + a.unknown));
}

export function renderMetaAdsCard(ads: readonly MetaAd[], days: readonly MetaAdDay[], today: string): string {
  if (ads.length === 0 && days.length === 0) {
    return '';
  }

  const newCount = ads.filter((ad) => ad.startDate !== null && daysAgo(ad.startDate, today) <= 7).length;

  const reachByDay = new Map<string, number>();
  for (const row of days) {
    reachByDay.set(row.day, (reachByDay.get(row.day) ?? 0) + row.euTotalReach);
  }
  const todayReach = reachByDay.get(today) ?? null;
  const yesterdayKey = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  const yesterdayReach = reachByDay.get(yesterdayKey) ?? null;
  const delta =
    todayReach === null || yesterdayReach === null || yesterdayReach === 0
      ? null
      : Math.round(((todayReach - yesterdayReach) / yesterdayReach) * 100);

  const reachTotal = ads.reduce((sum, ad) => sum + (ad.euTotalReach ?? 0), 0);

  const groups = new Map<string, { count: number; reach: number }>();
  for (const ad of ads) {
    const group = groups.get(ad.creativeHash);
    if (group === undefined) {
      groups.set(ad.creativeHash, { count: 1, reach: ad.euTotalReach ?? 0 });
    } else {
      group.count += 1;
      group.reach += ad.euTotalReach ?? 0;
    }
  }
  const topGroups = [...groups.entries()]
    .filter(([, group]) => group.count > 1)
    .sort((a, b) => b[1].reach - a[1].reach)
    .slice(0, 5);

  const topAds = [...ads].sort((a, b) => (b.euTotalReach ?? 0) - (a.euTotalReach ?? 0)).slice(0, 8);

  const summaryLines: string[] = [];
  summaryLines.push(`aktywne: <strong>${ads.length}</strong>`);
  if (newCount > 0) {
    summaryLines.push(`nowe w 7 dni: <strong>${newCount}</strong>`);
  }
  summaryLines.push(`zasięg (suma): <strong>${fmtInt(reachTotal)}</strong>`);
  if (delta !== null) {
    summaryLines.push(`wzrost zasięgu dziś: <strong>${delta >= 0 ? '+' : ''}${delta}%</strong>`);
  }

  const groupRows = topGroups
    .map(
      ([hash, group]) =>
        `<tr><td class="text-secondary">${esc(hash.slice(0, 8))}</td><td>${group.count} adów</td><td class="text-end">${fmtInt(group.reach)}</td></tr>`
    )
    .join('');
  const groupsBlock =
    topGroups.length === 0
      ? ''
      : `<div class="mt-2"><div class="subheader">Grupy kreatywa (ten sam tekst)</div>${table(['hash', 'liczebność', 'zasięg'], groupRows, 'table-sm')}</div>`;

  const ages = ageSummary(ads).slice(0, 3);
  const ageBlock =
    ages.length === 0
      ? ''
      : `<div class="mt-2"><div class="subheader">Największy zasięg wg wieku</div><div class="d-flex flex-wrap gap-1">${ages
          .map(
            (entry) =>
              `<span class="badge bg-blue-lt">${esc(entry.age)}: ${fmtInt(entry.female + entry.male + entry.unknown)}</span>`
          )
          .join('')}</div></div>`;

  const adRows = topAds
    .map((ad) => {
      const platforms = ad.publisherPlatforms.map((platform) => badge(platformShort(platform), 'gray')).join(' ');
      const start = ad.startDate === null ? '--' : ad.startDate;
      const title = ad.linkTitle[0] ?? ad.creativeBody[0] ?? ad.adArchiveId;
      return `<tr>
  <td><a href="${esc(previewUrl(ad.adArchiveId))}" target="_blank" rel="noopener">${esc(title)}</a></td>
  <td class="text-nowrap">${esc(start)}</td>
  <td class="text-end">${fmtInt(ad.euTotalReach ?? 0)}</td>
  <td class="text-nowrap">${platforms}</td>
</tr>`;
    })
    .join('');

  const body = `
<div class="d-flex flex-wrap gap-3 mb-2">
  ${summaryLines.map((line) => `<div class="text-secondary">${line}</div>`).join('')}
</div>
${groupsBlock}
${ageBlock}
<div class="mt-2">${table(['reklama', 'start', 'zasięg', 'platformy'], adRows, 'table-hover')}</div>`;

  return card({ title: 'Reklamy Meta', body, collapsed: true });
}
