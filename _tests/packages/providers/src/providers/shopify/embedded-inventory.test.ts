import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEmbeddedInventoryProvider,
  enrichProducts,
  fetchShopifyCookie,
  parseBisVariantData,
  parseDataInventoryQuantity,
  parseGrowInventory,
  parseKachingInventory,
  parseProductHandle,
  parseRestockProducts,
  parseRestockQuantity,
  parseRestockRocketQuantity,
  parseShopifyJsInventory,
  parseShopifyXmlInventory,
  parseVariantInventoryData,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/embedded-inventory.ts';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import type { DirectFetch, DirectFetchResponse } from '../../../../../../packages/providers/src/module.ts';
import type { WrappedFetch } from '../../../../../../packages/providers/src/network/manager.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BIS_HTML =
  '<script id="bis-variant-data" type="application/json">' +
  '[{"id":53670923403593,"title":"SHORT","price":119000,"available":true,"inventory_quantity":4},' +
  '{"id":53670923436361,"title":"REGULAR","price":119000,"available":true,"inventory_quantity":0}]' +
  '</script>';

const VARIANT_INV_HTML =
  '<script type="application/json" id="variantInventoryData">' +
  '[{"id":"53967052046675","sku":"260MR500-00","inventory_quantity":93},' +
  '{"id":"53967052079443","sku":"260MR500-01","inventory_quantity":0}]' +
  '</script>';

describe('parseBisVariantData', () => {
  it('extracts inventory per variant', () => {
    const inv = parseBisVariantData(
      BIS_HTML,
      createLogger(() => {})
    );
    expect(inv.get('53670923403593')).toBe(4);
    expect(inv.get('53670923436361')).toBe(0);
    expect(inv.size).toBe(2);
  });

  it('returns an empty map for a page without the script', () => {
    expect(
      parseBisVariantData(
        '<html></html>',
        createLogger(() => {})
      ).size
    ).toBe(0);
  });

  it('logs and returns an empty map for a malformed script body', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const html = '<script id="bis-variant-data" type="application/json">{oops}</script>';
    expect(parseBisVariantData(html, logger).size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });
});

describe('parseVariantInventoryData', () => {
  it('extracts inventory per variant', () => {
    const inv = parseVariantInventoryData(
      VARIANT_INV_HTML,
      createLogger(() => {})
    );
    expect(inv.get('53967052046675')).toBe(93);
    expect(inv.get('53967052079443')).toBe(0);
    expect(inv.size).toBe(2);
  });

  it('returns an empty map for a page without the script', () => {
    expect(
      parseVariantInventoryData(
        '<html></html>',
        createLogger(() => {})
      ).size
    ).toBe(0);
  });
});

describe('parseShopifyXmlInventory', () => {
  const XML =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<hash>' +
    '<variant><id type="integer">111</id><title>Small</title><inventory-quantity type="integer">42</inventory-quantity></variant>' +
    '<variant><id type="integer">222</id><title>Medium</title><inventory-quantity type="integer">78</inventory-quantity></variant>' +
    '<variant><id type="integer">333</id><title>Large</title><inventory-quantity type="integer">195</inventory-quantity></variant>' +
    '</hash>';

  it('extracts the exact quantity per variant', () => {
    const inv = parseShopifyXmlInventory(XML);
    expect(inv.get('111')).toBe(42);
    expect(inv.get('222')).toBe(78);
    expect(inv.get('333')).toBe(195);
    expect(inv.size).toBe(3);
  });

  it('reads a sold out variant as zero', () => {
    const inv = parseShopifyXmlInventory(
      '<hash><variant><id type="integer">1</id><inventory-quantity type="integer">0</inventory-quantity></variant></hash>'
    );
    expect(inv.get('1')).toBe(0);
  });

  it('skips a variant without a quantity', () => {
    const inv = parseShopifyXmlInventory('<hash><variant><id type="integer">1</id><title>X</title></variant></hash>');
    expect(inv.size).toBe(0);
  });

  it('returns an empty map for a page without variants', () => {
    expect(parseShopifyXmlInventory('<html></html>').size).toBe(0);
  });
});

