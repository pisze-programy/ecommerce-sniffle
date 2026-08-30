import { describe, expect, it } from 'vitest';
import { quantityCell, renderChangesWindows } from '../../../../backend/src/services/report/changes.ts';
import type { StockEvent, VariantState } from '@ecommerce-sniffle/analysis';
import type { ShopNames } from '../../../../backend/src/services/storage.ts';

function event(overrides: Partial<StockEvent> = {}): StockEvent {
  return {
    type: 'sold',
    productId: 'p1',
    variantId: 'v1',
    from: { productId: 'p1', variantId: 'v1', quantity: 100, price: 10, regularPrice: null, available: true },
    to: { productId: 'p1', variantId: 'v1', quantity: 99, price: 10, regularPrice: null, available: true },
    units: 1,
    confidence: 'exact',
    ...overrides,
  };
}

describe('quantityCell', () => {
  it('shows the change above the range for a sold event', () => {
    expect(quantityCell(event())).toContain('<span class="qty-change">1</span>');
    expect(quantityCell(event())).toContain('(100 → 99)');
  });

  it('shows the change for a restock from zero', () => {
    const restock = event({
      type: 'restock',
      from: { productId: 'p1', variantId: 'v1', quantity: 0, price: 10, regularPrice: null, available: true },
      to: { productId: 'p1', variantId: 'v1', quantity: 5, price: 10, regularPrice: null, available: true },
    });
    expect(quantityCell(restock)).toContain('<span class="qty-change">5</span>');
    expect(quantityCell(restock)).toContain('(0 → 5)');
  });

  it('shows only the quantity for a new product', () => {
    const fresh = event({
      type: 'productNew',
      from: null,
      to: { productId: 'p1', variantId: 'v1', quantity: 3, price: 10, regularPrice: null, available: true },
    });
    expect(quantityCell(fresh)).toContain('>3<');
    expect(quantityCell(fresh)).not.toContain('→');
  });

  it('shows only the quantity when the stock did not change', () => {
    const promo = event({
      type: 'promoStart',
      to: { productId: 'p1', variantId: 'v1', quantity: 100, price: 8, regularPrice: null, available: true },
    });
    expect(quantityCell(promo)).toContain('>100<');
    expect(quantityCell(promo)).not.toContain('→');
  });

  it('shows a dash when both quantities are masked', () => {
    const masked = event({
      from: { productId: 'p1', variantId: 'v1', quantity: null, price: 10, regularPrice: null, available: true },
      to: { productId: 'p1', variantId: 'v1', quantity: null, price: 10, regularPrice: null, available: true },
    });
    expect(quantityCell(masked)).toContain('>-<');
  });

  it('carries the numeric sort value', () => {
    expect(quantityCell(event())).toContain('data-sort-value="1"');
  });
});

function variantState(quantity: number | null): VariantState {
  return { productId: 'p1', variantId: 'v1', quantity, price: 10, regularPrice: null, available: true };
}

function change(
  type: StockEvent['type'],
  from: VariantState | null,
  to: VariantState | null,
  units: number
): StockEvent {
  return { type, productId: 'p1', variantId: 'v1', from, to, units, confidence: 'exact' };
}

const NAMES: ShopNames = { productUrls: new Map(), productTitles: new Map(), variantTitles: new Map() };

describe('renderChangesWindows', () => {
  it('shows type counts summed from both seeds', () => {
    const morning = [
      change('sold', variantState(100), variantState(99), 1),
      change('sold', variantState(50), variantState(49), 1),
    ];
    const evening = [change('restock', variantState(0), variantState(5), 5)];
    const html = renderChangesWindows('2026-08-28', morning, evening, NAMES, 'shopify', 1000);
    expect(html).toContain('sprzedane (2)');
    expect(html).toContain('dostawione (1)');
    expect(html).not.toContain('nowy (');
  });

  it('renders each seed collapsed by default', () => {
    const morning = [change('sold', variantState(100), variantState(99), 1)];
    const evening = [change('restock', variantState(0), variantState(5), 5)];
    const html = renderChangesWindows('2026-08-28', morning, evening, NAMES, 'shopify', 1000);
    expect(html).toContain('Morning 06:00');
    expect(html).toContain('Evening 18:00');
    expect(html).toContain('class="collapse"');
    expect(html).not.toContain('class="collapse show"');
  });
});
