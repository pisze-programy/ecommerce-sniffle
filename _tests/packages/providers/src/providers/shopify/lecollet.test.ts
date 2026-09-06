import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import { lecolletModule } from '../../../../../../packages/providers/src/providers/shopify/lecollet.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    body: null,
  };
}

const CATALOG = JSON.stringify({
  products: [
    {
      id: 1,
      handle: 'sweter-william-ecru',
      title: 'Sweter William Ecru',
      variants: [
        { id: 100, title: 'S', price: '350.00', compare_at_price: null, available: true, inventory_quantity: null },
        { id: 200, title: 'M', price: '350.00', compare_at_price: null, available: true, inventory_quantity: null },
      ],
    },
  ],
});

function productHtml(quantities: string): string {
  return `<html><script>window._RestockRocketConfig.variantsInventoryQuantity = ${quantities};</script></html>`;
}

describe('lecolletModule', () => {
  it('reveals exact stock from the restock rocket map', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/products/sweter-william-ecru')) {
          return okResponse(productHtml('{100 : parseInt("113"),200 : parseInt("27")}'));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = lecolletModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(113);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(27);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
  });

  it('marks a sold out variant as unavailable', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/products/sweter-william-ecru')) {
          return okResponse(productHtml('{100 : parseInt("0"),200 : parseInt("0")}'));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = lecolletModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(0);
    expect(catalog.products[0]?.variants[0]?.available).toBe(false);
  });

  it('keeps the variant masked when the page has no map', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/products/sweter-william-ecru')) {
          return okResponse('<html></html>');
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = lecolletModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
  });
});
