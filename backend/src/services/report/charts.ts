import { esc } from '../report-components.ts';
import type { Snapshot } from '@ecommerce-sniffle/analysis';
import type { DailyPoint } from '../storage.ts';

export interface ChartOpts {
  readonly type: string;
  readonly series: readonly unknown[];
  readonly xaxis?: unknown;
  readonly yaxis?: unknown;
  readonly plotOptions?: unknown;
  readonly height?: number;
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
    tooltip: { theme: 'dark' },
    grid: { strokeDashArray: 4 },
    legend: { position: 'bottom' },
    stroke: { curve: 'straight', width: 2 },
    ...(opts.xaxis === undefined ? {} : { xaxis: opts.xaxis }),
    ...(opts.yaxis === undefined ? {} : { yaxis: opts.yaxis }),
    ...(opts.plotOptions === undefined ? {} : { plotOptions: opts.plotOptions }),
  };
  const json = JSON.stringify(config);
  return `<div id="${esc(containerId)}" class="w-100"></div><script>document.addEventListener('DOMContentLoaded',function(){if(window.ApexCharts){new ApexCharts(document.getElementById('${esc(containerId)}'),${json}).render();}});</script>`;
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
