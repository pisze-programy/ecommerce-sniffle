import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import {
  korczakisynModule,
  parseSyliusProductId,
  parseSyliusPrice,
  parseSyliusTitle,
  parseSyliusVariants,
} from '../../../../../../packages/providers/src/providers/web/korczakisyn.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function productHtml(
  productId: string,
  variants: readonly { readonly key: string; readonly availability: string; readonly sku?: string }[]
): string {
  const divs = variants
    .map(
      (variant) =>
        `<div data-value="10 zł" data-variant-option-values="${variant.key}" data-original-price="" ` +
        `data-lowest-price="10 zł" data-availability="${variant.availability}" ` +
        `data-availability-subscriber-href="/x" data-sku="${variant.sku ?? ''}"></div>`
    )
    .join('\n');
  return (
    '<html><head><title>T | Korczak</title></head><body>' +
    '<h1>Futro Test</h1>' +
    `<form action="/pl_PL/ajax/cart/add?productId=${productId}"></form>` +
    `<div id="variants-pricing" data-unavailable-text="Niedostępne">${divs}</div>` +
    '<script type="application/ld+json">{"offers":{"@type":"Offer","priceCurrency":"PLN","price":16999.99}}</script>' +
    '</body></html>'
  );
}

interface FetchStub {
  readonly directFetch: (input: string | URL | Request) => Promise<{
    ok: boolean;
    status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
  readonly calls: string[];
}

function makeFetch(
  pages: Readonly<Record<string, string>>,
  statuses: Readonly<Record<string, number>> = {}
): FetchStub {
  const calls: string[] = [];
  const directFetch = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const status = statuses[url] ?? 200;
    const body = pages[url] ?? '';
    const bytes = new TextEncoder().encode(body);
    return {
      ok: status === 200,
      status,
      arrayBuffer: async () => bytes.buffer,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
  return { directFetch, calls };
}

function sitemapPages(productUrls: readonly string[]): Record<string, string> {
  return {
    'https://korczakisyn.com/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://korczakisyn.com/sitemap.product.xml</loc></sitemap></sitemapindex>',
    'https://korczakisyn.com/sitemap.product.xml':
      '<urlset>' + productUrls.map((url) => `<url><loc>${url}</loc></url>`).join('') + '</urlset>',
  };
}

describe('parseSyliusVariants', () => {
  it('parses the exact count per variant', () => {
    const html = productHtml('700', [
      { key: 's_36', availability: '10' },
      { key: 'm_38', availability: '0' },
    ]);
    expect(parseSyliusVariants(html)).toEqual([
      { key: 's_36', quantity: 10, sku: null },
      { key: 'm_38', quantity: 0, sku: null },
    ]);
  });

  it('reads the sku when the page holds one', () => {
    const html = productHtml('700', [{ key: 's_36', availability: '3', sku: 'SKU-S' }]);
    expect(parseSyliusVariants(html)[0]).toEqual({ key: 's_36', quantity: 3, sku: 'SKU-S' });
  });

  it('reads zero as sold out', () => {
    const html = productHtml('700', [{ key: 'xs_34', availability: '0' }]);
    expect(parseSyliusVariants(html)[0]?.quantity).toBe(0);
  });

  it('reads a mixed block with ten and one hundred', () => {
    const html = productHtml('700', [
      { key: 'a_1', availability: '10' },
      { key: 'b_2', availability: '100' },
    ]);
    expect(parseSyliusVariants(html).map((variant) => variant.quantity)).toEqual([10, 100]);
  });

  it('returns an empty list when the block is missing', () => {
    expect(parseSyliusVariants('<html></html>')).toEqual([]);
  });

  it('ignores a variant marker outside the block', () => {
    const html = '<div data-variant-option-values="x_1" data-availability="99" data-sku=""></div>';
    expect(parseSyliusVariants(html)).toEqual([]);
  });

  it('drops a duplicate variant key', () => {
    const html = productHtml('700', [
      { key: 's_36', availability: '1' },
      { key: 's_36', availability: '2' },
    ]);
    expect(parseSyliusVariants(html)).toEqual([{ key: 's_36', quantity: 1, sku: null }]);
  });
});

describe('parseSyliusProductId', () => {
  it('reads the id from the add-to-cart form', () => {
    expect(parseSyliusProductId('<form action="/pl_PL/ajax/cart/add?productId=597"></form>')).toBe('597');
  });

  it('returns null when the form is missing', () => {
    expect(parseSyliusProductId('<html></html>')).toBeNull();
  });
});

describe('parseSyliusPrice', () => {
  it('reads the JSON-LD offer price', () => {
    expect(parseSyliusPrice('"priceCurrency": "PLN", "price": 16999.99')).toBe(16999.99);
  });

  it('falls back to a plain price', () => {
    expect(parseSyliusPrice('"price": 12.5')).toBe(12.5);
  });

  it('returns zero when the price is missing', () => {
    expect(parseSyliusPrice('<html></html>')).toBe(0);
  });
});

describe('parseSyliusTitle', () => {
  it('reads the first h1', () => {
    expect(parseSyliusTitle('<h1>Futro Test</h1>')).toBe('Futro Test');
  });

  it('falls back to the title tag', () => {
    expect(parseSyliusTitle('<title>Futro | Korczak</title>')).toBe('Futro | Korczak');
  });
});

describe('korczakisynModule', () => {
  it('builds the catalog through the direct fetch only', async () => {
    const productUrl = 'https://korczakisyn.com/pl_PL/products/futro-a';
    const pages = {
      ...sitemapPages([productUrl, 'https://korczakisyn.com/sk_SK/products/futro-a']),
      [productUrl]: productHtml('700', [
        { key: 's_36', availability: '10' },
        { key: 'm_38', availability: '0' },
      ]),
    };
    const { directFetch, calls } = makeFetch(pages);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('the provider must not use the global fetch');
      })
    );
    const logger = createLogger(() => {});
    const provider = korczakisynModule.build({ logger, directFetch });
    const catalog = await provider.fetchCatalog();
    expect(calls.some((url) => url.includes('sitemap.product.xml'))).toBe(true);
    expect(calls.some((url) => url.includes('/sk_SK/'))).toBe(false);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.id).toBe('700');
    expect(catalog.products[0]?.title).toBe('Futro Test');
    expect(catalog.products[0]?.variants).toHaveLength(2);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(10);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(0);
    expect(catalog.products[0]?.variants[1]?.available).toBe(false);
    expect(catalog.products[0]?.variants[0]?.price.amount).toBe(16999.99);
  });

  it('skips an excluded product and logs the skip', async () => {
    const productUrl = 'https://korczakisyn.com/pl_PL/products/ponczo';
    const pages = {
      ...sitemapPages([productUrl]),
      [productUrl]: '<html><body><form action="/pl_PL/ajax/cart/add?productId=597"></form></body></html>',
    };
    const { directFetch } = makeFetch(pages);
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const provider = korczakisynModule.build({ logger, directFetch });
    await expect(provider.fetchCatalog()).rejects.toThrow('korczakisyn catalog empty');
    const excluded = records.find((record) => record.message === 'korczakisyn.product excluded');
    expect(excluded?.context['productId']).toBe('597');
  });

  it('skips a product with no availability and logs the gap', async () => {
    const productUrl = 'https://korczakisyn.com/pl_PL/products/bez-opcji';
    const pages = {
      ...sitemapPages([productUrl]),
      [productUrl]: '<html><body><form action="/pl_PL/ajax/cart/add?productId=999"></form></body></html>',
    };
    const { directFetch } = makeFetch(pages);
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const provider = korczakisynModule.build({ logger, directFetch });
    await expect(provider.fetchCatalog()).rejects.toThrow('korczakisyn catalog empty');
    const gap = records.find((record) => record.message === 'korczakisyn.product no availability');
    expect(gap?.context['productId']).toBe('999');
  });

  it('logs a failed product page and keeps the healthy product', async () => {
    const goodUrl = 'https://korczakisyn.com/pl_PL/products/dobre';
    const badUrl = 'https://korczakisyn.com/pl_PL/products/zle';
    const pages = {
      ...sitemapPages([goodUrl, badUrl]),
      [goodUrl]: productHtml('701', [{ key: 's_36', availability: '4' }]),
      [badUrl]: '',
    };
    const { directFetch } = makeFetch(pages, { [badUrl]: 500 });
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const provider = korczakisynModule.build({ logger, directFetch });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.id).toBe('701');
    const failed = records.find((record) => record.message === 'korczakisyn.product fetch failed');
    expect(failed?.context['url']).toBe(badUrl);
  });
});
