import { esc } from '../report-components.ts';
import type { DailyPoint } from '../storage.ts';

export interface ChartOpts {
  readonly type: string;
  readonly series: readonly unknown[];
  readonly xaxis?: unknown;
  readonly yaxis?: unknown;
  readonly plotOptions?: unknown;
  readonly dataLabels?: unknown;
  readonly tooltip?: unknown;
  readonly height?: number;
  // Formatter functions cannot pass through JSON. Each entry replaces a
  // "__FUNC_<key>__" placeholder in the serialized config with raw JS.
  readonly formatters?: Readonly<Record<string, string>>;
}

// Raw JavaScript sources for the ApexCharts number formatters. The counts
// render as integers with the szt unit. The money renders with the PLN
// suffix. Without them ApexCharts shows 7.00 instead of 7 szt.
const COUNT_AXIS_LABEL = `function(value) { return Number(value).toLocaleString('pl-PL'); }`;
const PLN_AXIS_LABEL = `function(value) { return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł'; }`;
const SOLD_TOOLTIP = `function(value, opts) { var v = Number(value); return v.toLocaleString('pl-PL') + ' szt'; }`;

// A full tooltip for one day of the week. It shows the sold count, the
// revenue and the sold price range. The min and max arrays are baked in
// because a formatter cannot close over chart data.
function weekTooltipSource(minPrice: readonly (number | null)[], maxPrice: readonly (number | null)[]): string {
  const min = JSON.stringify(minPrice);
  const max = JSON.stringify(maxPrice);
  return `function({ series, dataPointIndex }) {
  var i = dataPointIndex;
  var loArr = ${min};
  var hiArr = ${max};
  var count = function (v) { return Number(v).toLocaleString('pl-PL'); };
  var pln = function (v) { return Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var sold = count(series[0][i]);
  var rev = pln(series[1][i]);
  var lo = loArr[i] === null || loArr[i] === undefined ? '-' : pln(loArr[i]);
  var hi = hiArr[i] === null || hiArr[i] === undefined ? '-' : pln(hiArr[i]);
  return '<div style="padding:8px;font-size:12px;line-height:1.5">sprzedane <b>' + sold + ' szt</b><br>przychód <b>' + rev + ' zł</b><br>cena ' + lo + ' – ' + hi + ' zł</div>';
}`;
}

export function chartBlock(containerId: string, opts: ChartOpts): string {
  const config = {
    chart: {
      type: opts.type,
      height: opts.height === undefined ? 240 : opts.height,
      fontFamily: 'inherit',
      animations: { enabled: false },
      toolbar: { show: false },
    },
    series: opts.series,
    colors: ['#2fb344', '#4263eb', '#f59f00', '#e03131'],
    tooltip: opts.tooltip === undefined ? { theme: 'dark' } : opts.tooltip,
    grid: { strokeDashArray: 4 },
    legend: { position: 'bottom' },
    stroke: { curve: 'straight', width: 2 },
    ...(opts.xaxis === undefined ? {} : { xaxis: opts.xaxis }),
    ...(opts.yaxis === undefined ? {} : { yaxis: opts.yaxis }),
    ...(opts.plotOptions === undefined ? {} : { plotOptions: opts.plotOptions }),
    ...(opts.dataLabels === undefined ? {} : { dataLabels: opts.dataLabels }),
  };
  let json = JSON.stringify(config);
  if (opts.formatters !== undefined) {
    for (const [key, source] of Object.entries(opts.formatters)) {
      json = json.replace(`"__FUNC_${key}__"`, source);
    }
  }
  return `<div id="${esc(containerId)}" class="w-100"></div><script>document.addEventListener('DOMContentLoaded',function(){if(window.ApexCharts){window.__charts=window.__charts||{};var c=new ApexCharts(document.getElementById('${esc(containerId)}'),${json});c.render();window.__charts['${esc(containerId)}']=c;}});</script>`;
}

