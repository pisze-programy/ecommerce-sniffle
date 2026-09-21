import { describe, expect, it } from 'vitest';
import {
  dedupeCombinedProducts,
  duplicateProductSet,
  fetchCatalogForConfig,
  fetchShopifyCatalog,
  parsePrice,
  parseShopifyCatalog,
  parseShopifyProduct,
  parseShopifyVariant,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/adapter.ts';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import type { Catalog, ProviderConfig, Variant } from '../../../../../../packages/providers/src/types.ts';

const DOMAIN = 'forcer.pl';
const TAG = 'combinedParentProduct';

function configWithTag(tag: string | undefined, duplicateIds?: readonly number[]): ProviderConfig {
  return {
    id: 'test',
    domain: DOMAIN,
    platform: 'shopify',
    schedule: '0 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'ucp-inventory',
    ratePerSecond: 1,
    durationSeconds: 30,
    requiresProxy: true,
    endpoint: `https://${DOMAIN}/products.json`,
    enabled: true,
    ...(tag === undefined ? {} : { combinedProductTag: tag }),
    ...(duplicateIds === undefined ? {} : { duplicateProductIds: duplicateIds }),
  };
}

function catalogResponse(): { ok: boolean; status: number; json(): Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      products: [
        {
          id: 1,
          title: 'Shell',
          handle: 'shell',
          tags: [TAG],
          variants: [{ id: 11, title: 'OS', price: '1', available: true }],
        },
        {
          id: 2,
          title: 'Source',
          handle: 'source',
          tags: ['combined-parent:shell'],
          variants: [{ id: 11, title: 'OS', price: '1', available: true }],
        },
        { id: 3, title: 'Solo', handle: 'solo', variants: [{ id: 31, title: 'OS', price: '2', available: true }] },
      ],
    }),
  };
}

function catalog(products: Catalog['products']): Catalog {
  return { domain: DOMAIN, fetchedAt: '2026-09-21T00:00:00.000Z', products };
}

function variant(id: string): Variant {
  return {
    id,
    title: 'OS',
    sku: null,
    price: { amount: 1, currency: 'PLN' },
    regularPrice: null,
    available: true,
    quantity: 1,
  };
}

describe('parsePrice', () => {
  it('parses a PLN price', () => {
    expect(parsePrice('1190.00')).toBe(1190);
  });

  it('parses a decimal price', () => {
    expect(parsePrice('200.00')).toBe(200);
  });

  it('returns null for empty input', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parsePrice('not-a-number')).toBeNull();
  });
});

describe('parseShopifyVariant', () => {
  it('maps a variant with exact inventory', () => {
    const variant = parseShopifyVariant({
      id: 53670923403593,
      title: 'SHORT',
      sku: '667003001121',
      price: '1190.00',
      compare_at_price: '1490.00',
      available: true,
      inventory_quantity: 3,
    });
    expect(variant).not.toBeNull();
    expect(variant?.id).toBe('53670923403593');
    expect(variant?.title).toBe('SHORT');
    expect(variant?.sku).toBe('667003001121');
    expect(variant?.price.amount).toBe(1190);
    expect(variant?.regularPrice?.amount).toBe(1490);
    expect(variant?.available).toBe(true);
    expect(variant?.quantity).toBe(3);
  });

  it('keeps quantity null when inventory is masked', () => {
    const variant = parseShopifyVariant({
      id: 1,
      title: 'OS',
      price: '200.00',
      compare_at_price: '200.00',
      available: true,
    });
    expect(variant?.quantity).toBeNull();
    expect(variant?.available).toBe(true);
  });

  it('treats an unavailable masked variant as sold out', () => {
    const variant = parseShopifyVariant({
      id: 2,
      title: 'OS',
      price: '200.00',
      compare_at_price: null,
      available: false,
    });
    expect(variant?.quantity).toBe(0);
    expect(variant?.available).toBe(false);
  });

  it('ignores regular price when compare equals the price', () => {
    const variant = parseShopifyVariant({
      id: 3,
      title: 'OS',
      price: '200.00',
      compare_at_price: '200.00',
      available: true,
    });
    expect(variant?.regularPrice).toBeNull();
  });

  it('returns null for a non-object or id-less entry', () => {
    expect(parseShopifyVariant(null)).toBeNull();
    expect(parseShopifyVariant('nope')).toBeNull();
    expect(parseShopifyVariant({ title: 'no-id' })).toBeNull();
  });
});

describe('parseShopifyProduct', () => {
  it('maps product id, title and url', () => {
    const product = parseShopifyProduct(
      {
        id: 10023411843401,
        title: 'SET AIR',
        handle: 'set-air',
        variants: [
          { id: 1, title: 'SHORT', price: '1190.00', available: true, sku: null },
          { id: 2, title: 'REGULAR', price: '1190.00', available: false, sku: 'x' },
        ],
      },
      DOMAIN
    );
    expect(product?.id).toBe('10023411843401');
    expect(product?.title).toBe('SET AIR');
    expect(product?.url).toBe('https://forcer.pl/products/set-air');
    expect(product?.variants).toHaveLength(2);
  });

  it('skips malformed variants', () => {
    const product = parseShopifyProduct(
      { id: 1, title: 'T', handle: 't', variants: [{ title: 'no-id' }, null, 'bad'] },
      DOMAIN
    );
    expect(product?.variants).toEqual([]);
  });

  it('returns null for a non-object', () => {
    expect(parseShopifyProduct('nope', DOMAIN)).toBeNull();
  });
});

