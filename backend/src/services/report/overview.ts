import { badge, emptyState, esc, money, table } from '../report-components.ts';
import { productLink, variantCell } from './links.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';

export function renderLowStock(
  latest: Snapshot | null,
  urlMap: Map<string, string>,
  platform: string,
  threshold: number
): string {
  if (latest === null) {
    return emptyState('Brak danych', 'Brak snapshotu.');
  }
  const rows: string[] = [];
  for (const variant of latest.variants) {
    if (variant.quantity === null || variant.quantity <= 0 || variant.quantity > threshold) {
      continue;
    }
    const price = variant.price === null ? '-' : money(variant.price);
    rows.push(
      `<tr><td>${productLink(urlMap, variant.productId)}</td><td>${variantCell(urlMap, variant.productId, variant.variantId, platform)}</td><td>${esc(variant.quantity)}</td><td>${esc(price)}</td></tr>`
    );
  }
  if (rows.length === 0) {
    return emptyState('Brak niskich stanów', `Żaden produkt nie ma ilości 1–${threshold}.`);
  }
  return capTable(['produkt', 'wariant', 'ilość', 'cena'], rows, 'table-hover');
}

export function renderPriceDrops(latest: Snapshot | null, urlMap: Map<string, string>, platform: string): string {
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
      `<tr><td>${productLink(urlMap, variant.productId)}</td><td>${variantCell(urlMap, variant.productId, variant.variantId, platform)}</td><td>${money(variant.price)}</td><td>${money(variant.regularPrice)}</td><td>${badge(`-${dropPct}%`, 'red')}</td></tr>`
    );
  }
  if (rows.length === 0) {
    return emptyState('Brak obniżek', 'Żaden produkt nie ma ceny niższej od regularnej.');
  }
  return capTable(['produkt', 'wariant', 'cena', 'cena regularna', 'rabat'], rows, 'table-hover');
}

function capTable(headers: readonly string[], rows: readonly string[], className: string): string {
  const visible = rows.slice(0, 50);
  const note =
    rows.length <= 50 ? '' : `<p class="text-secondary fs-6 mt-1 mb-0">Pokazano 50 z ${rows.length} pozycji.</p>`;
  return `${table(headers, visible.join(''), className)}${note}`;
}

export function renderTopSellers(
  rows: readonly { productId: string; itemsSold: number; salesValue: number; countdown: boolean }[],
  urlMap: Map<string, string>
): string {
  if (rows.length === 0) {
    return emptyState('Brak sprzedaży', 'W tym zakresie nie było żadnych zmian stanu.');
  }
  const maxValue = rows.length === 0 ? 0 : rows[0]?.salesValue === undefined ? 0 : rows[0].salesValue;
  const bodyRows = rows
    .map((row, rank) => {
      const pct = maxValue === 0 ? 0 : Math.round((row.salesValue / maxValue) * 100);
      return `<tr>
  <td>${esc(rank + 1)}</td>
  <td class="text-nowrap">${productLink(urlMap, row.productId)}${row.countdown ? ' ' + badge('countdown', 'yellow') : ''}</td>
  <td>${esc(row.itemsSold)}</td>
  <td>${money(row.salesValue)}</td>
  <td><div class="progress progress-sm"><div class="progress-bar" style="width:${pct}%"></div></div></td>
</tr>`;
    })
    .join('');
  return table(['#', 'Produkt', 'Sprzedane (szt)', 'Wartość', 'Udział'], bodyRows, 'table-hover');
}