export interface WeeklySalesSeries {
  readonly labels: readonly string[];
  readonly sold: readonly number[];
  readonly revenue: readonly number[];
  readonly minPrice: readonly (number | null)[];
  readonly maxPrice: readonly (number | null)[];
}

// The first fetch of a shop is the baseline for the later math, not
// activity. Its day can hold a seed spike (a huge fake restock) that
// flattens the chart scale. Drop that one day from chart input.
export function withoutSeedDay(points: readonly DailyPoint[], seedDay: string | null): readonly DailyPoint[] {
  if (seedDay === null) {
    return points;
  }
  return points.filter((point) => point.day !== seedDay);
}

// The trend card shows what the shop sold, not what it holds. Each point
// is one day of the week. The value is the money for that day in PLN.
export function buildWeeklySalesSeries(points: readonly DailyPoint[]): WeeklySalesSeries {
  return {
    labels: points.map((point) => point.day.slice(5)),
    sold: points.map((point) => point.sold),
    revenue: points.map((point) => point.soldValue),
    minPrice: points.map((point) => (point.soldMinPrice === undefined ? null : point.soldMinPrice)),
    maxPrice: points.map((point) => (point.soldMaxPrice === undefined ? null : point.soldMaxPrice)),
  };
}

export function buildWeeklySalesConfig(series: WeeklySalesSeries): ChartOpts {
  return {
    type: 'line',
    height: 260,
    series: [
      { name: 'sprzedane', type: 'bar', data: [...series.sold], yaxis: 0 },
      { name: 'przychód (PLN)', type: 'line', data: [...series.revenue], yaxis: 1 },
    ],
    xaxis: { categories: [...series.labels] },
    yaxis: [
      { title: { text: 'sprzedane (szt)' }, labels: { formatter: '__FUNC_soldAxis__' } },
      { opposite: true, title: { text: 'przychód (PLN)' }, labels: { formatter: '__FUNC_plnAxis__' } },
    ],
    plotOptions: { bar: { columnWidth: '55%' } },
    tooltip: { theme: 'dark', custom: '__FUNC_weekTooltip__' },
    formatters: {
      soldAxis: COUNT_AXIS_LABEL,
      plnAxis: PLN_AXIS_LABEL,
      weekTooltip: weekTooltipSource(series.minPrice, series.maxPrice),
    },
  };
}

export function buildDailyConfig(dailyRange: readonly DailyPoint[]): ChartOpts {
  return {
    type: 'line',
    height: 260,
    series: [
      { name: 'sprzedane', type: 'bar', data: dailyRange.map((point) => point.sold) },
      { name: 'dostawione', type: 'line', data: dailyRange.map((point) => point.restocked) },
    ],
    xaxis: { categories: dailyRange.map((point) => point.day.slice(5)) },
    yaxis: [{ labels: { formatter: '__FUNC_soldAxis__' } }],
    plotOptions: { bar: { columnWidth: '55%' } },
    tooltip: { theme: 'dark', y: { formatter: '__FUNC_soldTooltip__' } },
    formatters: {
      soldAxis: COUNT_AXIS_LABEL,
      soldTooltip: SOLD_TOOLTIP,
    },
  };
}

// Prices are log-normal: most products cluster low with a long
// expensive tail. Equal bins on a log scale draw that as a bell:
// few bins, round 1-2-5 edges, no decimals. A linear scale would
// crush everything into the first bar. The bulk ends at the 99th
// percentile plus one overflow bin, so outliers cannot stretch
// the axis. Narrow ranges fall back to equal linear bins.
const MAX_EDGES = 6;

const NICE_STEPS = [1, 2, 5];

