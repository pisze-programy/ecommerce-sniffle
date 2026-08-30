import { badge, emptyState, esc, money, sortableTable } from '../report-components.ts';
import { productLink, variantCell } from './links.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';
import type { ShopNames } from '../storage.ts';

export function renderPriceDrops(latest: Snapshot | null, names: ShopNames, platform: string): string {
  if (latest === null) {
    return emptyState('Brak danych', 'Brak snapshotu.');
  }
  const rows: string[] = [];
  for (const variant of latest.variants) {
    if (variant.price === null || variant.regularPrice === null || variant.price >= variant.regularPrice) {
      continue;
    }
    const dropPct =
      variant.regularPrice === 0
        ? 0
        : Math.round(((variant.regularPrice - variant.price) / variant.regularPrice) * 100);
    rows.push(
      `<tr><td>${productLink(names, variant.productId)}</td><td>${variantCell(names, variant.productId, variant.variantId, platform)}</td><td>${money(variant.price)}</td><td>${money(variant.regularPrice)}</td><td><span data-sort-value="${dropPct}">${badge(`-${dropPct}%`, 'red')}</span></td></tr>`
    );
  }
  if (rows.length === 0) {
    return emptyState('Brak obniżek', 'Żaden produkt nie ma ceny niższej od regularnej.');
  }
  return sortableTable(
    [
      { label: 'Produkt' },
      { label: 'Wariant' },
      { label: 'Cena', sortType: 'number' },
      { label: 'Cena regularna', sortType: 'number' },
      { label: 'Rabat', sortType: 'number', defaultSort: 'desc' },
    ],
    rows.join(''),
    'table-hover',
    5,
    'price-drops-table'
  );
}

export function renderTopSellers(
  rows: readonly { productId: string; itemsSold: number; salesValue: number; countdown: boolean }[],
  names: ShopNames
): string {
  if (rows.length === 0) {
    return emptyState('Brak sprzedaży', 'W tym zakresie nie było żadnych zmian stanu.');
  }
  const maxValue = rows[0]?.salesValue === undefined ? 0 : rows[0].salesValue;
  const bodyRows = rows
    .map((row, rank) => {
      const pct = maxValue === 0 ? 0 : Math.round((row.salesValue / maxValue) * 100);
      return `<tr>
  <td>${esc(rank + 1)}</td>
  <td class="text-nowrap">${productLink(names, row.productId)}${row.countdown ? ' ' + badge('countdown', 'yellow') : ''}</td>
  <td>${esc(row.itemsSold)}</td>
  <td>${money(row.salesValue)}</td>
  <td><div class="progress progress-sm"><div class="progress-bar" style="width:${pct}%" data-sort-value="${pct}"></div></div></td>
</tr>`;
    })
    .join('');
  const toggle = `<div class="d-flex align-items-center gap-2 mb-2">
  <span class="text-secondary fs-6">sortuj wg:</span>
  <div class="btn-group btn-group-sm" data-top-metric-group>
    <button class="btn btn-outline-secondary" type="button" data-top-metric="value" data-table-target="#top-sellers-table">Wartość</button>
    <button class="btn btn-outline-secondary active" type="button" data-top-metric="qty" data-table-target="#top-sellers-table">Ilość</button>
  </div>
</div>`;
  return `${toggle}${sortableTable(
    [
      { label: '#' },
      { label: 'Produkt' },
      { label: 'Sprzedane (szt)', sortType: 'number', metric: 'qty', defaultSort: 'desc' },
      { label: 'Wartość', sortType: 'number', metric: 'value' },
      { label: 'Udział', sortType: 'number' },
    ],
    bodyRows,
    'table-hover',
    5,
    'top-sellers-table'
  )}`;
}
