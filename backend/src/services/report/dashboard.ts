import { badge, card, money, statGrid, trendBadge } from '../report-components.ts';
import { pctChange } from './format.ts';
import type { ShopSummary } from '@ecommerce-sniffle/analysis';
import type { DailyPoint } from '../storage.ts';

export interface ShopCard {
  readonly id: string;
  readonly domain: string;
  readonly platform: string;
  readonly latestDay: string | null;
  readonly fresh: boolean;
  readonly countdown: boolean;
  readonly sentinel: number;
  readonly suspect: number;
  readonly summary: ShopSummary;
  readonly today: DailyPoint | null;
  readonly prev: DailyPoint | null;
}

export function shopStatusBadge(card: ShopCard): string {
  if (card.summary.snapshotAt === null) {
    return badge('brak danych', 'gray');
  }
  if (!card.fresh) {
    return badge('nieświeże dane', 'yellow');
  }
  if (card.suspect > 0) {
    return badge(`${card.suspect} podejrzane`, 'red');
  }
  return badge('ok', 'green');
}

export function renderShopCard(shopCard: ShopCard): string {
  const soldDelta =
    shopCard.today === null || shopCard.prev === null ? null : pctChange(shopCard.prev.sold, shopCard.today.sold);
  const badges: string[] = [];
  if (shopCard.countdown) {
    badges.push(badge('countdown', 'yellow'));
  }
  if (shopCard.sentinel > 0) {
    badges.push(badge(`${shopCard.sentinel} sentinel`, 'yellow'));
  }
  const footer = `<div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
  <span class="text-secondary fs-6">Sprzedane 24h: <strong>${shopCard.today === null || shopCard.today.sold === 0 ? '--' : `${shopCard.today.sold} szt`}</strong> ${trendBadge(soldDelta)}</span>
  <span>${badges.join('')}${shopStatusBadge(shopCard)}</span>
</div>`;
  const body = statGrid([
    { label: 'Stan', value: `${shopCard.summary.totalItems.toLocaleString('pl-PL')} szt` },
    { label: 'Wartość', value: money(shopCard.summary.totalValue) },
    { label: 'Produkty', value: `${shopCard.summary.uniqueProducts}` },
  ]);
  return `<div class="col-sm-6 col-lg-4">${card({
    title: shopCard.id,
    titleHref: `/shop/${shopCard.id}`,
    subtitle: shopCard.domain,
    body,
    footer,
  })}</div>`;
}
