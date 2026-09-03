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

// Price ranges grow by the 1-2-5 sequence, so skewed prices still fill
// the chart. The edges snap to nice numbers and every bin stays, so the
// axis is continuous and a cheap product lands in a clean range.
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

function formatPrice(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
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
  const min = Math.max(Math.min(...prices), 0.01);
  const max = Math.max(...prices);
  if (min === max) {
    return [{ label: formatPrice(min), count: prices.length, cumulativePct: 100 }];
  }
  const nice = allNiceValues();
  const below = nice.filter((value) => value <= min);
  const lo = below.length === 0 ? min : (below[below.length - 1] ?? min);
  const above = nice.filter((value) => value >= max);
  const hi = above.length === 0 ? max : (above[0] ?? max);
  const edges = nice.filter((value) => value >= lo && value <= hi);
  const total = prices.length;
  let running = 0;
  const points: PriceDistributionPoint[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const a = edges[index] ?? 0;
    const b = edges[index + 1] ?? 0;
    let count = 0;
    for (const price of prices) {
      if (price >= a && (price < b || index === edges.length - 2)) {
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
  return points;
}

export function buildPriceDistributionConfig(points: readonly PriceDistributionPoint[]): ChartOpts {
  return {
    type: 'line',
    height: 260,
    series: [
      { name: 'produkty', type: 'bar', data: points.map((point) => point.count), yaxis: 0 },
      {
        name: 'skumulowany %',
        type: 'line',
        data: points.map((point) => point.cumulativePct),
        yaxis: 1,
        dataLabels: { enabled: false },
      },
    ],
    xaxis: { categories: points.map((point) => point.label), title: { text: 'cena (zł)' } },
    yaxis: [{ title: { text: 'produkty' } }, { opposite: true, title: { text: 'skumulowany %' }, max: 100 }],
    plotOptions: { bar: { columnWidth: '100%', borderRadius: 0 } },
    dataLabels: { enabled: true, style: { fontSize: '10px' } },
    tooltip: { theme: 'dark', y: { formatter: '__FUNC_priceTooltip__' } },
    formatters: {
      priceTooltip:
        "function(value, opts) { var label = opts.w.globals.labels[opts.dataPointIndex]; if (label === undefined || label === null) { label = ''; } if (opts.seriesIndex === 0) { return label + ' zł · ' + value + ' produktów'; } return label + ' zł · ' + value + '%'; }",
    },
  };
}
