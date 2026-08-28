import { Hono } from 'hono';
import type { ProviderConfig } from '@ecommerce-sniffle/providers';
import {
  COUNTDOWN_DOMAINS,
  calculateShopSummary,
  isCountdownShop,
  topSellingProducts,
} from '@ecommerce-sniffle/analysis';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import {
  alert,
  badge,
  breadcrumb,
  card,
  datagrid,
  emptyState,
  esc,
  icon,
  kpiGrid,
  money,
  table,
} from '../services/report-components.ts';
import type { DataGridItem, KpiCard } from '../services/report-components.ts';
import { addDays, dayAfter, dayBefore, fmtDate, pctChange } from '../services/report/format.ts';
import { shopifyVariantUrl } from '../services/report/links.ts';
import { buildDailyConfig, buildTrendConfig, buildTrendSeries, chartBlock } from '../services/report/charts.ts';
import { renderStock, stockQs } from '../services/report/stock.ts';
import type { StockParams } from '../services/report/stock.ts';
import { renderChangesWindows, renderDayComparison, renderTimeline } from '../services/report/changes.ts';
import { renderLowStock, renderPriceDrops, renderTopSellers } from '../services/report/overview.ts';
import { renderShopCard } from '../services/report/dashboard.ts';
import type { ShopCard } from '../services/report/dashboard.ts';
import { pageShell } from '../services/report/shell.ts';
import { variantCell } from '../services/report/links.ts';

export { shopifyVariantUrl };

