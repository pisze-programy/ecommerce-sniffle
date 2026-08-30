import { Hono } from 'hono';
import type { ProviderConfig } from '@ecommerce-sniffle/providers';
import { calculateShopSummary, isCountdownShop, topSellingProducts } from '@ecommerce-sniffle/analysis';
import type { CpmRange } from '../entities.ts';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { toPlnEvents, toPlnPoint, toPlnSnapshot } from '../services/currency.ts';
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
import {
  buildDailyConfig,
  buildPriceDistribution,
  buildPriceDistributionConfig,
  buildTrendConfig,
  buildTrendSeries,
  chartBlock,
} from '../services/report/charts.ts';
import { renderStock, stockQs } from '../services/report/stock.ts';
import { renderChangesWindows, renderDayComparison } from '../services/report/changes.ts';
import { renderPriceDrops, renderTopSellers } from '../services/report/overview.ts';
import { renderShopsTable } from '../services/report/dashboard.ts';
import type { ShopCard } from '../services/report/dashboard.ts';
import { renderEntityCard } from '../services/report/entities.ts';
import type { EntityShopLink } from '../services/report/entities.ts';
import { renderSocialCard, socialUserIds } from '../services/report/social.ts';
import { renderMetaAdsCard } from '../services/report/metaads.ts';
import { pageShell } from '../services/report/shell.ts';
import { variantCell } from '../services/report/links.ts';

export { shopifyVariantUrl };

// The default CPM range for Poland, health and beauty. See docs/ENTITIES.md.
const DEFAULT_CPM: CpmRange = { min: 15, max: 30 };

