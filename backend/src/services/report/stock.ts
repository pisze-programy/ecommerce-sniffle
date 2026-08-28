import { emptyState, esc, money } from '../report-components.ts';
import { productLink } from './links.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';

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

function sortHeader(
  label: string,
  key: string,
  sort: string,
  dir: string,
  day: string,
  q: string,
  low: string
): string {
  const active = sort === key;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
  const arrow = active ? (dir === 'asc' ? '▲' : '▼') : '';
  return `<a class="text-reset" href="${esc(stockQs(day, { sort: key, dir: nextDir, q, low }))}">${esc(label)} ${arrow}</a>`;
}

function renderPagination(
  page: number,
  totalPages: number,
  day: string,
  q: string,
  sort: string,
  dir: string,
  low: string
): string {
  if (totalPages <= 1) {
    return '';
  }
  const prevPage = page > 1 ? page - 1 : 1;
  const nextPage = page < totalPages ? page + 1 : totalPages;
  const items: string[] = [];
  items.push(
    `<li class="page-item${page === 1 ? ' disabled' : ''}"><a class="page-link" href="${esc(stockQs(day, { page: String(prevPage), q, sort, dir, low }))}">‹</a></li>`
  );
  for (let p = 1; p <= totalPages; p += 1) {
    const cls = p === page ? ' active' : '';
    const current = p === page ? ' aria-current="page"' : '';
    items.push(
      `<li class="page-item${cls}"><a class="page-link" href="${esc(stockQs(day, { page: String(p), q, sort, dir, low }))}"${current}>${p}</a></li>`
    );
  }
  items.push(
    `<li class="page-item${page === totalPages ? ' disabled' : ''}"><a class="page-link" href="${esc(stockQs(day, { page: String(nextPage), q, sort, dir, low }))}">›</a></li>`
  );
  return `<nav class="mt-2" aria-label="paginacja"><ul class="pagination pagination-sm mb-0">${items.join('')}</ul></nav>`;
}

export function renderStock(
  base: { domain: string; platform: string },
  latest: Snapshot | null,
  urlMap: Map<string, string>,
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
  const q = params.q.trim().toLowerCase();
  const lowThreshold = params.low === '' ? null : Number(params.low);
  const filtered = [...byProduct.values()].filter((entry) => {
    if (q !== '') {
      const byQ =
        entry.productId.toLowerCase().includes(q) || entry.rows.some((row) => row.variantId.toLowerCase().includes(q));
      if (!byQ) {
        return false;
      }
    }
    if (lowThreshold !== null && Number.isFinite(lowThreshold)) {
      if (entry.quantity > lowThreshold) {
        return false;
      }
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (params.sort === 'qty') {
      cmp = a.quantity - b.quantity;
    } else if (params.sort === 'price') {
      cmp = a.maxPrice - b.maxPrice;
    } else if (params.sort === 'id') {
      cmp = a.productId < b.productId ? -1 : 1;
    } else {
      cmp = a.value - b.value;
    }
    return params.dir === 'asc' ? cmp : -cmp;
  });
  const per = 25;
  const totalPages = Math.max(1, Math.ceil(sorted.length / per));
  const page = Math.min(params.page, totalPages);
  const slice = sorted.slice((page - 1) * per, page * per);

  let index = 0;
  const rows = slice
    .map((entry) => {
      const detailId = `stock-${index}`;
      index += 1;
      const detailBody = `<button class="btn btn-sm btn-outline-secondary mt-2" type="button" data-series-shop="${esc(base.domain)}" data-series-product="${esc(entry.productId)}">historia</button>
  <div class="series mt-2"></div>
  <div class="stock-variants" data-load="/stock-detail/${encodeURIComponent(entry.productId)}?shop=${encodeURIComponent(base.domain)}"></div>`;
      return `<tr>
  <td class="text-nowrap">${productLink(urlMap, entry.productId)}</td>
  <td>${entry.rows.length}</td>
  <td>${esc(entry.quantity)}</td>
  <td>${money(entry.maxPrice)}</td>
  <td>${money(entry.value)}</td>
  <td><button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${detailId}" aria-expanded="false" aria-controls="${detailId}">szczegóły</button></td>
</tr>
<tr><td colspan="6" class="p-0"><div class="collapse" id="${detailId}"><div class="p-2">${detailBody}</div></div></td></tr>`;
    })
    .join('');

  const lowLink =
    params.low === ''
      ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(stockQs(params.day, { q: params.q, sort: params.sort, dir: params.dir, low: '5' }))}">tylko niski stan</a>`
      : `<a class="btn btn-sm btn-outline-secondary" href="${esc(stockQs(params.day, { q: params.q, sort: params.sort, dir: params.dir, low: '' }))}">wszystkie</a>`;
  const searchForm = `<form method="get" class="mb-2 d-flex gap-2">
  ${params.day === '' ? '' : `<input type="hidden" name="day" value="${esc(params.day)}">`}
  <input type="hidden" name="sort" value="${esc(params.sort)}">
  <input type="hidden" name="dir" value="${esc(params.dir)}">
  ${params.low === '' ? '' : `<input type="hidden" name="low" value="${esc(params.low)}">`}
  <input class="form-control" type="search" name="q" value="${esc(params.q)}" placeholder="szukaj produktu lub wariantu">
  <button class="btn btn-outline-secondary">Szukaj</button>
  ${lowLink}
</form>`;
  const header = `<thead><tr><th>Produkt</th><th>Warianty</th><th>${sortHeader('Ilość', 'qty', params.sort, params.dir, params.day, params.q, params.low)}</th><th>${sortHeader('Max cena', 'price', params.sort, params.dir, params.day, params.q, params.low)}</th><th>${sortHeader('Wartość', 'value', params.sort, params.dir, params.day, params.q, params.low)}</th><th></th></tr></thead>`;
  if (rows.trim().length === 0) {
    return `${searchForm}${emptyState('Brak wyników', params.q === '' ? 'Ten sklep nie ma zapisanych stanów.' : `Brak produktu lub wariantu pasującego do „${params.q}”.`)}`;
  }
  const from = sorted.length === 0 ? 0 : (page - 1) * per + 1;
  const to = Math.min(page * per, sorted.length);
  const footer = `<div class="text-secondary fs-6 mt-2">Pokazano ${from}–${to} z ${sorted.length} produktów.</div>`;
  return `${searchForm}<div class="table-responsive"><table class="table table-vcenter card-table table-hover table-nowrap">${header}<tbody>${rows}</tbody></table></div>${renderPagination(page, totalPages, params.day, params.q, params.sort, params.dir, params.low)}${footer}`;
}
