import { describe, expect, it } from 'vitest';
import {
  buildEmbeddedGraphqlProvider,
  fetchStorefrontInventory,
  parseShopDomain,
  parseStorefrontToken,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/embedded-graphql.ts';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import { RateLimiter } from '../../../../../../packages/providers/src/network/limiter.ts';
import type { DirectFetch, DirectFetchResponse } from '../../../../../../packages/providers/src/module.ts';

function jsonResponse(body: unknown, status = 200): DirectFetchResponse {
  const encoded = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => encoded,
    arrayBuffer: async () => Buffer.from(encoded).buffer as ArrayBuffer,
  };
}

function makeFetch(handler: (url: string) => DirectFetchResponse | 'throw'): DirectFetch {
  return async (input: string | URL | Request): Promise<DirectFetchResponse> => {
    const url = String(input);
    const result = handler(url);
    if (result === 'throw') {
      throw new Error('network down');
    }
    return result;
  };
}

function config() {
  return {
    id: 'test-graphql',
    domain: 'test-shop.pl',
    platform: 'shopify' as const,
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'vps-get' as const,
    stockSource: 'embedded-graphql' as const,
    ratePerSecond: 1000,
    durationSeconds: 60,
    requiresProxy: false,
    endpoint: 'https://test-shop.pl/products.json',
    enabled: true,
  };
}

const CATALOG = {
  products: [
    {
      id: 1,
      handle: 'one',
      title: 'One',
      variants: [
        { id: 11, title: 'S', price: '10.00', compare_at_price: null, available: true, inventory_quantity: null },
      ],
    },
  ],
};

const TOKEN_HTML =
  'storefrontAccessToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" window._RestockRocketConfig.shop = "test-shop.myshopify.com"';

const INVENTORY = {
  data: {
    products: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          variants: {
            nodes: [{ id: 'gid://shopify/ProductVariant/11', quantityAvailable: 7 }],
          },
        },
      ],
    },
  },
};

describe('parseStorefrontToken', () => {
  it('reads and lowercases the 32 hex token', () => {
    expect(parseStorefrontToken('storefrontAccessToken = "AABBCCDDEEFF00112233445566778899"')).toBe(
      'aabbccddeeff00112233445566778899'
    );
  });

  it('returns null without a token', () => {
    expect(parseStorefrontToken('<html></html>')).toBe(null);
  });
});

describe('parseShopDomain', () => {
  it('reads the permanent myshopify domain', () => {
    expect(parseShopDomain('window.shop = "test-shop.myshopify.com"')).toBe('test-shop.myshopify.com');
  });

  it('returns null without the domain', () => {
    expect(parseShopDomain('<html></html>')).toBe(null);
  });
});

