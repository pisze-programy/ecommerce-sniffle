import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import {
  extractHandle,
  magdabutrymModule,
  parseRscQuantityAvailable,
} from '../../../../../../packages/providers/src/providers/shopify/magdabutrym.ts';

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRscQuantityAvailable', () => {
  it('extracts exact quantity per variant from the rsc payload', () => {
    const html =
      '\\"id\\":\\"gid://shopify/ProductVariant/59603108757838\\",\\"title\\":\\"36.5\\",\\"price\\":\\"$248\\",\\"quantityAvailable\\":1,' +
      '\\"id\\":\\"gid://shopify/ProductVariant/59603108856142\\",\\"title\\":\\"38\\",\\"price\\":\\"$23a\\",\\"quantityAvailable\\":4';
    const inv = parseRscQuantityAvailable(html);
    expect(inv.get('59603108757838')).toBe(1);
    expect(inv.get('59603108856142')).toBe(4);
    expect(inv.size).toBe(2);
  });

  it('reads zero as sold out', () => {
    const html =
      '\\"id\\":\\"gid://shopify/ProductVariant/1\\",\\"title\\":\\"35\\",\\"price\\":\\"$x\\",\\"quantityAvailable\\":0';
    expect(parseRscQuantityAvailable(html).get('1')).toBe(0);
  });

  it('returns an empty map when the payload is missing', () => {
    expect(parseRscQuantityAvailable('<html></html>').size).toBe(0);
  });
});

describe('extractHandle', () => {
  it('extracts the handle from a product url', () => {
    expect(extractHandle('https://magdabutrym.com/product/aw26-blazer-01-black')).toBe('aw26-blazer-01-black');
  });

  it('returns null for a non-product url', () => {
    expect(extractHandle('https://magdabutrym.com/')).toBeNull();
  });
});

describe('magdabutrymModule', () => {
  it('builds a catalog with exact stock from product pages', async () => {
    const capture = capturingLogger();
    const rsc =
      '\\"id\\":\\"gid://shopify/ProductVariant/59603108757838\\",\\"title\\":\\"36.5\\",\\"price\\":\\"$248\\",\\"quantityAvailable\\":1,' +
      '\\"id\\":\\"gid://shopify/ProductVariant/59603108856142\\",\\"title\\":\\"38\\",\\"price\\":\\"$23a\\",\\"quantityAvailable\\":4';
    const sitemap = '<urlset><url><loc>https://magdabutrym.com/product/pf26-dress-06-black</loc></url></urlset>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        const body = u.includes('/sitemap.xml')
          ? '<urlset><url><loc>https://magdabutrym.com/sitemap-category/all.xml</loc></url></urlset>'
          : u.includes('sitemap-category/all.xml')
            ? sitemap
            : `<html><head><title>Midi dress</title></head><body>${rsc}</body></html>`;
        const text = () => Promise.resolve(body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text,
          json: async () => JSON.parse(await text()),
        };
      })
    );
    const provider = magdabutrymModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    const product = catalog.products[0];
    expect(product?.title).toBe('Midi dress');
    expect(product?.variants).toHaveLength(2);
    expect(product?.variants[0]?.quantity).toBe(1);
    expect(product?.variants[1]?.quantity).toBe(4);
    expect(product?.variants[1]?.available).toBe(true);
  });

  it('skips a product page without inventory', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        const body = u.includes('/sitemap.xml')
          ? '<urlset><url><loc>https://magdabutrym.com/sitemap-category/all.xml</loc></url></urlset>'
          : u.includes('sitemap-category/all.xml')
            ? '<urlset><url><loc>https://magdabutrym.com/product/no-stock</loc></url></urlset>'
            : '<html><body>no data</body></html>';
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => body,
          json: async () => JSON.parse(body),
        };
      })
    );
    const provider = magdabutrymModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(0);
    expect(capture.records.some((record) => record.message === 'magdabutrym.product no inventory')).toBe(true);
  });
});