export function createReportRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/shops', async (c) => {
    const modules = c.get('modules');
    const storage = c.get('storage');
    const enabled = modules.filter((module) => module.config.enabled);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const cardRows = await Promise.all(
      enabled.map(async (module) => {
        const config = module.config;
        const currency = config.currency;
        const [latestRaw, dailyRangeRaw] = await Promise.all([
          storage.readLatestSnapshot(config.domain),
          storage.readShopDailyRange(config.domain, addDays(today, -13), today),
        ]);
        const latest = latestRaw === null ? null : toPlnSnapshot(latestRaw, currency);
        const dailyRange = dailyRangeRaw.map((point) => toPlnPoint(point, currency));
        const summary = calculateShopSummary(latest === null ? [] : [latest]);
        const latestDay = latest === null ? null : latest.snapshotAt.slice(0, 10);
        const todayPoint = dailyRange.find((point) => point.day === today) ?? null;
        const prevPoint = dailyRange.find((point) => point.day === dayBefore(today)) ?? null;
        const fresh =
          latest === null ? false : dayBefore(now.toISOString().slice(0, 10)) <= latest.snapshotAt.slice(0, 10);
        const countdown = isCountdownShop(config.domain);
        const card: ShopCard = {
          id: config.id,
          domain: config.domain,
          platform: config.platform,
          latestDay,
          fresh,
          countdown,
          sentinel: summary.bias.sentinelVariants,
          suspect: todayPoint === null ? 0 : todayPoint.suspect,
          summary,
          today: todayPoint,
          prev: prevPoint,
        };
        return { card, countdown, dailyRange };
      })
    );
    const cards = cardRows.map((row) => row.card);

    const portfolioMap = new Map<string, { sold: number; soldValue: number; restocked: number }>();
    for (const row of cardRows) {
      if (row.countdown) {
        continue;
      }
      for (const point of row.dailyRange) {
        let entry = portfolioMap.get(point.day);
        if (entry === undefined) {
          entry = { sold: 0, soldValue: 0, restocked: 0 };
          portfolioMap.set(point.day, entry);
        }
        entry.sold += point.sold;
        entry.soldValue += point.soldValue;
        entry.restocked += point.restocked;
      }
    }
    const portfolio = [...portfolioMap.entries()]
      .map(([day, entry]) => ({
        day,
        sold: entry.sold,
        soldValue: Math.round(entry.soldValue * 100) / 100,
        restocked: entry.restocked,
        restockValue: 0,
        suspect: 0,
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

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

    const portfolioLabels = portfolio.map((point) => point.day.slice(5));
    const portfolioValueChart = chartBlock('chart-portfolio-value', {
      type: 'area',
      height: 260,
      series: [{ name: 'wartość sprzedaży (PLN)', data: portfolio.map((point) => point.soldValue) }],
      xaxis: { categories: portfolioLabels },
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

    const body = `
<h1 class="mb-3">Sklepy</h1>
${kpiGrid(kpis)}
<div class="row row-deck row-cards mt-2">
  <div class="col-12">${card({ title: 'Wartość sprzedaży — 14 dni', body: portfolioValueChart, collapsed: true })}</div>
  <div class="col-12">${card({ title: 'Sprzedane 24h — top 10', body: soldChart, collapsed: true })}</div>
  <div class="col-12">${card({ title: 'Alerty', body: alertsTable, collapsed: true })}</div>
</div>
${card({ title: 'Sklepy', body: renderShopsTable(cards), className: 'mt-2' })}`;
    return c.html(pageShell('ecommerce-sniffle — Sklepy', body));
  });

  api.get('/dashboard', (c) => c.redirect('/shops', 301));

  api.get('/search', async (c) => {
    const q = c.req.query('q');
    if (q === undefined || q.trim().length === 0) {
      return c.redirect('/shops', 302);
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
${breadcrumb([{ label: 'Sklepy', href: '/shops' }, { label: 'szukaj' }])}
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
          `${alert(`Nieznany sklep: ${esc(id)}`, 'red')}${breadcrumb([{ label: 'Sklepy', href: '/shops' }])}`
        ),
        404
      );
    }
    const config: ProviderConfig = module.config;
    const domain = config.domain;
    const nowDay = new Date().toISOString().slice(0, 10);
    const days = await storage.readAvailableDays(domain);
    const validDays = days.filter((d) => d < nowDay);
    const dayParam = c.req.query('day');
    const day =
      dayParam === undefined || dayParam >= nowDay || !validDays.includes(dayParam)
        ? validDays[0] === undefined
          ? ''
          : validDays[0]
        : dayParam;
    const [latestRaw, names, maxQuantity, dailyRangeRaw] = await Promise.all([
      storage.readLatestSnapshot(domain),
      storage.readShopNames(domain),
      storage.readMaxObservedQuantity(domain),
      day === '' ? Promise.resolve([]) : storage.readShopDailyRange(domain, addDays(day, -13), day),
    ]);
    const currency = config.currency;
    const latest = latestRaw === null ? null : toPlnSnapshot(latestRaw, currency);
    const dailyRange = dailyRangeRaw.map((point) => toPlnPoint(point, currency));
    const summary = calculateShopSummary(latest === null ? [] : [latest]);
    const todayPoint = dailyRange.find((point) => point.day === day) ?? null;
    const prevPoint = dailyRange.find((point) => point.day === dayBefore(day)) ?? null;
    const morningRaw = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'morning');
    const eveningRaw = day === '' ? [] : await storage.readEventsByWindow(domain, day, 'evening');
    const morningEvents = toPlnEvents(morningRaw, currency);
    const eveningEvents = toPlnEvents(eveningRaw, currency);
    const from = day === '' ? undefined : addDays(day, -30);
    const to = day === '' ? undefined : addDays(day, 1);
    const snapshotsRaw = day === '' ? [] : await storage.readSnapshots(domain, from, to);
    const snapshots = snapshotsRaw.map((snapshot) => toPlnSnapshot(snapshot, currency));
    const topRows = topSellingProducts(snapshots, { maxQuantity, limit: 10 });

    const trendSeries = buildTrendSeries(snapshots);
    const dayOptions = validDays
      .map((d) => `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${esc(d)}</option>`)
      .join('');
    const prevDay = day === '' ? '' : dayBefore(day);
    const nextDay = day === '' ? '' : dayAfter(day);
    const prevLink =
      day !== '' && prevDay !== '' && validDays.includes(prevDay)
        ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(stockQs(prevDay))}" aria-label="Poprzedni dzień">${icon('chevron-left')}</a>`
        : '';
    const nextLink =
      day !== '' && nextDay !== '' && validDays.includes(nextDay)
        ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(stockQs(nextDay))}" aria-label="Następny dzień">${icon('chevron-right')}</a>`
        : '';
    const dayControl = `<div class="d-flex align-items-center gap-2 ms-auto">
  ${prevLink}
  <select name="day" id="day" class="form-select w-auto" aria-label="Wybierz dzień" onchange="location.href='${esc(stockQs(''))}&day='+encodeURIComponent(this.value)">
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
      { title: 'Warianty', content: `${summary.variantCount}` },
      { title: 'Średnia cena', content: summary.meanPrice === null ? '--' : money(summary.meanPrice) },
      { title: 'Mediana ceny', content: summary.medianPrice === null ? '--' : money(summary.medianPrice) },
      {
        title: 'Ostatni snapshot',
        content: latest === null ? '--' : fmtDate(latest.snapshotAt),
        status: latest === null ? 'gray' : dayBefore(day) <= latest.snapshotAt.slice(0, 10) ? 'green' : 'yellow',
      },
    ];

    const headerBody = `${datagrid(headerData)}<div class="mt-2">${badges.join('')}</div>`;

    const pricesByProduct = new Map<string, number>();
    if (latest !== null) {
      for (const variant of latest.variants) {
        if (variant.price === null) {
          continue;
        }
        const current = pricesByProduct.get(variant.productId);
        if (current === undefined || variant.price < current) {
          pricesByProduct.set(variant.productId, variant.price);
        }
      }
    }
    const prices = [...pricesByProduct.values()];
    const priceDistribution = buildPriceDistribution(prices);
    const priceDistributionCard =
      priceDistribution.length === 0
        ? ''
        : card({
            title: 'Rozkład cen',
            body: chartBlock('chart-price-dist', buildPriceDistributionConfig(priceDistribution)),
            collapsed: true,
          });

    const daySections: string[] = [];
    if (day !== '') {
      daySections.push(renderDayComparison(day, todayPoint, prevPoint));
      daySections.push(
        card({
          title: 'Trendy',
          body: `<div class="row row-deck row-cards"><div class="col-12 col-lg-6">${chartBlock('chart-shop-trend', buildTrendConfig(trendSeries))}</div><div class="col-12 col-lg-6">${chartBlock('chart-shop-daily', buildDailyConfig(dailyRange))}</div></div>`,
          collapsed: true,
        })
      );
      daySections.push(
        card({
          title: 'Zmiany',
          body: renderChangesWindows(day, morningEvents, eveningEvents, names, config.platform, maxQuantity),
          collapsed: true,
        })
      );
      daySections.push(
        card({ title: 'Obniżki cen', body: renderPriceDrops(latest, names, config.platform), collapsed: true })
      );
    }
    const shopsByEntity = new Map<string, EntityShopLink>();
    for (const entry of modules) {
      const entityId = entry.config.entityId;
      if (entityId !== undefined && entry.config.enabled) {
        shopsByEntity.set(entityId, { shopId: entry.config.id, domain: entry.config.domain });
      }
    }
    const entityCard =
      config.entityId === undefined
        ? ''
        : renderEntityCard(
            await storage.readEntityStore(),
            config.entityId,
            shopsByEntity,
            nowDay,
            await storage.readEntityFinancials(config.entityId)
          );
    const socialCard = await (async () => {
      if (config.entityId === undefined) {
        return '';
      }
      const store = await storage.readEntityStore();
      const profiles = await storage.readSocialProfiles();
      const [posts, stories] = await Promise.all([
        storage.readSocialPosts(socialUserIds(store, config.entityId, profiles), 10),
        storage.readSocialStories(socialUserIds(store, config.entityId, profiles), 10),
      ]);
      return renderSocialCard(store, config.entityId, { profiles, posts, stories });
    })();
    const metaAdsCard = await (async () => {
      if (config.entityId === undefined) {
        return '';
      }
      const store = await storage.readEntityStore();
      const entity = store.entities.find((entry) => entry.id === config.entityId);
      if (entity === undefined || entity.metaPageId === null) {
        return '';
      }
      const [ads, days] = await Promise.all([
        storage.readMetaAdsActive(entity.metaPageId),
        storage.readMetaAdDays(entity.metaPageId, addDays(nowDay, -30)),
      ]);
      const cpm = entity.cpmOverride === null ? DEFAULT_CPM : entity.cpmOverride;
      return renderMetaAdsCard(ads, days, nowDay, cpm);
    })();
    const body = `
