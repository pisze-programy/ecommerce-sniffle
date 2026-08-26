import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import {
  foodsbyannModule,
  parseIdoSellProductId,
  parseIdoSellPrice,
  parseIdoSellSizes,
} from '../../../../../../packages/providers/src/providers/web/foodsbyann.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseIdoSellSizes', () => {
  it('parses exact amount per size', () => {
    const html = '"sizes":{ "uniw": { "type":"uniw", "name":"uniw", "amount":992 } }';
    const sizes = parseIdoSellSizes(html);
    expect(sizes).toEqual([{ id: 'uniw', amount: 992 }]);
  });

  it('parses multiple sizes', () => {
    const html = '"sizes":{ "U": { "type":"U", "amount":126 }, "V": { "type":"V", "amount":189 } }';
    const sizes = parseIdoSellSizes(html);
    expect(sizes).toEqual([
      { id: 'U', amount: 126 },
      { id: 'V', amount: 189 },
    ]);
  });

  it('reads zero amount as sold out', () => {
    const sizes = parseIdoSellSizes('"sizes":{ "uniw": { "type":"uniw", "amount":0 } }');
    expect(sizes[0]?.amount).toBe(0);
  });

  it('returns an empty array when sizes are missing', () => {
    expect(parseIdoSellSizes('<html></html>')).toEqual([]);
  });
});

describe('parseIdoSellProductId', () => {
  it('extracts the id from a product url', () => {
    expect(parseIdoSellProductId('https://foodsbyann.com/product-pol-1711-Levann.html')).toBe('1711');
  });

  it('falls back to the url', () => {
    expect(parseIdoSellProductId('https://foodsbyann.com/other')).toBe('https://foodsbyann.com/other');
  });
});

describe('parseIdoSellPrice', () => {
  it('parses the gross price', () => {
    expect(parseIdoSellPrice('"price":"59.99"')).toBe(59.99);
  });

  it('returns zero when the price is missing', () => {
    expect(parseIdoSellPrice('<html></html>')).toBe(0);
  });
});

describe('foodsbyannModule', () => {
  it('routes every fetch through the direct fetch', async () => {
    const logger = createLogger(() => {});
    const directCalls: string[] = [];
    const directFetch = async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      directCalls.push(url);
      const body = url.includes('sitemap-1')
        ? '<urlset><url><loc>https://foodsbyann.com/product-pol-200-Kubek.html</loc></url></urlset>'
        : url.includes('sitemap')
          ? '<?xml version="1.0"?><urlset><url><loc>https://foodsbyann.com/sitemap-1.xml.gz</loc></url></urlset>'
          : '<html><head><title>Kubek</title></head><body>"sizes":{"uniw":{"type":"uniw","amount":7}}</body></html>';
      const buffer = Buffer.from(body);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer.buffer as ArrayBuffer,
        text: async () => body,
        json: async () => JSON.parse(body),
      };
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('the provider must not use the global fetch');
      })
    );
    const provider = foodsbyannModule.build({ logger, directFetch });
    const catalog = await provider.fetchCatalog();
    expect(directCalls.length).toBeGreaterThan(0);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(7);
  });
});