describe('fetchStorefrontInventory', () => {
  function pageFetch(body: unknown) {
    return async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
  }

  it('returns the map when the pull completes', async () => {
    const logger = createLogger(() => {});
    const fetchFn = pageFetch(INVENTORY);
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      fetchFn,
      new RateLimiter(1000)
    );
    expect(inventory?.get('11')).toBe(7);
  });

  it('returns null and logs when the page safety cap is reached', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = pageFetch({ data: { products: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [] } } });
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      fetchFn,
      new RateLimiter(1000),
      1
    );
    expect(inventory).toBe(null);
    const record = records.find((entry) => entry.message === 'embeddedgraphql.incomplete');
    expect(record?.level).toBe('error');
    expect(record?.context['pages']).toBe(1);
  });

  it('returns null and logs when the body is not json', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      text: async () => 'not-json',
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      fetchFn,
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.json parse failed')).toBe(true);
  });

  it('returns null and logs when an error message is not a string', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = pageFetch({ errors: [{ message: 500 }] });
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      fetchFn,
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    const record = records.find((entry) => entry.message === 'embeddedgraphql.query failed');
    expect(record?.context['error']).toBe('graphql error');
  });

  it('skips a variant with a malformed gid', async () => {
    const logger = createLogger(() => {});
    const body = {
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              variants: {
                nodes: [
                  { id: 'gid://shopify/ProductVariant/11', quantityAvailable: 5 },
                  { id: 'nonsense', quantityAvailable: 3 },
                ],
              },
            },
          ],
        },
      },
    };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory?.get('11')).toBe(5);
    expect(inventory?.size).toBe(1);
  });

  it('returns null and logs when nodes is not an array', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const body = { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: 'garbage' } } };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.nodes missing')).toBe(true);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.incomplete')).toBe(true);
  });

  it('returns null and logs when a products page holds no variants', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const body = {
      data: {
        products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ variants: { nodes: [] } }] },
      },
    };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.no variants')).toBe(true);
  });

  it('returns null and logs when pageInfo has no boolean hasNextPage', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const body = {
      data: {
        products: {
          pageInfo: { endCursor: null },
          nodes: [{ variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', quantityAvailable: 5 }] } }],
        },
      },
    };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.pageinfo invalid')).toBe(true);
  });

  it('returns null and logs when pageInfo is missing', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const body = {
      data: {
        products: {
          nodes: [{ variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', quantityAvailable: 5 }] } }],
        },
      },
    };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.pageinfo missing')).toBe(true);
  });

  it('returns null and logs when the pull holds no variant', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const body = { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } };
    const inventory = await fetchStorefrontInventory(
      'test-shop.myshopify.com',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logger,
      pageFetch(body),
      new RateLimiter(1000)
    );
    expect(inventory).toBe(null);
    expect(records.some((entry) => entry.message === 'embeddedgraphql.empty')).toBe(true);
  });
});

describe('buildEmbeddedGraphqlProvider', () => {
  it('maps quantityAvailable into the catalog', async () => {
    const logger = createLogger(() => {});
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(CATALOG);
      }
      if (url.includes('/products/one')) {
        return jsonResponse(TOKEN_HTML);
      }
      if (url.includes('graphql.json')) {
        return jsonResponse(INVENTORY);
      }
      return jsonResponse('not found', 404);
    });
    const provider = buildEmbeddedGraphqlProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(7);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
  });

  it('fails the task when the page holds no token', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(CATALOG);
      }
      return jsonResponse('<html></html>');
    });
    const provider = buildEmbeddedGraphqlProvider(config(), logger, fetchFn);
    await expect(provider.fetchCatalog()).rejects.toThrow('Storefront token missing');
    const record = records.find((entry) => entry.message === 'embeddedgraphql.no token');
    expect(record?.level).toBe('error');
  });

  it('fails the task when the query is denied', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(CATALOG);
      }
      if (url.includes('/products/one')) {
        return jsonResponse(TOKEN_HTML);
      }
      if (url.includes('graphql.json')) {
        return jsonResponse({ errors: [{ message: 'Access denied for quantityAvailable field.' }] });
      }
      return jsonResponse('not found', 404);
    });
    const provider = buildEmbeddedGraphqlProvider(config(), logger, fetchFn);
    await expect(provider.fetchCatalog()).rejects.toThrow('Storefront inventory incomplete');
    const record = records.find((entry) => entry.message === 'embeddedgraphql.query failed');
    expect(record?.level).toBe('error');
    expect(record?.context['error']).toContain('Access denied');
    expect(records.some((entry) => entry.message === 'Provider.fetchCatalog failed')).toBe(true);
  });

  it('fails instead of applying a partial page', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    let page = 0;
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(CATALOG);
      }
      if (url.includes('/products/one')) {
        return jsonResponse(TOKEN_HTML);
      }
      if (url.includes('graphql.json')) {
        page += 1;
        if (page === 1) {
          return jsonResponse({
            data: {
              products: {
                pageInfo: { hasNextPage: true, endCursor: 'c1' },
                nodes: [{ variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', quantityAvailable: 7 }] } }],
              },
            },
          });
        }
        return jsonResponse('server error', 500);
      }
      return jsonResponse('not found', 404);
    });
    const provider = buildEmbeddedGraphqlProvider(config(), logger, fetchFn);
    await expect(provider.fetchCatalog()).rejects.toThrow('Storefront inventory incomplete');
    expect(records.some((entry) => entry.message === 'embeddedgraphql.incomplete')).toBe(true);
  });
});
