import { aggregateProductEvents, eventTypeLabel } from '../report-util.ts';
import { summarizeEvents } from '@ecommerce-sniffle/analysis';
import type { StockEvent } from '@ecommerce-sniffle/analysis';
import { card, emptyState, esc, kpiGrid, money, sortableTable } from '../report-components.ts';
import type { KpiCard } from '../report-components.ts';
import { confidenceBadge, productLink, variantCell } from './links.ts';
import { countOrDash, moneyOrDash, pctChange } from './format.ts';
import type { DailyPoint, ShopNames } from '../storage.ts';

const CHANGES_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['sold', 'sprzedane'],
  ['restock', 'dostawione'],
  ['soldOut', 'wyprzedane'],
  ['backInStock', 'powrót'],
  ['promoStart', 'promo start'],
  ['promoEnd', 'promo koniec'],
  ['productNew', 'nowy'],
  ['productRemoved', 'usunięty'],
];

export function quantityCell(event: StockEvent): string {
  const from = event.from === null || event.from.quantity === null ? null : event.from.quantity;
  const to = event.to === null || event.to.quantity === null ? null : event.to.quantity;
  if (from === null && to === null) {
    return '<span data-sort-value="0">-</span>';
  }
  if (from === null) {
    return `<span data-sort-value="${to}">${esc(String(to))}</span>`;
  }
  if (to === null) {
    return `<span data-sort-value="${from}">${esc(String(from))}</span>`;
  }
  if (from === to) {
    return `<span data-sort-value="${to}">${esc(String(to))}</span>`;
  }
  const change = Math.abs(to - from);
  return `<span data-sort-value="${change}"><span class="qty-change">${change}</span><span class="qty-range">(${from} → ${to})</span></span>`;
}

function changedWindowTable(
  label: string,
  events: readonly StockEvent[],
  names: ShopNames,
  platform: string,
  maxQuantity: number
): string {
  const summary = summarizeEvents(events, { maxQuantity });
  const rows: string[] = [];
  for (const group of aggregateProductEvents(events)) {
    for (const event of group.variants) {
      const price = event.to === null || event.to.price === null ? '-' : money(event.to.price);
      rows.push(`<tr data-type="${esc(event.type)}">
  <td>${productLink(names, group.productId)}</td>
  <td>${variantCell(names, group.productId, event.variantId, platform)}</td>
  <td>${esc(eventTypeLabel(event.type))}</td>
  <td class="text-nowrap">${quantityCell(event)}</td>
  <td>${esc(price)}</td>
  <td>${confidenceBadge(event.confidence)}</td>
</tr>`);
    }
  }
  const summaryLine = `Sprzedane ${summary.sold === 0 ? '--' : summary.sold} · Przychód ${moneyOrDash(summary.soldValue)} · Dostawione ${countOrDash(summary.restocked, '')} · Zmiany cen ${countOrDash(summary.priceChanges, '')} · Podejrzane ${summary.suspectCount === 0 ? '--' : summary.suspectCount}`;
  const inner =
    rows.length === 0
      ? emptyState('Brak zmian', 'W tym oknie nic się nie zmieniło.')
      : sortableTable(
          [
            { label: 'Produkt' },
            { label: 'Wariant' },
            { label: 'Typ' },
            { label: 'Ilość', sortType: 'number' },
            { label: 'Cena', sortType: 'number' },
            { label: 'Pewność' },
          ],
          rows.join(''),
          'table-hover'
        );
  return card({
    title: label,
    titleNote: summaryLine,
    body: `<div data-table-wrap data-type-filter="">${inner}</div>`,
    collapsed: true,
  });
}

export function renderChangesWindows(
  day: string,
  morning: readonly StockEvent[],
  evening: readonly StockEvent[],
  names: ShopNames,
  platform: string,
  maxQuantity: number
): string {
  if (morning.length === 0 && evening.length === 0) {
    return emptyState('Brak zmian', `${esc(day)} — w tym dniu nic się nie zmieniło.`);
  }
  const sections: string[] = [];
  sections.push(changedWindowTable('Morning 06:00', morning, names, platform, maxQuantity));
  sections.push(changedWindowTable('Evening 18:00', evening, names, platform, maxQuantity));
  const typeCounts = new Map<string, number>();
  const countType = (event: StockEvent): void => {
    const current = typeCounts.get(event.type);
    typeCounts.set(event.type, (current === undefined ? 0 : current) + 1);
  };
  morning.forEach(countType);
  evening.forEach(countType);
  const options = CHANGES_TYPES.map(([value, label]) => {
    const count = typeCounts.get(value);
    const resolved = count === undefined ? 0 : count;
    return resolved === 0 ? '' : `<option value="${value}">${label} (${resolved})</option>`;
  })
    .filter((entry) => entry !== '')
    .join('');
  const filterSelect = `<div class="d-flex align-items-center gap-2 mb-2">
  <span class="text-secondary fs-6">filtr typu:</span>
  <select class="form-select form-select-sm w-auto" onchange="filterChangesByType(this.value)" aria-label="Filtruj po typie">
    <option value="">wszystkie typy</option>
    ${options}
  </select>
</div>`;
  return `<div id="changes-tables">${filterSelect}${sections.join('\n')}</div>`;
}

export function renderDayComparison(day: string, today: DailyPoint | null, prev: DailyPoint | null): string {
  if (today === null) {
    return emptyState('Brak danych dziennych', `Brak wpisu dla dnia ${esc(day)}.`);
  }
  const kpis: KpiCard[] = [
    {
      label: 'Sprzedane',
      value: `${today.sold} szt`,
      deltaPct: prev === null ? null : pctChange(prev.sold, today.sold),
      icon: 'shopping-cart',
    },
    {
      label: 'Przychód',
      value: money(today.soldValue),
      deltaPct: prev === null ? null : pctChange(prev.soldValue, today.soldValue),
      icon: 'currency-zloty',
    },
    {
      label: 'Dostawione',
      value: countOrDash(today.restocked, 'szt'),
      deltaPct: prev === null ? null : pctChange(prev.restocked, today.restocked),
      icon: 'package',
    },
  ];
  return card({ title: 'Porównanie z poprzednim dniem', body: kpiGrid(kpis), collapsed: true, open: true });
}