describe('parseRestockRocketQuantity', () => {
  const HTML =
    'window._RestockRocketConfig.variantsPolicy = {1:"deny"};\n' +
    'window._RestockRocketConfig.variantsInventoryQuantity = {100 : parseInt("18"),200 : parseInt("0"),300 : parseInt("")};\n' +
    'window._RestockRocketConfig.variantsPreorderCount = {};';

  it('extracts quantities for variants with a number', () => {
    const inv = parseRestockRocketQuantity(HTML);
    expect(inv.get('100')).toBe(18);
    expect(inv.get('200')).toBe(0);
    expect(inv.size).toBe(2);
  });

  it('skips an empty quantity value', () => {
    const inv = parseRestockRocketQuantity(HTML);
    expect(inv.has('300')).toBe(false);
  });

  it('returns an empty map when the config is missing', () => {
    expect(parseRestockRocketQuantity('<html></html>').size).toBe(0);
  });

  it('extracts negative quantities for gift cards', () => {
    const html =
      'window._RestockRocketConfig.variantsInventoryQuantity = {400 : parseInt("-3"),500 : parseInt("-19")};';
    const inv = parseRestockRocketQuantity(html);
    expect(inv.get('400')).toBe(-3);
    expect(inv.get('500')).toBe(-19);
  });
});

describe('parseShopifyJsInventory', () => {
  it('maps variant ids to inventory from a js payload', () => {
    const body = JSON.stringify({
      variants: [
        { id: 111, inventory_quantity: 4 },
        { id: 222, inventory_quantity: 0 },
      ],
    });
    const inv = parseShopifyJsInventory(
      body,
      createLogger(() => {})
    );
    expect(inv.get('111')).toBe(4);
    expect(inv.get('222')).toBe(0);
    expect(inv.size).toBe(2);
  });

  it('logs and returns an empty map for invalid json', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    expect(parseShopifyJsInventory('not-json', logger).size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });

  it('returns an empty map when variants are missing', () => {
    expect(
      parseShopifyJsInventory(
        '{"id":1}',
        createLogger(() => {})
      ).size
    ).toBe(0);
  });
});

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

function config(ratePerSecond: number) {
  return {
    id: 'test',
    domain: 'test-shop.pl',
    platform: 'shopify' as const,
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'cf-get' as const,
    stockSource: 'embedded-json' as const,
    ratePerSecond,
    durationSeconds: 60,
    requiresProxy: false,
    endpoint: 'https://test-shop.pl/products.json',
    enabled: true,
  };
}

