import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import {
  bloozieModule,
  parseDataVariants,
} from '../../../../../../packages/providers/src/providers/shopify/bloozie.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDataVariants', () => {
  it('parses the raw quantity including negative values', () => {
    const html =
      '<div data-variants="[{ &quot;id&quot;: &quot;47190374973788&quot;, &quot;available&quot;: &quot;true&quot;, &quot;inventory_quantity&quot;: &quot;-5630&quot; }]"></div>';
    const variants = parseDataVariants(html);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.id).toBe('47190374973788');
    expect(variants[0]?.quantity).toBe(-5630);
    expect(variants[0]?.available).toBe(true);
  });

  it('parses a positive quantity and a sold-out variant', () => {
    const html =
      '<div data-variants="[{ &quot;id&quot;: &quot;1&quot;, &quot;available&quot;: &quot;true&quot;, &quot;inventory_quantity&quot;: &quot;143&quot; }, { &quot;id&quot;: &quot;2&quot;, &quot;available&quot;: &quot;false&quot;, &quot;inventory_quantity&quot;: &quot;0&quot; }]"></div>';
    const variants = parseDataVariants(html);
    expect(variants[0]?.quantity).toBe(143);
    expect(variants[0]?.available).toBe(true);
    expect(variants[1]?.quantity).toBe(0);
    expect(variants[1]?.available).toBe(false);
  });

  it('returns an empty array when the attribute is missing', () => {
    expect(parseDataVariants('<html></html>')).toEqual([]);
  });

  it('returns an empty array for invalid json', () => {
    expect(parseDataVariants('<div data-variants="not-json"></div>')).toEqual([]);
  });
});

describe('bloozieModule', () => {
  it('builds a catalog with the raw inventory quantity from the page', async () => {
    const logger = createLogger(() => {});
    const directFetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
      _options?: { maxBytes?: number }
    ) => {
      const url = String(input);
      if (url.includes('/products.json')) {
        const body = JSON.stringify({
          products: [
            {
              id: 100,
              title: 'Bloozie Koala',
              handle: 'bloozie-koala',
              url: 'https://www.bloozie.pl/products/bloozie-koala',
              variants: [{ id: 47190374973788, title: 'default', available: true, price: '29.00' }],
            },
          ],
        });
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(body),
          text: async () => body,
          arrayBuffer: async () => Buffer.from(body).buffer as ArrayBuffer,
        };
      }
      const html =
        '<div data-variants="[{ &quot;id&quot;: &quot;47190374973788&quot;, &quot;available&quot;: &quot;true&quot;, &quot;inventory_quantity&quot;: &quot;-5630&quot; }]"></div>';
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => html,
        arrayBuffer: async () => Buffer.from(html).buffer as ArrayBuffer,
      };
    };
    const provider = bloozieModule.build({ logger, directFetch });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(-5630);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
  });
});