export function createReportRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/dashboard', async (c) => {
    const modules = c.get('modules');
    const storage = c.get('storage');
    const enabled = modules.filter((module) => module.config.enabled);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const cards: ShopCard[] = await Promise.all(
      enabled.map(async (module) => {
        const config = module.config;
        const [latest, dailyRange] = await Promise.all([
          storage.readLatestSnapshot(config.domain),
          storage.readShopDailyRange(config.domain, dayBefore(today), today),
        ]);
        const summary = calculateShopSummary(latest === null ? [] : [latest]);
        const latestDay = latest === null ? null : latest.snapshotAt.slice(0, 10);
        const todayPoint = dailyRange.find((point) => point.day === today) ?? null;
        const prevPoint = dailyRange.find((point) => point.day === dayBefore(today)) ?? null;
        const fresh =
          latest === null ? false : dayBefore(now.toISOString().slice(0, 10)) <= latest.snapshotAt.slice(0, 10);
        return {
          id: config.id,
          domain: config.domain,
          platform: config.platform,
          latestDay,
          fresh,
          countdown: isCountdownShop(config.domain),
          sentinel: summary.bias.sentinelVariants,
          suspect: todayPoint === null ? 0 : todayPoint.suspect,
          summary,
          today: todayPoint,
          prev: prevPoint,
        };
      })
    );

    const normalCards = cards.filter((card) => !card.countdown);
    const sumValue = normalCards.reduce((acc, card) => acc + card.summary.totalValue, 0);
    const sumItems = normalCards.reduce((acc, card) => acc + card.summary.totalItems, 0);
    const sumSoldToday = normalCards.reduce((acc, card) => acc + (card.today === null ? 0 : card.today.sold), 0);
    const sumSoldPrev = normalCards.reduce((acc, card) => acc + (card.prev === null ? 0 : card.prev.sold), 0);
    const sumRestockToday = normalCards.reduce(
      (acc, card) => acc + (card.today === null ? 0 : card.today.restocked),
      0
    );
    const sumRestockPrev = normalCards.reduce((acc, card) => acc + (card.prev === null ? 0 : card.prev.restocked), 0);
    const countdownCount = cards.filter((card) => card.countdown).length;

    const portfolio = await storage.readPortfolioDaily(addDays(today, -13), today, COUNTDOWN_DOMAINS);
    const portfolioLabels = portfolio.map((point) => point.day.slice(5));
    const portfolioValueChart = chartBlock('chart-portfolio-value', {
      type: 'area',
      height: 260,
      series: [{ name: 'wartość sprzedaży (PLN)', data: portfolio.map((point) => point.soldValue) }],
      xaxis: { categories: portfolioLabels },
    });
    const portfolioMixChart = chartBlock('chart-portfolio-mix', {
      type: 'line',
      height: 260,
      series: [
        { name: 'sprzedane', type: 'bar', data: portfolio.map((point) => point.sold) },
        { name: 'dostawione', type: 'line', data: portfolio.map((point) => point.restocked) },
      ],
      xaxis: { categories: portfolioLabels },
      plotOptions: { bar: { columnWidth: '55%' } },
    });

    const alerts: string[] = [];
    for (const cardEntry of cards) {
      const link = `<a href="/shop/${esc(cardEntry.id)}">${esc(cardEntry.id)}</a>`;
      if (cardEntry.summary.snapshotAt === null) {
        alerts.push(`<tr><td>${link}</td><td>${badge('brak danych', 'gray')}</td><td>${icon('x')}</td></tr>`);
      } else if (!cardEntry.fresh) {
        alerts.push(
          `<tr><td>${link}</td><td>${badge('nieświeże dane', 'yellow')}</td><td>ostatni snapshot: ${esc(fmtDate(cardEntry.summary.snapshotAt))}</td></tr>`
        );
      } else if (cardEntry.suspect > 0) {
        alerts.push(
          `<tr><td>${link}</td><td>${badge(`${cardEntry.suspect} podejrzane`, 'red')}</td><td>zobacz dzień w sklepie</td></tr>`
        );
      } else if (cardEntry.countdown) {
        alerts.push(
          `<tr><td>${link}</td><td>${badge('countdown', 'yellow')}</td><td>stan liczy od sentinela w dół</td></tr>`
        );
      }
    }
    const alertsTable =
      alerts.length === 0
        ? emptyState('Wszystko w porządku', 'Brak alertów do wyświetlenia.')
        : table(['sklep', 'status', 'szczegóły'], alerts.join(''), 'table-hover');

    const topSold = [...cards]
      .filter((card) => !card.countdown && card.today !== null && card.today.sold > 0)
      .sort((a, b) => (b.today === null ? 0 : b.today.sold) - (a.today === null ? 0 : a.today.sold))
      .slice(0, 10);
    const soldChart = chartBlock('chart-top-sold', {
      type: 'bar',
      height: 260,
      series: [{ name: 'sprzedane', data: topSold.map((card) => (card.today === null ? 0 : card.today.sold)) }],
      xaxis: { categories: topSold.map((card) => card.id) },
      plotOptions: { bar: { horizontal: true, barHeight: '50%' } },
    });

    const kpis: KpiCard[] = [
      { label: 'Wartość stanu', value: money(sumValue), deltaPct: null, icon: 'currency-zloty' },
      { label: 'Sztuki w magazynie', value: `${sumItems.toLocaleString('pl-PL')} szt`, deltaPct: null, icon: 'box' },
      {
        label: 'Sprzedane 24h',
        value: `${sumSoldToday.toLocaleString('pl-PL')} szt`,
        deltaPct: pctChange(sumSoldPrev, sumSoldToday),
        icon: 'shopping-cart',
      },
      {
        label: 'Dostawione 24h',
        value: `${sumRestockToday.toLocaleString('pl-PL')} szt`,
        deltaPct: pctChange(sumRestockPrev, sumRestockToday),
        icon: 'package',
      },
    ];

    const countdownNote =
      countdownCount === 0
        ? ''
        : alert(
            `Wartości zbiorcze pomijają ${countdownCount} sklepy countdown (${COUNTDOWN_DOMAINS.map((domain) => esc(domain)).join(', ')}), bo ich stan liczy od sentinela w dół.`,
            'yellow',
            'Uwaga o sentinelach'
          );

    const shopCards = cards.map(renderShopCard).join('');

    const body = `
${kpiGrid(kpis)}
${countdownNote}
<div class="row row-deck row-cards mt-2">
  <div class="col-12 col-lg-6">${card({ title: 'Wartość sprzedaży — 14 dni', body: portfolioValueChart })}</div>
  <div class="col-12 col-lg-6">${card({ title: 'Sprzedane vs dostawione — 14 dni', body: portfolioMixChart })}</div>
  <div class="col-12 col-lg-6">${card({ title: 'Sprzedane 24h — top 10', body: soldChart })}</div>
  <div class="col-12 col-lg-6">${card({ title: 'Alerty', body: alertsTable })}</div>
</div>
<div class="row row-cards mt-2">${shopCards}</div>`;
    return c.html(pageShell('ecommerce-sniffle — dashboard', body));
  });

  api.get('/search', async (c) => {
    const q = c.req.query('q');
    if (q === undefined || q.trim().length === 0) {
      return c.redirect('/dashboard', 302);
    }
    const query = q.trim();
    const storage = c.get('storage');
    const modules = c.get('modules');
    const matches = await storage.searchProducts(query);
    const byDomain = new Map<string, string>();
    for (const module of modules) {
      if (module.config.enabled) {
        byDomain.set(module.config.domain, module.config.id);
      }
    }
    const resolved: Array<{ shopId: string; domain: string; productId: string }> = [];
    for (const match of matches) {
      const shopId = byDomain.get(match.shop);
      if (shopId !== undefined) {
        resolved.push({ shopId, domain: match.shop, productId: match.productId });
      }
    }
    if (resolved.length === 1) {
      return c.redirect(`/shop/${resolved[0]?.shopId}`, 302);
    }
    const rows = resolved
      .slice(0, 50)
      .map(
        (row) =>
          `<tr><td><a href="/shop/${esc(row.shopId)}">${esc(row.shopId)}</a></td><td>${esc(row.domain)}</td><td>${esc(row.productId)}</td></tr>`
      )
      .join('');
    const body = `
${breadcrumb([{ label: 'dashboard', href: '/dashboard' }, { label: 'szukaj' }])}
<h1 class="mb-3">Wyniki dla „${esc(query)}”</h1>
${resolved.length === 0 ? emptyState('Brak wyników', 'Żaden produkt ani sklep nie pasuje do zapytania.') : table(['sklep', 'domena', 'produkt'], rows)}`;
    return c.html(pageShell('ecommerce-sniffle — szukaj', body));
  });

  api.get('/shop/:id', async (c) => {
    const id = c.req.param('id');
    const modules = c.get('modules');
    const storage = c.get('storage');
    const module = modules.find((entry) => entry.config.id === id);
    if (module === undefined || !module.config.enabled) {
      return c.html(
        pageShell(
          'Nieznany sklep',
          `${alert(`Nieznany sklep: ${esc(id)}`, 'red')}${breadcrumb([{ label: 'dashboard', href: '/dashboard' }])}`
        ),
        404
      );
    }
    const config: ProviderConfig = module.config;
    const domain = config.domain;
    const days = await storage.readAvailableDays(domain);
    const dayParam = c.req.query('day');
    const day = dayParam === undefined ? (days[0] === undefined ? '' : days[0]) : dayParam;
    const [latest, urlMap, maxQuantity, dailyRange] = await Promise.all([
      storage.readLatestSnapshot(domain),
      storage.readProductUrls(domain),
      storage.readMaxObservedQuantity(domain),
      day === '' ? Promise.resolve([]) : storage.readShopDailyRange(domain, addDays(day, -13), day),
    ]);
    const summary = calculateShopSummary(latest === null ? [] : [latest]);
    const todayPoint = dailyRange.find((point) => point.day === day) ?? null;
    const prevPoint = dailyRange.find((point) => point.day === dayBefore(day)) ?? null;
    const morningEvents = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'morning');
    const eveningEvents = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'evening');
    const from = day === '' ? undefined : addDays(day, -30);
    const to = day === '' ? undefined : addDays(day, 1);
    const snapshots = day === '' ? [] : await storage.readSnapshots(domain, from, to);
    const topRows = topSellingProducts(snapshots, { maxQuantity, limit: 10 });

    const trendSeries = buildTrendSeries(snapshots);
    const sortParam = c.req.query('sort');
    const dirParam = c.req.query('dir');
    const pageParam = c.req.query('page');
    const qParam = c.req.query('q');
    const lowParam = c.req.query('low');
    const sort = sortParam === undefined ? 'value' : sortParam;
    const dir = dirParam === undefined ? 'desc' : dirParam;
    const page = pageParam === undefined ? 1 : Number(pageParam);
    const stockParams: StockParams = {
      day,
      q: qParam === undefined ? '' : qParam,
      sort,
      dir,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      low: lowParam === undefined ? '' : lowParam,
    };

    const dayOptions = days
      .map((d) => `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${esc(d)}</option>`)
      .join('');
    const prevLink =
      day === ''
        ? ''
        : `<a class="btn btn-outline-secondary btn-sm" href="${esc(stockQs(dayBefore(day), {}))}" aria-label="Poprzedni dzień">${icon('chevron-left')}</a>`;
    const nextLink =
      day === ''
        ? ''
        : `<a class="btn btn-outline-secondary btn-sm" href="${esc(stockQs(dayAfter(day), {}))}" aria-label="Następny dzień">${icon('chevron-right')}</a>`;
    const dayControl = `<div class="d-flex align-items-center gap-2 ms-auto">
  ${prevLink}
  <select name="day" id="day" class="form-select w-auto" aria-label="Wybierz dzień" onchange="location.href='${esc(stockQs('', {}))}&day='+encodeURIComponent(this.value)">
    ${dayOptions}
  </select>
  ${nextLink}
</div>`;

    const badges: string[] = [];
    if (isCountdownShop(domain)) {
      badges.push(badge('countdown', 'yellow'));
    }
    if (summary.bias.sentinelVariants > 0) {
      badges.push(badge(`${summary.bias.sentinelVariants} sentinel`, 'yellow'));
    }
    if (todayPoint !== null && todayPoint.suspect > 0) {
      badges.push(badge(`${todayPoint.suspect} podejrzane`, 'red'));
    }
    const countdownNote = isCountdownShop(domain)
      ? alert(
          'Ten sklep liczy stan od dużego sentinela w dół. Sprzedaż i wartość są szacunkowe, a nie rzeczywiste.',
          'yellow',
          'Countdown'
        )
      : '';

    const headerData: DataGridItem[] = [
      { title: 'Stan', content: `${summary.totalItems.toLocaleString('pl-PL')} szt` },
      { title: 'Wartość', content: money(summary.totalValue) },
      { title: 'Unikalne produkty', content: `${summary.uniqueProducts}` },
      { title: 'Średnia cena', content: summary.meanPrice === null ? '--' : money(summary.meanPrice) },
      { title: 'Mediana ceny', content: summary.medianPrice === null ? '--' : money(summary.medianPrice) },
      {
        title: 'Ostatni snapshot',
        content: latest === null ? '--' : fmtDate(latest.snapshotAt),
        status: latest === null ? 'gray' : dayBefore(day) <= latest.snapshotAt.slice(0, 10) ? 'green' : 'yellow',
      },
    ];

    const headerBody = `${datagrid(headerData)}<div class="mt-2">${badges.join('')}</div>`;

    const lowThresholdParam = c.req.query('lowstock');
    const lowThreshold = lowThresholdParam === undefined ? 5 : Number(lowThresholdParam);

    const body = `
<div class="page-header d-flex flex-wrap align-items-center mb-3">
  ${breadcrumb([{ label: 'dashboard', href: '/dashboard' }, { label: config.id }])}
  <div class="ms-auto d-flex align-items-center gap-2 mt-2 mt-md-0">
    ${dayControl}
  </div>
</div>
<h1 class="mb-3">${esc(config.id)} <span class="text-secondary fs-4">${esc(domain)} · ${esc(config.platform)}</span></h1>
${countdownNote}
${card({ title: 'Podsumowanie sklepu', body: headerBody })}
${day === '' ? '' : renderDayComparison(day, todayPoint, prevPoint)}
${day === '' ? '' : card({ title: 'Trendy', body: `<div class="row row-deck row-cards"><div class="col-12 col-lg-6">${chartBlock('chart-shop-trend', buildTrendConfig(trendSeries))}</div><div class="col-12 col-lg-6">${chartBlock('chart-shop-daily', buildDailyConfig(dailyRange))}</div></div>` })}
${day === '' ? '' : card({ title: 'Zmiany', body: renderChangesWindows(day, morningEvents, eveningEvents, urlMap, config.platform, maxQuantity) })}
${day === '' ? '' : card({ title: 'Oś czasu zdarzeń', body: renderTimeline(day, morningEvents, eveningEvents, urlMap) })}
${day === '' ? '' : card({ title: `Niski stan (1–${lowThreshold})`, body: renderLowStock(latest, urlMap, config.platform, lowThreshold) })}
${day === '' ? '' : card({ title: 'Obniżki cen', body: renderPriceDrops(latest, urlMap, config.platform) })}
${card({ title: 'Top sprzedawane (ostatnie 30 dni)', body: renderTopSellers(topRows, urlMap) })}
${card({ title: 'Stan magazynowy (ostatni snapshot)', body: renderStock({ domain, platform: config.platform }, latest, urlMap, stockParams) })}`;
    return c.html(pageShell(`ecommerce-sniffle — ${config.id}`, body));
  });

  api.get('/stock-detail/:productId', async (c) => {
    const shop = c.req.query('shop');
    if (shop === undefined) {
      return c.text('missing shop', 400);
    }
    const productId = c.req.param('productId');
    const modules = c.get('modules');
    const storage = c.get('storage');
    const module = modules.find((entry) => entry.config.enabled && entry.config.domain === shop);
    const platform = module === undefined ? 'custom' : module.config.platform;
    const [latest, urlMap] = await Promise.all([storage.readLatestSnapshot(shop), storage.readProductUrls(shop)]);
    if (latest === null) {
      return c.text('no snapshot', 404);
    }
    const variants = latest.variants.filter((variant) => variant.productId === productId);
    if (variants.length === 0) {
      return c.text('no variants', 404);
    }
    const rows = variants
      .map((variant) => {
        const cell = variantCell(urlMap, productId, variant.variantId, platform);
        return `<tr><td>${cell}</td><td>${variant.quantity === null ? '-' : esc(variant.quantity)}</td><td>${variant.price === null ? '-' : money(variant.price)}</td></tr>`;
      })
      .join('');
    return c.html(table(['wariant', 'ilość', 'cena'], rows));
  });

  api.get('/report', (c) => c.redirect('/dashboard', 301));
  api.get('/report/:shop', (c) => c.redirect(`/shop/${c.req.param('shop')}`, 301));

  return api;
}