function catalogBody(): unknown {
  return {
    products: [
      {
        id: 1,
        handle: 'one',
        title: 'One',
        variants: [
          { id: 11, title: 'S', price: '10.00', compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
      {
        id: 2,
        handle: 'two',
        title: 'Two',
        variants: [
          { id: 12, title: 'S', price: '10.00', compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
      {
        id: 3,
        handle: 'three',
        title: 'Three',
        variants: [
          { id: 13, title: 'S', price: '10.00', compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
    ],
  };
}

const ONE_HTML = '<script id="bis-variant-data" type="application/json">[{"id":11,"inventory_quantity":5}]</script>';
const THREE_HTML = '<script id="bis-variant-data" type="application/json">[{"id":13,"inventory_quantity":7}]</script>';

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

describe('buildEmbeddedInventoryProvider', () => {
  it('enriches all products even when one page has no script', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      if (url.includes('/products/one')) {
        return jsonResponse(ONE_HTML);
      }
      if (url.includes('/products/two')) {
        return jsonResponse('<html>no script</html>');
      }
      if (url.includes('/products/three')) {
        return jsonResponse(THREE_HTML);
      }
      return jsonResponse('not found', 404);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(3);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(catalog.products[1]?.variants[0]?.quantity).toBeNull();
    expect(catalog.products[2]?.variants[0]?.quantity).toBe(7);
    const warn = records.find((record) => record.message === 'embedded.product no script');
    expect(warn?.level).toBe('warn');
    expect(warn?.context['productId']).toBe('2');
    const summary = records.find((record) => record.message === 'embedded.product enriched');
    expect(summary?.context['products']).toBe(3);
    expect(summary?.context['enriched']).toBe(2);
    expect(summary?.context['noScript']).toBe(1);
    const requests = records.filter((record) => record.message === 'proxy.request');
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((record) => record.context['via'] === 'direct')).toBe(true);
  });

  it('keeps a product unchanged and logs when the page fetch fails', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      if (url.includes('/products/one')) {
        return jsonResponse(ONE_HTML);
      }
      if (url.includes('/products/two')) {
        return 'throw';
      }
      if (url.includes('/products/three')) {
        return jsonResponse(THREE_HTML);
      }
      return jsonResponse('not found', 404);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[1]?.variants[0]?.quantity).toBeNull();
    const warn = records.find((record) => record.message === 'embedded.product fetch failed');
    expect(warn?.level).toBe('warn');
    expect(warn?.context['productId']).toBe('2');
  });

  it('does not retry a 404 and logs the status', async () => {
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    vi.stubGlobal('setTimeout', ((callback: () => void): ReturnType<typeof setTimeout> => {
      return realSetTimeout(callback, 0);
    }) as typeof setTimeout);
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    let pageCalls = 0;
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      if (url.includes('/products/one')) {
        pageCalls += 1;
        return jsonResponse('missing', 404);
      }
      return jsonResponse(ONE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(pageCalls).toBe(1);
    const warn = records.find(
      (record) => record.message === 'embedded.product fetch failed' && record.context['productId'] === '1'
    );
    expect(warn?.context['error']).toContain('status 404');
  });

  it('retries a 500 and reads the page on a later attempt', async () => {
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    vi.stubGlobal('setTimeout', ((callback: () => void): ReturnType<typeof setTimeout> => {
      return realSetTimeout(callback, 0);
    }) as typeof setTimeout);
    const logger = createLogger(() => {});
    let pageCalls = 0;
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      if (url.includes('/products/one')) {
        pageCalls += 1;
        if (pageCalls <= 2) {
          return jsonResponse('server error', 500);
        }
        return jsonResponse(ONE_HTML);
      }
      return jsonResponse(THREE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(pageCalls).toBe(3);
  });

  it('maps a negative embedded quantity to buyable 1', async () => {
    const logger = createLogger(() => {});
    const RR_HTML = '<html>window._RestockRocketConfig.variantsInventoryQuantity = {11 : parseInt("-3")};</html>';
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      return jsonResponse(RR_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseRestockRocketQuantity, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(1);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
  });

  it('paces fetches according to ratePerSecond', async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    vi.stubGlobal('setTimeout', ((callback: () => void, ms?: number): ReturnType<typeof setTimeout> => {
      delays.push(ms ?? 0);
      return realSetTimeout(callback, 0);
    }) as typeof setTimeout);
    const logger = createLogger(() => {});
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      return jsonResponse(ONE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(4), logger, parseBisVariantData, fetchFn);
    await provider.fetchCatalog();
    expect(delays).toEqual([250, 250]);
  });
});

describe('fetchShopifyCookie', () => {
  it('joins every cookie from the set-cookie headers', async () => {
    const logger = createLogger(() => {});
    const headers = new Headers();
    headers.append('set-cookie', 'localization=PL; path=/');
    headers.append('set-cookie', 'cart_currency=PLN; path=/');
    const mockResponse = {
      headers,
      body: { cancel: async () => {} },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const cookie = await fetchShopifyCookie('gymglamour.com', logger);
    expect(cookie).toBe('localization=PL; cart_currency=PLN');
  });

  it('returns null when the shop sets no cookie', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        headers: new Headers(),
        body: { cancel: async () => {} },
      })
    );
    const cookie = await fetchShopifyCookie('gymglamour.com', logger);
    expect(cookie).toBeNull();
  });

  it('logs and returns null when the fetch fails', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const failing = async (): Promise<never> => {
      throw new Error('network down');
    };
    const cookie = await fetchShopifyCookie('gymglamour.com', logger, failing);
    expect(cookie).toBeNull();
    const record = records.find((entry) => entry.message === 'shopify.cookie failed');
    expect(record?.level).toBe('warn');
    expect(record?.context['error']).toBe('network down');
  });

  it('logs when the body cancel fails', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const headers = new Headers();
    headers.append('set-cookie', 'localization=PL; path=/');
    const failingCancel: WrappedFetch = async () => ({
      ok: true,
      status: 200,
      headers,
      body: {
        cancel: async () => {
          throw new Error('cancel down');
        },
      },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    });
    const cookie = await fetchShopifyCookie('gymglamour.com', logger, failingCancel);
    expect(cookie).toBe('localization=PL');
    const record = records.find((entry) => entry.message === 'shopify.cookie cancel failed');
    expect(record?.level).toBe('warn');
    expect(record?.context['error']).toBe('cancel down');
  });
});

describe('parseKachingInventory', () => {
  const HTML =
    '<script class="kaching-bundles-product" data-product-id="1" type="application/json">' +
    '{"id":1,"variants":[{"id":11,"inventoryQuantity":47},{"id":12,"inventoryQuantity":96}]}' +
    '</script>';

  it('reads the variant count from the bundle JSON', () => {
    const logger = createLogger(() => {});
    const inv = parseKachingInventory(HTML, logger);
    expect(inv.get('11')).toBe(47);
    expect(inv.get('12')).toBe(96);
  });

  it('logs and skips a malformed JSON block', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const inv = parseKachingInventory(
      '<script class="kaching-bundles-product" type="application/json">{oops}</script>',
      logger
    );
    expect(inv.size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });

  it('returns an empty map without the block', () => {
    expect(
      parseKachingInventory(
        '<html></html>',
        createLogger(() => {})
      ).size
    ).toBe(0);
  });
});

describe('parseDataInventoryQuantity', () => {
  it('reads the id and qty list', () => {
    const inv = parseDataInventoryQuantity(
      '<script data-inventory-quantity>[{"id":21,"qty":420}]</script>',
      createLogger(() => {})
    );
    expect(inv.get('21')).toBe(420);
  });

  it('logs and skips a malformed list', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const inv = parseDataInventoryQuantity('<script data-inventory-quantity>[oops]</script>', logger);
    expect(inv.size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });
});

describe('parseGrowInventory', () => {
  it('reads the JS map of variant id and count', () => {
    const inv = parseGrowInventory(
      'window.gwProductInventoryQuantity[31]="34";window.gwProductInventoryQuantity[32]="59";'
    );
    expect(inv.get('31')).toBe(34);
    expect(inv.get('32')).toBe(59);
  });

  it('returns an empty map for a plain page', () => {
    expect(parseGrowInventory('<html></html>').size).toBe(0);
  });
});

describe('parseRestockQuantity', () => {
  it('reads the variant quantity from the config', () => {
    const inv = parseRestockQuantity(
      'var _ReStockConfig = { product: { variants: [{ id: 41, title: "S", quantity: 191 }] } };',
      createLogger(() => {}),
      'test-shop.pl'
    );
    expect(inv.get('41')).toBe(191);
  });

  it('does not attach the next variant quantity to a variant without one', () => {
    const inv = parseRestockQuantity(
      'var _ReStockConfig = { product: { variants: [{ id: 41, title: "S" }, { id: 42, title: "M", quantity: 9 }] } };',
      createLogger(() => {}),
      'test-shop.pl'
    );
    expect(inv.has('41')).toBe(false);
    expect(inv.get('42')).toBe(9);
  });

  it('returns an empty map without the config', () => {
    expect(
      parseRestockQuantity(
        '<html></html>',
        createLogger(() => {}),
        'test-shop.pl'
      ).size
    ).toBe(0);
  });

  it('reads the flat variant group and the quote group apart', () => {
    const html =
      'var _ReStockConfig = {' +
      ' groupA: { variants: [{ id: 41, title: "S", quantity: 191 }, { id: 42, title: "M", quantity: 3 }] },' +
      ' groupB: { variants: [{ "id": 77, "qty": 12 }] }' +
      ' };';
    const groups = parseRestockProducts(
      html,
      createLogger(() => {}),
      'test-shop.pl'
    );
    expect(groups.get('restock-quantity')?.get('41')).toBe(191);
    expect(groups.get('restock-quantity')?.get('42')).toBe(3);
    expect(groups.get('data-inventory-quantity')?.get('77')).toBe(12);
  });

  it('returns no group without the config', () => {
    const groups = parseRestockProducts(
      '<html></html>',
      createLogger(() => {}),
      'test-shop.pl'
    );
    expect(groups.size).toBe(0);
  });

  it('logs and returns no group for a truncated block', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const html = 'var _ReStockConfig = { variants: [{ id: 41, quantity: 191 }] }' + ' '.repeat(200000);
    const groups = parseRestockProducts(html, logger, 'test-shop.pl');
    expect(groups.size).toBe(0);
    const record = records.find((entry) => entry.message === 'embeddedinventory.restock truncated');
    expect(record?.level).toBe('warn');
    expect(record?.context['domain']).toBe('test-shop.pl');
  });

  it('logs and returns an empty map for a truncated config', () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const html = 'var _ReStockConfig = { product: { variants: [{ id: 41, quantity: 191 }] } };' + ' '.repeat(200000);
    const inv = parseRestockQuantity(html, logger, 'test-shop.pl');
    expect(inv.size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.restock truncated')).toBe(true);
  });
});

describe('parseProductHandle', () => {
  it('reads the handle from the catalog url', () => {
    expect(parseProductHandle('https://test-shop.pl/products/the-corsico-pants')).toBe('the-corsico-pants');
  });

  it('strips the query string', () => {
    expect(parseProductHandle('https://test-shop.pl/products/the-corsico-pants?variant=1')).toBe('the-corsico-pants');
  });

  it('returns null for an empty handle', () => {
    expect(parseProductHandle('https://test-shop.pl/products/')).toBe(null);
  });
});

describe('buildEmbeddedInventoryProvider with the Grow vector', () => {
  it('reads the true count from the product page', async () => {
    const logger = createLogger(() => {});
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse(catalogBody());
      }
      if (url.includes('/products/one')) {
        return jsonResponse('window.gwProductInventoryQuantity[11]="62";');
      }
      return jsonResponse('<html></html>');
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseGrowInventory, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(62);
  });

  it('keeps a product with an empty handle and logs', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes('/products.json')) {
        return jsonResponse({
          products: [
            {
              id: 9,
              handle: '',
              title: 'X',
              variants: [
                {
                  id: 90,
                  title: 'S',
                  price: '1.00',
                  compare_at_price: null,
                  available: true,
                  inventory_quantity: null,
                },
              ],
            },
          ],
        });
      }
      return jsonResponse(ONE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'embedded.product bad url')).toBe(true);
  });
});

