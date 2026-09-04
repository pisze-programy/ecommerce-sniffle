import { describe, expect, it } from 'vitest';
import {
  buildDailyConfig,
  buildPriceDistribution,
  buildPriceDistributionConfig,
  buildWeeklySalesConfig,
  buildWeeklySalesSeries,
  withoutSeedDay,
} from '../../../../backend/src/services/report/charts.ts';
import type { DailyPoint } from '../../../../backend/src/services/storage.ts';

function day(day: string, sold: number, soldValue: number, restocked: number): DailyPoint {
  return { day, sold, soldValue, restocked, restockValue: 0, suspect: 0 };
}

describe('buildPriceDistribution', () => {
  it('returns empty for no prices', () => {
    expect(buildPriceDistribution([])).toEqual([]);
  });

  it('splits a wide range into few log bins with round edges', () => {
    const prices = [290, 500, 550, 700, 1090, 1500, 3900, 5500];
    const points = buildPriceDistribution(prices);
    expect(points).toHaveLength(5);
    expect(points[0]?.label).toBe('200–500');
    expect(points[0]?.count).toBe(1);
    const total = points.reduce((acc, point) => acc + point.count, 0);
    expect(total).toBe(prices.length);
    expect(points[points.length - 1]?.cumulativePct).toBe(100);
  });

  it('starts the first bin at the cheapest price', () => {
    const points = buildPriceDistribution([4, 60, 70, 80, 90, 100]);
    expect(points[0]?.label).toBe('2–5');
    expect(points[0]?.count).toBe(1);
  });

  it('caps the bulk at the 99th percentile with an overflow bin', () => {
    const cheap = Array.from({ length: 200 }, (_, i) => 39 + (i * (900 - 39)) / 199);
    const points = buildPriceDistribution([...cheap, 5000, 8699]);
    expect(points).toHaveLength(6);
    expect(points[5]?.label).toBe('>900');
    expect(points[5]?.count).toBe(2);
    const bulk = points.slice(0, 5).reduce((acc, point) => acc + point.count, 0);
    expect(bulk).toBe(200);
    const total = points.reduce((acc, point) => acc + point.count, 0);
    expect(total).toBe(202);
    expect(points[5]?.cumulativePct).toBe(100);
    const firstShare = (points[0]?.count ?? 0) / 200;
    expect(firstShare).toBeLessThan(0.5);
  });

  it('puts every price in one bin when all are equal', () => {
    const points = buildPriceDistribution([50, 50, 50]);
    expect(points).toHaveLength(1);
    expect(points[0]?.count).toBe(3);
    expect(points[0]?.cumulativePct).toBe(100);
  });
});

describe('buildPriceDistributionConfig', () => {
  it('renders one bar series without a cumulative line', () => {
    const points = buildPriceDistribution([10, 20, 30, 200, 2000]);
    const config = buildPriceDistributionConfig(points);
    const series = config.series as Array<{ name: string; type: string }>;
    expect(series).toHaveLength(1);
    expect(series[0]?.name).toBe('produkty');
    expect(series[0]?.type).toBe('bar');
    expect(config.xaxis).toBeDefined();
  });

  it('labels the price axis, the bars and the tooltip range', () => {
    const points = buildPriceDistribution([10, 20, 30, 200, 2000]);
    const config = buildPriceDistributionConfig(points);
    const xaxis = config.xaxis as { title: { text: string } };
    expect(xaxis.title.text).toBe('cena (zł)');
    expect(config.dataLabels).toBeDefined();
    const tooltip = config.tooltip as { y: { formatter: string } };
    expect(tooltip.y.formatter).toBe('__FUNC_priceTooltip__');
    expect(config.formatters).toBeDefined();
    expect(config.formatters?.priceTooltip).toContain('produktów');
  });
});

describe('buildWeeklySalesSeries', () => {
  it('maps the days to labels, sold and revenue', () => {
    const points = [day('2026-09-01', 5, 500, 2), day('2026-09-02', 8, 1200, 0), day('2026-09-03', 3, 300, 1)];
    const series = buildWeeklySalesSeries(points);
    expect(series.labels).toEqual(['09-01', '09-02', '09-03']);
    expect(series.sold).toEqual([5, 8, 3]);
    expect(series.revenue).toEqual([500, 1200, 300]);
  });

  it('returns empty series for no points', () => {
    const series = buildWeeklySalesSeries([]);
    expect(series.labels).toEqual([]);
    expect(series.sold).toEqual([]);
    expect(series.revenue).toEqual([]);
  });
});