function allNiceValues(): number[] {
  const set = new Set<number>();
  for (let k = -5; k <= 8; k += 1) {
    for (const step of NICE_STEPS) {
      set.add(Math.round(10 ** k * step * 100) / 100);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function floorNice(value: number, nice: readonly number[]): number {
  let out = nice[0] ?? value;
  for (const candidate of nice) {
    if (candidate <= value) {
      out = candidate;
    } else {
      break;
    }
  }
  return out;
}

function ceilNice(value: number, nice: readonly number[]): number {
  for (const candidate of nice) {
    if (candidate >= value) {
      return candidate;
    }
  }
  return nice[nice.length - 1] ?? value;
}

function thinEdges(edges: readonly number[], maxEdges: number): number[] {
  if (edges.length <= maxEdges) {
    return [...edges];
  }
  const picked: number[] = [];
  for (let i = 0; i < maxEdges; i += 1) {
    picked.push(edges[Math.round((i * (edges.length - 1)) / (maxEdges - 1))] ?? 0);
  }
  return [...new Set(picked)].sort((a, b) => a - b);
}

function linearEdges(min: number, max: number, count: number): number[] {
  const rounded = (max - min) / (count - 1) >= 1;
  const edges: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = min + ((max - min) * i) / (count - 1);
    edges.push(rounded ? Math.round(value) : Math.round(value * 100) / 100);
  }
  return [...new Set(edges)].sort((a, b) => a - b);
}

function percentile(sorted: readonly number[], pct: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function buildEdges(min: number, top: number): number[] {
  if (top / min >= 4) {
    const nice = allNiceValues();
    const candidates = nice.filter((value) => value >= floorNice(min, nice) && value <= ceilNice(top, nice));
    const thinned = thinEdges(candidates, MAX_EDGES);
    if (thinned.length >= 2) {
      return thinned;
    }
  }
  return linearEdges(min, top, MAX_EDGES);
}

function formatPrice(value: number): string {
  if (value >= 10) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 100) / 100);
}

export interface PriceDistributionPoint {
  readonly label: string;
  readonly count: number;
  readonly cumulativePct: number;
}

export function buildPriceDistribution(prices: readonly number[]): readonly PriceDistributionPoint[] {
  if (prices.length === 0) {
    return [];
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) {
    return [{ label: formatPrice(min), count: prices.length, cumulativePct: 100 }];
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const cap = percentile(sorted, 99);
  const bulkMax = cap >= max ? max : cap;
  const edges = buildEdges(min, bulkMax);
  const total = prices.length;
  let running = 0;
  const points: PriceDistributionPoint[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const a = edges[index] ?? 0;
    const last = index === edges.length - 2;
    const b = last ? bulkMax : (edges[index + 1] ?? 0);
    let count = 0;
    for (const price of prices) {
      if (price >= a && (price < b || (last && (cap >= max || price <= cap)))) {
        count += 1;
      }
    }
    running += count;
    points.push({
      label: `${formatPrice(a)}–${formatPrice(b)}`,
      count,
      cumulativePct: Math.round((running / total) * 100),
    });
  }
  if (cap < max) {
    let overflow = 0;
    for (const price of prices) {
      if (price > cap) {
        overflow += 1;
      }
    }
    running += overflow;
    points.push({
      label: `>${formatPrice(cap)}`,
      count: overflow,
      cumulativePct: Math.round((running / total) * 100),
    });
  }
  return points;
}

export function buildPriceDistributionConfig(points: readonly PriceDistributionPoint[]): ChartOpts {
  return {
    type: 'bar',
    height: 260,
    series: [{ name: 'produkty', type: 'bar', data: points.map((point) => point.count), yaxis: 0 }],
    xaxis: { categories: points.map((point) => point.label), title: { text: 'cena (zł)' } },
    yaxis: [{ title: { text: 'produkty' } }],
    plotOptions: { bar: { columnWidth: '80%' } },
    dataLabels: { enabled: true, style: { fontSize: '10px' } },
    tooltip: { theme: 'dark', y: { formatter: '__FUNC_priceTooltip__' } },
    formatters: {
      priceTooltip:
        "function(value, opts) { var label = opts.w.globals.labels[opts.dataPointIndex]; if (label === undefined || label === null) { label = ''; } var word = value === 1 ? 'produkt' : (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? 'produkty' : 'produktów'); return label + ' zł: ' + value + ' ' + word; }",
    },
  };
}
