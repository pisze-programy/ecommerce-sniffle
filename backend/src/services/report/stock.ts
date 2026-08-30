import { emptyState, esc, money, sortableTable } from '../report-components.ts';
import { productLink } from './links.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';
import type { ShopNames } from '../storage.ts';

export interface StockProduct {
  productId: string;
  quantity: number;
  maxPrice: number;
  value: number;
  rows: Array<{ variantId: string; quantity: number | null; price: number }>;
}

export function stockQs(day: string): string {
  return day === '' ? '?' : `?day=${encodeURIComponent(day)}`;
}

export function renderStock(
  base: { domain: string; platform: string },
  latest: Snapshot | null,
  names: ShopNames
): string {
  if (latest === null) {
    return emptyState('Brak danych', 'Brak snapshotu dla tego sklepu.');
  }
  const byProduct = new Map<string, StockProduct>();
  for (const variant of latest.variants) {
    if (variant.quantity === null || variant.price === null) {
      continue;
    }
    let entry = byProduct.get(variant.productId);
    if (entry === undefined) {
      entry = { productId: variant.productId, quantity: 0, maxPrice: 0, value: 0, rows: [] };
      byProduct.set(variant.productId, entry);
    }
    entry.quantity += variant.quantity;
    entry.maxPrice = Math.max(entry.maxPrice, variant.price);
    entry.value += variant.quantity * variant.price;
    entry.rows.push({ variantId: variant.variantId, quantity: variant.quantity, price: variant.price });
  }

  let index = 0;
  const bodyRows: string[] = [];
  for (const entry of byProduct.values()) {
    const detailId = `stock-${index}`;
    index += 1;
    const detailBody = `<button class="btn btn-sm btn-outline-secondary mt-2" type="button" data-series-shop="${esc(base.domain)}" data-series-product="${esc(entry.productId)}">historia</button>
  <div class="series mt-2"></div>
  <div class="stock-variants" data-load="/stock-detail/${encodeURIComponent(entry.productId)}?shop=${encodeURIComponent(base.domain)}"></div>`;
    bodyRows.push(`<tr data-row>
  <td class="text-nowrap">${productLink(names, entry.productId)}</td>
  <td>${entry.rows.length}</td>
  <td>${esc(entry.quantity)}</td>
  <td>${money(entry.maxPrice)}</td>
  <td>${money(entry.value)}</td>
  <td><button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${detailId}" aria-expanded="false" aria-controls="${detailId}">szczegóły</button></td>
</tr>
<tr data-pair="1"><td colspan="6" class="p-0"><div class="collapse" id="${detailId}"><div class="p-2">${detailBody}</div></div></td></tr>`);
  }

  if (bodyRows.length === 0) {
    return emptyState('Brak wyników', 'Ten sklep nie ma zapisanych stanów.');
  }
  return sortableTable(
    [
      { label: 'Produkt' },
      { label: 'Warianty', sortType: 'number' },
      { label: 'Ilość', sortType: 'number', defaultSort: 'desc' },
      { label: 'Max cena', sortType: 'number' },
      { label: 'Wartość', sortType: 'number' },
      { label: '' },
    ],
    bodyRows.join(''),
    'table-hover table-nowrap',
    5,
    'stock-table'
  );
}
