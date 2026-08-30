import { badge, esc, money, sortableTable } from '../report-components.ts';
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

export function renderShopsTable(cards: readonly ShopCard[]): string {
  const rows = cards
    .map((card) => {
      const latestDay =
        card.summary.snapshotAt === null ? '--' : card.summary.snapshotAt.slice(0, 16).replace('T', ' ');
      const sold = card.today === null ? '--' : `${card.today.sold} szt`;
      return `<tr>
  <td class="text-nowrap"><a href="/shop/${esc(card.id)}">${esc(card.id)}</a></td>
  <td class="text-nowrap">${esc(card.domain)}</td>
  <td>${shopStatusBadge(card)}</td>
  <td>${card.summary.totalItems.toLocaleString('pl-PL')}</td>
  <td>${money(card.summary.totalValue)}</td>
  <td>${card.summary.uniqueProducts}</td>
  <td>${sold}</td>
  <td class="text-nowrap">${esc(latestDay)}</td>
</tr>`;
    })
    .join('');
  return sortableTable(
    [
      { label: 'Sklep' },
      { label: 'Domena' },
      { label: 'Status' },
      { label: 'Stan', sortType: 'number' },
      { label: 'Wartość', sortType: 'number' },
      { label: 'Produkty', sortType: 'number' },
      { label: 'Sprzedane 24h', sortType: 'number' },
      { label: 'Ostatni snapshot' },
    ],
    rows,
    'table-hover',
    undefined,
    'shops-table'
  );
}
