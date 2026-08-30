import { describe, expect, it } from 'vitest';
import {
  buildPriceDistribution,
  buildPriceDistributionConfig,
} from '../../../../backend/src/services/report/charts.ts';

describe('buildPriceDistribution', () => {
  it('returns empty for no prices', () => {
    expect(buildPriceDistribution([])).toEqual([]);
  });

  it('bins skewed prices on a growing scale with clean snapped ranges', () => {
    const prices = [290, 500, 550, 700, 1090, 1500, 3900, 5500];
    const points = buildPriceDistribution(prices);
    expect(points.length).toBeGreaterThan(1);
    const total = points.reduce((acc, point) => acc + point.count, 0);
    expect(total).toBe(prices.length);
    expect(points[points.length - 1]?.cumulativePct).toBe(100);
    expect(points[0]?.label).toContain('–');
  });

  it('snaps the lowest edge down so a cheap product lands in a clean range', () => {
    const points = buildPriceDistribution([4, 60, 70, 80, 90, 100]);
    expect(points[0]?.label).toBe('2–5');
    expect(points[0]?.count).toBe(1);
  });

  it('puts every price in one bin when all are equal', () => {
    const points = buildPriceDistribution([50, 50, 50]);
    expect(points).toHaveLength(1);
    expect(points[0]?.count).toBe(3);
    expect(points[0]?.cumulativePct).toBe(100);
  });
});

describe('buildPriceDistributionConfig', () => {
  it('renders a count bar series and a cumulative percent line', () => {
    const points = buildPriceDistribution([10, 20, 30, 200, 2000]);
    const config = buildPriceDistributionConfig(points);
    const series = config.series as Array<{ name: string; type: string }>;
    expect(series).toHaveLength(2);
    expect(series[0]?.name).toBe('produkty');
    expect(series[0]?.type).toBe('bar');
    expect(series[1]?.name).toBe('skumulowany %');
    expect(series[1]?.type).toBe('line');
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
