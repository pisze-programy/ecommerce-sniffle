import { esc, money, sortableTable } from '../report-components.ts';
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

export function renderShopsTable(cards: readonly ShopCard[]): string {
  const rows = cards
    .map((card) => {
      const sold = card.today === null ? '--' : `${card.today.sold} szt`;
      return `<tr>
  <td class="text-nowrap"><a href="https://${esc(card.domain)}" target="_blank" rel="noopener">${esc(card.domain)}</a></td>
  <td class="text-end">${money(card.summary.totalValue)}</td>
  <td class="text-end">${card.summary.uniqueProducts}</td>
  <td class="text-end">${sold}</td>
</tr>`;
    })
    .join('');
  return sortableTable(
    [
      { label: 'Domena' },
      { label: 'Wartość', sortType: 'number' },
      { label: 'Produkty', sortType: 'number' },
      { label: 'Sprzedane 24h', sortType: 'number' },
    ],
    rows,
    'table-hover',
    undefined,
    'shops-table'
  );
}
