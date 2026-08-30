import { esc } from '../report-components.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';
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

export interface TrendSeries {
  readonly labels: readonly string[];
  readonly qty: readonly number[];
  readonly price: readonly number[];
}

export function buildTrendSeries(snapshots: readonly Snapshot[]): TrendSeries {
  const labels: string[] = [];
  const qty: number[] = [];
  const price: number[] = [];
  for (const snapshot of snapshots) {
    let totalQty = 0;
    let priceSum = 0;
    let priceCount = 0;
    for (const variant of snapshot.variants) {
      if (variant.quantity !== null) {
        totalQty += variant.quantity;
      }
      if (variant.price !== null) {
        priceSum += variant.price;
        priceCount += 1;
      }
    }
    labels.push(snapshot.snapshotAt.slice(5, 16).replace('T', ' '));
    qty.push(totalQty);
    price.push(priceCount === 0 ? 0 : Math.round((priceSum / priceCount) * 100) / 100);
  }
  return { labels, qty, price };
}

export function buildTrendConfig(trend: TrendSeries): ChartOpts {
  return {
    type: 'line',
    height: 260,
    series: [
      { name: 'ilość', data: [...trend.qty], yaxis: 0 },
      { name: 'cena', data: [...trend.price], yaxis: 1 },
    ],
    xaxis: { categories: [...trend.labels] },
    yaxis: [{ title: { text: 'ilość' } }, { opposite: true, title: { text: 'cena (PLN)' } }],
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
    plotOptions: { bar: { columnWidth: '55%' } },
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