<div class="page-header d-flex flex-row flex-wrap align-items-center justify-content-start mb-3">
  ${breadcrumb([{ label: 'Sklepy', href: '/shops' }, { label: config.id }])}
</div>
<h1 class="mb-3"><a href="https://${esc(domain)}" target="_blank" rel="noopener">${esc(domain)}</a></h1>
${countdownNote}
${card({ title: 'Podsumowanie sklepu', body: headerBody })}
${entityCard}
${socialCard}
${metaAdsCard}
${priceDistributionCard}
<div class="d-flex justify-content-end py-3">${dayControl}</div>
${daySections.join('\n')}
${card({ title: 'Top sprzedawane (ostatnie 30 dni)', body: renderTopSellers(topRows, names), collapsed: true })}
${card({ title: 'Stan magazynowy (aktualny)', body: renderStock({ domain, platform: config.platform }, latest, names), collapsed: true })}`;
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
    const currency = module === undefined ? undefined : module.config.currency;
    const [latestRaw, names] = await Promise.all([storage.readLatestSnapshot(shop), storage.readShopNames(shop)]);
    if (latestRaw === null) {
      return c.text('no snapshot', 404);
    }
    const latest = toPlnSnapshot(latestRaw, currency);
    const variants = latest.variants.filter((variant) => variant.productId === productId);
    if (variants.length === 0) {
      return c.text('no variants', 404);
    }
    const rows = variants
      .map((variant) => {
        const cell = variantCell(names, productId, variant.variantId, platform);
        return `<tr><td>${cell}</td><td>${variant.quantity === null ? '-' : esc(variant.quantity)}</td><td>${variant.price === null ? '-' : money(variant.price)}</td></tr>`;
      })
      .join('');
    return c.html(table(['wariant', 'ilość', 'cena'], rows));
  });

  api.get('/report', (c) => c.redirect('/shops', 301));
  api.get('/report/:shop', (c) => c.redirect(`/shop/${c.req.param('shop')}`, 301));

  return api;
}
