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

export interface StockParams {
  readonly day: string;
  readonly q: string;
  readonly sort: string;
  readonly dir: string;
  readonly page: number;
  readonly low: string;
}

export function stockQs(day: string, extra: Readonly<Record<string, string>>): string {
  const parts: string[] = [];
  if (day !== '') {
    parts.push(`day=${encodeURIComponent(day)}`);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== '') {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length === 0 ? '?' : `?${parts.join('&')}`;
}

export function renderStock(
  base: { domain: string; platform: string },
  latest: Snapshot | null,
  names: ShopNames,
  params: StockParams
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
  const lowThreshold = params.low === '' ? null : Number(params.low);

  const controls = `<div class="d-flex flex-wrap gap-2 mb-2">
  <input class="form-control" type="search" data-table-filter="#stock-table" placeholder="szukaj produktu lub wariantu" aria-label="Szukaj produktu lub wariantu">
  <label class="form-check form-switch form-check-inline ms-auto">
    <input class="form-check-input" type="checkbox" data-table-low="#stock-table">
    <span class="form-check-label">tylko niski stan</span>
  </label>
</div>`;

  let index = 0;
  const bodyRows: string[] = [];
  for (const entry of byProduct.values()) {
    const detailId = `stock-${index}`;
    index += 1;
    const productTitle = names.productTitles.get(entry.productId);
    const productTitleText = productTitle === undefined ? '' : productTitle;
    const terms: string[] = [entry.productId, productTitleText];
    for (const row of entry.rows) {
      const variantTitle = names.variantTitles.get(row.variantId);
      if (variantTitle !== undefined && variantTitle.length > 0) {
        terms.push(variantTitle);
      }
      terms.push(row.variantId);
    }
    const search = terms.join(' ').toLowerCase();
    const lowQty = lowThreshold !== null && Number.isFinite(lowThreshold) && entry.quantity <= lowThreshold ? '1' : '0';
    const detailBody = `<button class="btn btn-sm btn-outline-secondary mt-2" type="button" data-series-shop="${esc(base.domain)}" data-series-product="${esc(entry.productId)}">historia</button>
  <div class="series mt-2"></div>
  <div class="stock-variants" data-load="/stock-detail/${encodeURIComponent(entry.productId)}?shop=${encodeURIComponent(base.domain)}"></div>`;
    bodyRows.push(`<tr data-row data-search="${esc(search)}" data-lowqty="${lowQty}">
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
    return `${controls}${emptyState('Brak wyników', 'Ten sklep nie ma zapisanych stanów.')}`;
  }
  return `<div data-table-wrap>${controls}${sortableTable(
    [
      { label: 'Produkt' },
      { label: 'Warianty', sortType: 'number' },
      { label: 'Ilość', sortType: 'number' },
      { label: 'Max cena', sortType: 'number' },
      { label: 'Wartość', sortType: 'number' },
      { label: '' },
    ],
    bodyRows.join(''),
    'table-hover table-nowrap',
    25,
    'stock-table'
  )}</div>`;
}