describe('buildWeeklySalesConfig', () => {
  it('renders sold as bars and revenue as a line on a second axis', () => {
    const series = buildWeeklySalesSeries([day('2026-09-02', 8, 1200, 0)]);
    const config = buildWeeklySalesConfig(series);
    const chart = config.series as Array<{ name: string; type: string; yaxis: number }>;
    expect(chart).toHaveLength(2);
    expect(chart[0]?.name).toBe('sprzedane');
    expect(chart[0]?.type).toBe('bar');
    expect(chart[0]?.yaxis).toBe(0);
    expect(chart[1]?.name).toBe('przychód (PLN)');
    expect(chart[1]?.type).toBe('line');
    expect(chart[1]?.yaxis).toBe(1);
    expect(config.xaxis).toBeDefined();
  });

  it('bakes the price bounds into the custom tooltip and normalizes axes', () => {
    const base = day('2026-09-02', 8, 1200, 0);
    const series = buildWeeklySalesSeries([{ ...base, soldMinPrice: 60, soldMaxPrice: 200 }]);
    const config = buildWeeklySalesConfig(series);
    const tooltip = config.tooltip as { custom: string };
    expect(tooltip.custom).toBe('__FUNC_weekTooltip__');
    const tooltipSource = config.formatters?.weekTooltip ?? '';
    expect(tooltipSource).toContain('[60]');
    expect(tooltipSource).toContain('[200]');
    expect(tooltipSource).toContain(' szt');
    expect(config.formatters?.soldAxis).toContain('toLocaleString');
    expect(config.formatters?.plnAxis).toContain("' zł'");
  });

  it('renders the daily chart with count tooltips', () => {
    const points = [day('2026-09-02', 8, 1200, 4), day('2026-09-03', 5, 700, 0)];
    const config = buildDailyConfig(points);
    const chart = config.series as Array<{ name: string; type: string }>;
    expect(chart[0]?.name).toBe('sprzedane');
    expect(chart[0]?.type).toBe('bar');
    expect(chart[1]?.name).toBe('dostawione');
    const tooltip = config.tooltip as { y: { formatter: string } };
    expect(tooltip.y.formatter).toBe('__FUNC_soldTooltip__');
    expect(config.formatters?.soldTooltip).toContain("' szt'");
  });
});

describe('buildWeeklySalesSeries price bounds', () => {
  it('carries the sold price bounds per day', () => {
    const base = day('2026-09-01', 5, 500, 0);
    const series = buildWeeklySalesSeries([{ ...base, soldMinPrice: 40, soldMaxPrice: 120 }]);
    expect(series.minPrice).toEqual([40]);
    expect(series.maxPrice).toEqual([120]);
  });

  it('keeps the bounds null when the point carries none', () => {
    const series = buildWeeklySalesSeries([day('2026-09-01', 5, 500, 0)]);
    expect(series.minPrice).toEqual([null]);
    expect(series.maxPrice).toEqual([null]);
  });
});

describe('withoutSeedDay', () => {
  it('drops only the seed day from the range', () => {
    const points = [day('2026-08-26', 11457, 0, 0), day('2026-08-27', 200, 3000, 10), day('2026-08-28', 150, 2000, 5)];
    const filtered = withoutSeedDay(points, '2026-08-26');
    expect(filtered.map((point) => point.day)).toEqual(['2026-08-27', '2026-08-28']);
  });

  it('keeps the range when no seed day is known', () => {
    const points = [day('2026-08-27', 200, 3000, 10)];
    expect(withoutSeedDay(points, null)).toHaveLength(1);
  });

  it('keeps the range when the seed day is older than the window', () => {
    const points = [day('2026-08-27', 200, 3000, 10)];
    expect(withoutSeedDay(points, '2026-08-01')).toHaveLength(1);
  });
});