describe('enrichProducts budget', () => {
  it('stops at the budget and logs', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const product = {
      id: '1',
      title: 'One',
      url: 'https://test-shop.pl/products/one',
      variants: [
        {
          id: '11',
          title: 'S',
          sku: null,
          price: { amount: 1, currency: 'PLN' },
          regularPrice: null,
          available: true,
          quantity: null,
        },
      ],
    };
    const fetchFn = makeFetch(() => jsonResponse(ONE_HTML));
    const cookieFetch = makeFetch(() => jsonResponse('<html></html>'));
    const result = await enrichProducts(
      [product],
      'test-shop.pl',
      parseBisVariantData,
      logger,
      fetchFn,
      0,
      '',
      cookieFetch,
      0
    );
    expect(result[0]?.variants[0]?.quantity).toBeNull();
    const record = records.find((entry) => entry.message === 'embeddedinventory.budget');
    expect(record?.level).toBe('warn');
    expect(record?.context['remaining']).toBe(1);
  });
});

describe('cookie rotation on a persistent 429', () => {
  it('rotates the cookie and retries after a 429', async () => {
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    vi.stubGlobal('setTimeout', ((callback: () => void): ReturnType<typeof setTimeout> => {
      return realSetTimeout(callback, 0);
    }) as typeof setTimeout);
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const cookieHeaders = new Headers();
    cookieHeaders.append('set-cookie', 'localization=PL; path=/');
    const cookieFetch: WrappedFetch = async () => ({
      ok: true,
      status: 200,
      headers: cookieHeaders,
      body: { cancel: async () => {} },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    });
    let pageCalls = 0;
    const fetchFn = async (): Promise<DirectFetchResponse> => {
      pageCalls += 1;
      if (pageCalls <= 3) {
        return jsonResponse('rate limited', 429);
      }
      return jsonResponse(ONE_HTML);
    };
    const product = {
      id: '1',
      title: 'One',
      url: 'https://test-shop.pl/products/one',
      variants: [
        {
          id: '11',
          title: 'S',
          sku: null,
          price: { amount: 1, currency: 'PLN' },
          regularPrice: null,
          available: true,
          quantity: null,
        },
      ],
    };
    const result = await enrichProducts(
      [product],
      'test-shop.pl',
      parseBisVariantData,
      logger,
      fetchFn,
      0,
      '',
      cookieFetch,
      60000
    );
    expect(result[0]?.variants[0]?.quantity).toBe(5);
    expect(records.some((record) => record.message === 'shopify.rotation')).toBe(true);
    expect(
      records.some((record) => record.message === 'shopify.cookie' && record.context['reason'] === 'session-start')
    ).toBe(true);
  });
});
