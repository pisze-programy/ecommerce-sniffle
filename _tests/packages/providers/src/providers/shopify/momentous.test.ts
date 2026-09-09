import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import { momentousModule } from '../../../../../../packages/providers/src/providers/shopify/momentous.ts';

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
      id: 8529753702583,
      handle: 'nightly-sleep-30-packs',
      title: 'Nightly Sleep 30-Pack',
      variants: [
        {
          id: 100,
          title: 'Default Title',
          price: '79.99',
          compare_at_price: null,
          available: true,
          inventory_quantity: null,
        },
      ],
    },
  ],
});

function productXml(id: string, quantity: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><hash>' +
    `<variant><id type="integer">${id}</id><title>Default Title</title>` +
    `<inventory-quantity type="integer">${quantity}</inventory-quantity></variant>` +
    '</hash>'
  );
}

describe('momentousModule', () => {
  it('reveals exact stock from the product xml', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/products/nightly-sleep-30-packs.xml')) {
          return okResponse(productXml('100', '11717'));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = momentousModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(11717);
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
        if (u.includes('/products/nightly-sleep-30-packs.xml')) {
          return okResponse(productXml('100', '0'));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = momentousModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(0);
    expect(catalog.products[0]?.variants[0]?.available).toBe(false);
  });

  it('keeps the variant masked when the xml has no quantity', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/products/nightly-sleep-30-packs.xml')) {
          return okResponse(
            '<?xml version="1.0"?><hash><variant><id type="integer">100</id><title>X</title></variant></hash>'
          );
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = momentousModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
  });
});
