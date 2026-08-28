import { Hono } from 'hono';
import type { ProviderConfig } from '@ecommerce-sniffle/providers';
import type { DailyStats, StockEvent } from '@ecommerce-sniffle/analysis';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { aggregateProductEvents, eventTypeLabel, seedStats } from '../services/report-util.ts';

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --border:#d5d5d5; --muted:#6b6b6b; --good:#1a7f37; --bad:#b42318; --bg:#fafafa; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; margin:0; background:var(--bg); color:#1a1a1a; font-size:14px; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 20px 60px; }
  header { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:18px; }
  h1 { font-size:19px; margin:0; } h1 a { color:#1a1a1a; text-decoration:none; }
  .sub { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:18px; }
  th,td { padding:7px 10px; text-align:left; border-bottom:1px solid var(--border); font-size:13px; }
  th { background:#f1f1f1; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  tr:last-child td { border-bottom:none; }
  .card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:16px; }
  .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:14px; }
  .kpi { border:1px solid var(--border); border-radius:8px; background:#fff; padding:9px 11px; }
  .kpi .label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .kpi .value { font-size:19px; font-weight:600; margin-top:2px; }
  .good { color:var(--good); } .bad { color:var(--bad); }
  .note { color:var(--muted); font-size:12px; }
  select,button { padding:6px 10px; font-size:14px; }
  details { border:1px solid var(--border); border-radius:8px; background:#fff; margin-bottom:8px; }
  details summary { padding:10px 12px; cursor:pointer; font-weight:600; }
  details[open] summary { border-bottom:1px solid var(--border); }
  details table { margin:0; border:none; }
  .variant-table th { font-size:10px; }
  .stock-group summary .subrow { font-weight:400; color:var(--muted); margin-left:10px; font-size:12px; }
  .sortbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .seed-title { font-size:16px; font-weight:600; margin:20px 0 6px; }
</style>
</head>
<body>
<div class="wrap">
${body}
</div>
<script>
function sortStock() {
  const list = document.getElementById('stock-groups');
  const groups = [...list.querySelectorAll(':scope > details')];
  const dir = list.dataset.dir === 'asc' ? -1 : 1;
  list.dataset.dir = dir === 1 ? 'asc' : 'desc';
  groups.sort((a, b) => dir * (Number(a.dataset.price) - Number(b.dataset.price)));
  groups.forEach((g) => list.appendChild(g));
  document.getElementById('sortLabel').textContent = dir === 1 ? 'cena ▲' : 'cena ▼';
}
async function loadSeries(summary, shop, productId) {
  if (summary.dataset.loaded === '1') return;
  summary.dataset.loaded = '1';
  const holder = summary.parentElement.querySelector('.series');
  try {
    const res = await fetch('/series/' + encodeURIComponent(productId) + '?shop=' + encodeURIComponent(shop));
    const data = await res.json();
    if (!data.series || data.series.length === 0) { holder.innerHTML = '<p class="note">brak historii</p>'; return; }
    const rows = data.series.map((p) => '<tr><td>' + (p.snapshotAt || '').slice(0, 16).replace('T', ' ') + '</td><td>' + (p.quantity === null ? '-' : p.quantity) + '</td><td>' + (p.price === null ? '-' : p.price.toFixed(2)) + '</td></tr>').join('');
    holder.innerHTML = '<table><thead><tr><th>snapshot</th><th>ilość</th><th>cena</th></tr></thead><tbody>' + rows + '</tbody></table>';
  } catch (e) {
    holder.innerHTML = '<p class="note">błąd ładowania historii</p>';
  }
}
</script>
</body>
</html>`;
}

function fmtMoney(amount: number): string {
  return amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value: string | null): string {
  if (value === null || value.length === 0) {
    return '-';
  }
  return value.slice(0, 16).replace('T', ' ');
}

function dayBefore(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return '';
  }
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function isCountdownShop(domain: string): boolean {
  return domain === 'laboratoriumpanidomu.pl' || domain === 'wkdzik.pl' || domain === 'osmpower.pl';
}

function productUrl(map: Map<string, string>, productId: string): string | null {
  const url = map.get(productId);
  if (url !== undefined) {
    return url;
  }
  if (/^https?:\/\//.test(productId)) {
    return productId;
  }
  return null;
}

function productLink(map: Map<string, string>, productId: string): string {
  const url = productUrl(map, productId);
  if (url === null) {
    return esc(productId);
  }
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(productId)}</a>`;
}

export function shopifyVariantUrl(url: string, variantId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}variant=${variantId}`;
}

function renderKpis(items: Array<{ label: string; value: string; cls?: string }>): string {
  return `<div class="kpis">${items
    .map(
      (item) =>
        `<div class="kpi"><div class="label">${esc(item.label)}</div><div class="value ${esc(item.cls ?? '')}">${esc(item.value)}</div></div>`
    )
    .join('')}</div>`;
}

function renderChanges(events: readonly StockEvent[], map: Map<string, string>): string {
  if (events.length === 0) {
    return '<p class="note">Brak zmian w tym seedzie.</p>';
  }
  const groups = aggregateProductEvents(events);
  const stats = seedStats(events);
  const kpi = renderKpis([
    { label: 'Sprzedane', value: String(stats.sold) },
    { label: 'Dostawione', value: String(stats.restocked), cls: 'good' },
    { label: 'Wyprzedane', value: String(stats.soldOut), cls: 'bad' },
    { label: 'Powrót', value: String(stats.backInStock) },
    { label: 'Promo', value: String(stats.promo) },
  ]);
  const rows = groups
    .map((group) => {
      const link = productLink(map, group.productId);
      const total = group.sold + group.restocked + group.soldOut + group.backInStock;
      const variantRows = group.variants
        .map(
          (event) =>
            `<tr><td>${esc(event.variantId)}</td><td>${esc(eventTypeLabel(event.type))}</td><td>${esc(event.units)}</td><td>${esc(event.confidence)}</td></tr>`
        )
        .join('');
      const accordion =
        group.variants.length <= 1
          ? esc(group.variants[0]?.variantId ?? '')
          : `<details><summary>${group.variants.length} wariantów</summary>
              <table class="variant-table">
                <thead><tr><th>wariant</th><th>typ</th><th>j.</th><th>pewność</th></tr></thead>
                <tbody>${variantRows}</tbody>
              </table>
            </details>`;
      return `<tr>
        <td>${link}<br>${accordion}</td>
        <td>${group.sold}</td>
        <td>${group.restocked}</td>
        <td>${group.soldOut}</td>
        <td>${group.backInStock}</td>
        <td>${group.promo}</td>
        <td>${total}</td>
      </tr>`;
    })
    .join('');
  return `${kpi}
  <table>
    <thead><tr><th>produkt</th><th>sprzedane</th><th>dostawione</th><th>wyprzedane</th><th>powrót</th><th>promo</th><th>zmiany</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

interface StockRow {
  readonly productId: string;
  readonly variantId: string;
  readonly title: string;
  readonly quantity: number | null;
  readonly price: number;
  readonly value: number;
  readonly url: string | null;
}

function renderStock(groups: readonly (readonly StockRow[])[], domain: string, platform: string): string {
  if (groups.length === 0) {
    return '<p class="note">Brak danych (brak snapshotu).</p>';
  }
  const shopifyVariant = platform === 'shopify';
  const block = groups
    .map((rows) => {
      const first = rows[0];
      if (first === undefined) {
        return '';
      }
      const link =
        first.url === null
          ? esc(first.productId)
          : `<a href="${esc(first.url)}" target="_blank" rel="noopener">${esc(first.productId)}</a>`;
      const maxPrice = Math.max(...rows.map((row) => row.price));
      const value = rows.reduce((sum, row) => sum + row.value, 0);
      const variantRows = rows
        .map((row) => {
          const variantCell =
            shopifyVariant && row.url !== null
              ? `<a href="${esc(shopifyVariantUrl(row.url, row.variantId))}" target="_blank" rel="noopener">${esc(row.variantId)}</a>`
              : esc(row.title);
          return `<tr><td>${variantCell}</td><td>${row.quantity === null ? '-' : esc(row.quantity)}</td><td>${fmtMoney(row.price)}</td><td>${fmtMoney(row.value)}</td></tr>`;
        })
        .join('');
      return `<details class="stock-group" data-price="${esc(maxPrice)}" data-value="${esc(value)}">
        <summary>${link}<span class="subrow">${rows.length} wariantów · max cena ${fmtMoney(maxPrice)} · wartość ${fmtMoney(value)}</span></summary>
        <table class="variant-table">
          <thead><tr><th>wariant</th><th>ilość</th><th>cena</th><th>wartość</th></tr></thead>
          <tbody>${variantRows}</tbody>
        </table>
        <div class="series"></div>
        <div class="note" onclick="loadSeries(this, '${esc(domain)}', '${esc(first.productId)}')">pokaż historię</div>
      </details>`;
    })
    .join('');
  return `<div class="sortbar"><button onclick="sortStock()" id="sortLabel">cena ▼</button><span class="note">sortowanie grup produktów po max cenie</span></div>
  <div id="stock-groups">${block}</div>`;
}

export function createReportRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/report', async (c) => {
    const modules = c.get('modules');
    const storage = c.get('storage');
    const rows: string[] = [];
    for (const module of modules) {
      if (!module.config.enabled) {
        continue;
      }
      const config = module.config;
      const latest = await storage.readLatestSnapshot(config.domain);
      const days = await storage.readDayCount(config.domain);
      const first = await storage.readFirstSeed(config.domain);
      const when = latest === null ? '-' : fmtDate(latest.snapshotAt);
      rows.push(`<tr>
        <td><a href="/report/${esc(config.id)}">${esc(config.id)}</a></td>
        <td>${esc(config.domain)}</td>
        <td>${esc(config.mode)}</td>
        <td>${when}</td>
        <td>${days}</td>
        <td>${esc(first ?? '-')}</td>
      </tr>`);
    }
    const body = `
<header>
  <h1><a href="/report">ecommerce-sniffle</a></h1>
  <span class="sub">raport dzienny — wszystkie sklepy</span>
</header>
<table>
  <thead><tr><th>sklep</th><th>domena</th><th>mode</th><th>ostatni snapshot</th><th>liczba dni</th><th>pierwszy seed</th></tr></thead>
  <tbody>${rows.join('')}</tbody>
</table>
<p class="note">Kliknij sklep, aby zobaczyć zmiany i stan magazynowy.</p>`;
    return c.html(pageShell('ecommerce-sniffle — raport', body));
  });

  api.get('/report/:shop', async (c) => {
    const shop = c.req.param('shop');
    const modules = c.get('modules');
    const storage = c.get('storage');
    const module = modules.find((entry) => entry.config.id === shop);
    if (module === undefined || !module.config.enabled) {
      return c.html(
        pageShell(
          'Nieznany sklep',
          `<p class="bad">Nieznany sklep: ${esc(shop)}</p><p><a href="/report">&larr; wróć</a></p>`
        ),
        404
      );
    }
    const config: ProviderConfig = module.config;
    const domain = config.domain;
    const days = await storage.readAvailableDays(domain);
    const day = c.req.query('day') ?? days[0] ?? '';
    const daily: DailyStats | null = await storage.readDailyStats(domain, day);
    const previous: DailyStats | null = await storage.readDailyStats(domain, dayBefore(day));
    const morningEvents = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'morning');
    const eveningEvents = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'evening');
    const latest = await storage.readLatestSnapshot(domain);

    // Product url map for every id in view. No live fetch.
    const urlMap = await storage.readProductUrls(domain);

    const dayOptions = days
      .map((d) => `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${esc(d)}</option>`)
      .join('');

    const dayKpis =
      daily === null
        ? '<p class="note">Brak danych dziennych.</p>'
        : renderKpis([
            { label: 'Sprzedane', value: String(daily.unitsSold) },
            { label: 'Dostawione', value: String(daily.restocked), cls: 'good' },
            { label: 'Przychód', value: fmtMoney(daily.revenue) },
            { label: 'Sold-out', value: String(daily.soldOutCount), cls: 'bad' },
            { label: 'Masked', value: String(daily.maskedCount), cls: 'bad' },
          ]);

    const prevLine =
      previous === null
        ? ''
        : `<p class="note">Poprzedni dzień (${esc(previous.day)}): sprzedane ${previous.unitsSold}, dostawione ${previous.restocked}, przychód ${fmtMoney(previous.revenue)}.</p>`;

    // Stock value table from the latest snapshot.
    const byProduct = new Map<string, StockRow[]>();
    if (latest !== null) {
      for (const variant of latest.variants) {
        if (variant.quantity === null || variant.price === null) {
          continue;
        }
        const rows = byProduct.get(variant.productId) ?? [];
        const url = urlMap.get(variant.productId) ?? null;
        rows.push({
          productId: variant.productId,
          variantId: variant.variantId,
          title: variant.variantId,
          quantity: variant.quantity,
          price: variant.price,
          value: variant.quantity * variant.price,
          url,
        });
        byProduct.set(variant.productId, rows);
      }
    }
    const stockGroups = [...byProduct.values()].sort(
      (a, b) => Math.max(...b.map((row) => row.price)) - Math.max(...a.map((row) => row.price))
    );

    const note = isCountdownShop(domain)
      ? '<p class="note">Uwaga: ten sklep liczy stan od dużego sentinela w dół. Analiza zmian działa; wartość bezwzględna może być zawyżona.</p>'
      : '';

    const body = `
<header>
  <h1><a href="/report">ecommerce-sniffle</a> / ${esc(config.id)}</h1>
  <span class="sub">${esc(domain)} · ${esc(config.mode)} · ${esc(config.platform)}</span>
</header>
<form method="get">
  <label for="day">Dzień:</label>
  <select name="day" id="day" onchange="this.form.submit()">${dayOptions}</select>
</form>
${note}
<h2 class="seed-title">Dzień (ogółem)</h2>
${dayKpis}
${prevLine}
<h2 class="seed-title">Seed morning (${esc(day)})</h2>
${renderChanges(morningEvents, urlMap)}
<h2 class="seed-title">Seed evening (${esc(day)})</h2>
${renderChanges(eveningEvents, urlMap)}
<h2 class="seed-title">Stan magazynowy (ostatni snapshot)</h2>
${renderStock(stockGroups, domain, config.platform)}
<p class="note"><a href="/report">&larr; wszystkie sklepy</a></p>`;
    return c.html(pageShell(`ecommerce-sniffle — ${config.id}`, body));
  });

  return api;
}