describe('parseShopifyCatalog', () => {
  it('extracts all products from the json payload', () => {
    const products = parseShopifyCatalog(
      {
        products: [
          { id: 1, title: 'A', handle: 'a', variants: [{ id: 11, title: 'OS', price: '1.00', available: true }] },
          { id: 2, title: 'B', handle: 'b', variants: [{ id: 21, title: 'OS', price: '2.00', available: false }] },
        ],
      },
      DOMAIN
    );
    expect(products).toHaveLength(2);
    expect(products[0]?.title).toBe('A');
  });

  it('returns an empty array for invalid payloads', () => {
    expect(parseShopifyCatalog(null, DOMAIN)).toEqual([]);
    expect(parseShopifyCatalog({ notProducts: [] }, DOMAIN)).toEqual([]);
    expect(parseShopifyCatalog('nope', DOMAIN)).toEqual([]);
  });
});

describe('dedupeCombinedProducts', () => {
  it('drops the tagged shell and keeps the source', () => {
    const logger = createLogger(() => {});
    const result = dedupeCombinedProducts(
      catalog([
        { id: '1', title: 'Shell', url: 'u1', tags: [TAG], variants: [variant('11')] },
        { id: '2', title: 'Source', url: 'u2', tags: [], variants: [variant('11')] },
        { id: '3', title: 'Solo', url: 'u3', tags: [], variants: [variant('31')] },
      ]),
      TAG,
      logger
    );
    expect(result.products.map((p) => p.id)).toEqual(['2', '3']);
  });

  it('keeps a tagged product that shares no variant', () => {
    const logger = createLogger(() => {});
    const result = dedupeCombinedProducts(
      catalog([{ id: '1', title: 'Shell', url: 'u1', tags: [TAG], variants: [variant('11')] }]),
      TAG,
      logger
    );
    expect(result.products.map((p) => p.id)).toEqual(['1']);
  });

  it('keeps the first product when every owner carries the tag', () => {
    const logger = createLogger(() => {});
    const result = dedupeCombinedProducts(
      catalog([
        { id: '1', title: 'A', url: 'u1', tags: [TAG], variants: [variant('11')] },
        { id: '2', title: 'B', url: 'u2', tags: [TAG], variants: [variant('11')] },
      ]),
      TAG,
      logger
    );
    expect(result.products.map((p) => p.id)).toEqual(['1']);
  });

  it('keeps the first product when no owner carries the tag', () => {
    const logger = createLogger(() => {});
    const result = dedupeCombinedProducts(
      catalog([
        { id: '1', title: 'A', url: 'u1', tags: [], variants: [variant('11')] },
        { id: '2', title: 'B', url: 'u2', tags: [], variants: [variant('11')] },
      ]),
      TAG,
      logger
    );
    expect(result.products.map((p) => p.id)).toEqual(['1']);
  });

  it('logs a warning for every dropped shell', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    dedupeCombinedProducts(
      catalog([
        { id: '1', title: 'Shell', url: 'u1', tags: [TAG], variants: [variant('11')] },
        { id: '2', title: 'Source', url: 'u2', tags: [], variants: [variant('11')] },
      ]),
      TAG,
      logger
    );
    const skip = records.filter((record) => record.message === 'shopify.combined product skipped');
    expect(skip).toHaveLength(1);
    expect(skip[0]?.context['productId']).toBe('1');
  });
});

describe('duplicateProductSet', () => {
  it('returns an empty set when the config has no list', () => {
    expect(duplicateProductSet(configWithTag(undefined)).size).toBe(0);
  });

  it('returns the product ids as strings', () => {
    const set = duplicateProductSet(configWithTag(undefined, [2, 5]));
    expect(set.has('2')).toBe(true);
    expect(set.has('5')).toBe(true);
    expect(set.has('1')).toBe(false);
  });
});

describe('fetchCatalogForConfig', () => {
  it('keeps every product when the config has no list and no tag', async () => {
    const result = await fetchCatalogForConfig(
      configWithTag(undefined),
      createLogger(() => {}),
      catalogResponse
    );
    expect(result.products.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('skips the listed duplicate product', async () => {
    const result = await fetchCatalogForConfig(
      configWithTag(undefined, [1]),
      createLogger(() => {}),
      catalogResponse
    );
    expect(result.products.map((p) => p.id)).toEqual(['2', '3']);
  });

  it('drops the shell that is not on the list', async () => {
    const result = await fetchCatalogForConfig(
      configWithTag(TAG, [3]),
      createLogger(() => {}),
      catalogResponse
    );
    expect(result.products.map((p) => p.id)).toEqual(['2']);
  });
});

describe('fetchShopifyCatalog', () => {
  it('keeps every product', async () => {
    const catalogResult = await fetchShopifyCatalog(
      DOMAIN + '/products.json',
      DOMAIN,
      createLogger(() => {}),
      catalogResponse
    );
    expect(catalogResult.products.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('skips an excluded product and logs the skip', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const catalogResult = await fetchShopifyCatalog(
      DOMAIN + '/products.json',
      DOMAIN,
      logger,
      catalogResponse,
      new Set(['2'])
    );
    expect(catalogResult.products.map((p) => p.id)).toEqual(['1', '3']);
    const skip = records.filter((record) => record.message === 'shopify.duplicate product skipped');
    expect(skip).toHaveLength(1);
    expect(skip[0]?.context['productId']).toBe('2');
  });
});
