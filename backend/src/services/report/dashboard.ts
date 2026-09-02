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

// Two lines stacked in one cell. The sort key is the top value.
function stackedCell(top: string, bottom: string, sortValue: number | string): string {
  return `<span data-sort-value="${sortValue}"><span class="qty-change">${top}</span><span class="qty-range">${bottom}</span></span>`;
}

export function renderShopsTable(cards: readonly ShopCard[]): string {
  const rows = cards
    .map((card) => {
      const products = stackedCell(
        String(card.summary.uniqueProducts),
        String(card.summary.variantCount),
        card.summary.uniqueProducts
      );
      const sold =
        card.today === null
          ? '--'
          : stackedCell(`${card.today.sold} szt`, money(card.today.soldValue), card.today.sold);
      return `<tr>
  <td class="text-nowrap"><a href="/shop/${esc(card.id)}">${esc(card.domain)}</a></td>
  <td class="text-end">${money(card.summary.totalValue)}</td>
  <td class="text-end">${products}</td>
  <td class="text-end">${sold}</td>
</tr>`;
    })
    .join('');
  return sortableTable(
    [
      { label: 'Domena' },
      { label: 'Wartość', sortType: 'number' },
      { label: 'Produkty (wariant)', sortType: 'number' },
      { label: 'Sprzedane 24h', sortType: 'number' },
    ],
    rows,
    'table-hover',
    undefined,
    'shops-table'
  );
}
