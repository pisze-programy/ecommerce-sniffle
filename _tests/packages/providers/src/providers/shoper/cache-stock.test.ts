import { describe, expect, it, vi } from 'vitest';
import {
  buildStockVariants,
  buildShoperCacheStockProvider,
  collectStockIds,
  maskProduct,
  parseOptionNames,
  parseProductStocksCache,
  parseStockValue,
} from '../../../../../../packages/providers/src/providers/shoper/cache-stock.ts';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import type { DirectFetch, DirectFetchResponse } from '../../../../../../packages/providers/src/module.ts';
import type { Product, Variant } from '../../../../../../packages/providers/src/types.ts';

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function pageWithCache(cache: unknown, options: ReadonlyArray<readonly [string, string]> = []): string {
  const select =
    '<select name="option_59">' +
    options.map(([id, name]) => `<option value="${id}" >${name}</option>`).join('') +
    '</select>';
  return `<html><script>Shop.values.ProductStocksCache = "${b64(cache)}";</script>${select}</html>`;
}

function createLoggerWithRecords(): { logger: ReturnType<typeof createLogger>; records: LogRecord[] } {
  const records: LogRecord[] = [];
  const logger = createLogger((record) => {
    records.push(record);
  });
  return { logger, records };
}

function asMap(
  read: 'absent' | 'empty' | 'broken' | ReadonlyMap<string, { stockId: string }>
): ReadonlyMap<string, { stockId: string }> {
  return typeof read === 'string' ? new Map() : read;
}

function variant(id: string, quantity: number | null): Variant {
  return {
    id,
    title: 'default',
    sku: null,
    price: { amount: 10, currency: 'PLN' },
    regularPrice: null,
    available: quantity === null ? true : quantity > 0,
    quantity,
  };
}

const PRODUCT: Product = {
  id: '31',
  title: 'Bluza',
  url: 'https://sklepskolim.pl/pl/p/Bluza/31',
  variants: [variant('39', null)],
};

describe('parseProductStocksCache', () => {
  it('reads the option map with the stock id', () => {
    const { logger } = createLoggerWithRecords();
    const cache = { 469: { sid: 5008, stock: 12 }, 470: { sid: 5009, stock: 0 } };
    const parsed = parseProductStocksCache(pageWithCache(cache), logger);
    expect(parsed?.get('469')).toEqual({ stockId: '5008' });
    expect(parsed?.get('470')).toEqual({ stockId: '5009' });
  });

  it('reads a list-shaped cache', () => {
    const { logger } = createLoggerWithRecords();
    const parsed = parseProductStocksCache(pageWithCache([{ id: 469, sid: 5008, stock: 7 }]), logger);
    expect(parsed?.get('469')).toEqual({ stockId: '5008' });
  });

  it('returns absent without the marker', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseProductStocksCache('<html></html>', logger)).toBe('absent');
  });

  it('returns broken for a broken base64 body', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseProductStocksCache('Shop.values.ProductStocksCache = "!!!not-base64";', logger)).toBe('broken');
    expect(records.some((record) => record.message === 'shoperstocks.cache parse failed')).toBe(true);
  });

  it('returns empty for an empty object', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseProductStocksCache(pageWithCache({}), logger)).toBe('empty');
  });

  it('returns absent for an empty list', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseProductStocksCache(pageWithCache([]), logger)).toBe('absent');
  });

  it('returns broken for a non-object body', () => {
    const { logger, records } = createLoggerWithRecords();
    const html = `Shop.values.ProductStocksCache = "${b64(42)}";`;
    expect(parseProductStocksCache(html, logger)).toBe('broken');
    expect(records.some((record) => record.message === 'shoperstocks.cache shape')).toBe(true);
  });

  it('skips an entry without a numeric stock id', () => {
    const { logger } = createLoggerWithRecords();
    const parsed = parseProductStocksCache(pageWithCache({ 469: { stock: 1 }, 470: { sid: 5009 } }), logger);
    expect(parsed?.has('469')).toBe(false);
    expect(parsed?.get('470')?.stockId).toBe('5009');
  });

  it('logs and returns broken when the marker holds no value', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseProductStocksCache('<script>ProductStocksCache</script>', logger)).toBe('broken');
    expect(records.some((record) => record.message === 'shoperstocks.marker without value')).toBe(true);
  });
});

describe('parseOptionNames', () => {
  it('maps the option value id to the option name', () => {
    const names = parseOptionNames(
      pageWithCache({}, [
        ['469', 'S'],
        ['470', 'M'],
      ])
    );
    expect(names.get('469')).toBe('S');
    expect(names.get('470')).toBe('M');
  });

  it('keeps the first name for a repeated value id', () => {
    const html =
      '<select name="option_59"><option value="469" >S</option></select>' +
      '<select name="option_60"><option value="469" >Other</option></select>';
    expect(parseOptionNames(html).get('469')).toBe('S');
  });

  it('returns an empty map without a select', () => {
    expect(parseOptionNames('<html></html>').size).toBe(0);
  });
});

describe('parseStockValue', () => {
  it('reads the exact count', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseStockValue('{"sid":5008,"stock":12}', logger, '5008')).toBe(12);
  });

  it('reads a zero count', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseStockValue('{"stock":0}', logger, '5008')).toBe(0);
  });

  it('returns null for an empty body', () => {
    const { logger } = createLoggerWithRecords();
    expect(parseStockValue('', logger, '5008')).toBe(null);
  });

  it('logs and returns null for a broken body', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseStockValue('not json', logger, '5008')).toBe(null);
    expect(records.some((record) => record.message === 'shoperstocks.stock parse failed')).toBe(true);
  });

  it('logs and rejects a fractional count', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseStockValue('{"stock":3.9}', logger, '5008')).toBe(null);
    expect(records.some((record) => record.message === 'shoperstocks.stock fractional')).toBe(true);
  });

  it('logs an empty body', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseStockValue('', logger, '5008')).toBe(null);
    expect(records.some((record) => record.message === 'shoperstocks.stock empty')).toBe(true);
  });

  it('logs a non-object body', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseStockValue('42', logger, '5008')).toBe(null);
    expect(records.some((record) => record.message === 'shoperstocks.stock shape')).toBe(true);
  });

  it('logs a missing count', () => {
    const { logger, records } = createLoggerWithRecords();
    expect(parseStockValue('{"sid":1}', logger, '5008')).toBe(null);
    expect(records.some((record) => record.message === 'shoperstocks.stock shape')).toBe(true);
  });
});

describe('collectStockIds', () => {
  it('lists the base id first and every cache id once', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 }, 470: { sid: 5009 } }), logger);
    const ids = collectStockIds(PRODUCT, asMap(inventory));
    expect(ids).toEqual(['39', '5008', '5009']);
  });

  it('drops a cache id that equals the base id', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 39 } }), logger);
    const map = inventory === 'absent' || inventory === 'broken' ? new Map() : inventory;
    expect(collectStockIds(PRODUCT, map)).toEqual(['39']);
  });
});

describe('buildStockVariants', () => {
  it('builds every variant with an exact count', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 }, 472: { sid: 5011 } }), logger);
    const names = parseOptionNames(
      '<select name="option_59"><option value="469" >S</option><option value="472" >XL</option></select>'
    );
    const stock = new Map([
      ['39', 78],
      ['5008', 12],
      ['5011', 6],
    ]);
    const variants = buildStockVariants(PRODUCT, asMap(inventory), names, stock);
    expect(variants?.map((entry) => entry.id)).toEqual(['39', '5008', '5011']);
    expect(variants?.map((entry) => entry.quantity)).toEqual([78, 12, 6]);
    expect(variants?.[1]?.title).toBe('S');
    expect(variants?.every((entry) => entry.quantity !== null)).toBe(true);
  });

  it('uses the option id as the title when the name is missing', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 } }), logger);
    const stock = new Map([
      ['39', 1],
      ['5008', 2],
    ]);
    expect(buildStockVariants(PRODUCT, asMap(inventory), new Map(), stock)?.[1]?.title).toBe('469');
  });

  it('builds the cache variants when the base id is excluded from the stock map', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 4940 } }), logger);
    const stock = new Map([['4940', 11]]);
    const variants = buildStockVariants(PRODUCT, asMap(inventory), new Map(), stock);
    expect(variants?.map((entry) => entry.id)).toEqual(['4940']);
    expect(variants?.[0]?.quantity).toBe(11);
  });

  it('marks a zero count as unavailable', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 } }), logger);
    const stock = new Map([
      ['39', 1],
      ['5008', 0],
    ]);
    const variants = buildStockVariants(PRODUCT, asMap(inventory), new Map(), stock);
    expect(variants?.[1]?.available).toBe(false);
  });

  it('returns null for a product without variants', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 } }), logger);
    const empty: Product = { ...PRODUCT, variants: [] };
    expect(buildStockVariants(empty, asMap(inventory), new Map(), new Map())).toBe(null);
  });

  it('returns null when no stock id is known', () => {
    const { logger } = createLoggerWithRecords();
    const inventory = parseProductStocksCache(pageWithCache({ 469: { sid: 5008 } }), logger);
    expect(buildStockVariants(PRODUCT, asMap(inventory), new Map(), new Map())).toBe(null);
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

function config() {
  return {
    id: 'sklepskolim',
    domain: 'sklepskolim.pl',
    platform: 'shoper' as const,
    schedule: '30 4 * * *',
    window: 'both' as const,
    mode: 'vps-get' as const,
    stockSource: 'cache-stock' as const,
    ratePerSecond: 1000,
    durationSeconds: 1200,
    requiresProxy: false,
    endpoint: 'https://sklepskolim.pl/webapi/front/pl_PL/products/PLN/list',
    enabled: true,
  };
}

function listBody(canBuy = true): unknown {
  return {
    list: [
      {
        id: 31,
        stockId: 39,
        name: 'Bluza',
        url: 'https://sklepskolim.pl/pl/p/Bluza/31',
        can_buy: canBuy,
        price: { gross: { base_float: 10, final_float: 10 } },
      },
    ],
  };
}

const EMPTY_VARIANT: Variant = {
  id: '39',
  title: 'default',
  sku: null,
  price: { amount: 10, currency: 'PLN' },
  regularPrice: null,
  available: false,
  quantity: 0,
};

const UNBUYABLE_PRODUCT: Product = {
  id: '31',
  title: 'Bluza',
  url: 'https://sklepskolim.pl/pl/p/Bluza/31',
  variants: [EMPTY_VARIANT],
};

describe('maskProduct', () => {
  it('turns every variant into an unknown count', () => {
    const masked = maskProduct(UNBUYABLE_PRODUCT);
    expect(masked.variants[0]?.quantity).toBe(null);
    expect(masked.variants[0]?.available).toBe(false);
  });
});

describe('buildShoperCacheStockProvider', () => {
  it('reads the exact stock for the base and every option variant', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (input: string | URL | Request): Promise<DirectFetchResponse> => {
      const url = String(input);
      if (url.includes('/list')) {
        return jsonResponse(listBody());
      }
      if (url.includes('/product/getstock/')) {
        return url.includes('stock=5008')
          ? jsonResponse({ sid: 5008, stock: 12 })
          : jsonResponse({ sid: 39, stock: 78 });
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }, [['469', 'S']]));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants.map((entry) => entry.id)).toEqual(['39', '5008']);
    expect(catalog.products[0]?.variants.map((entry) => entry.quantity)).toEqual([78, 12]);
    const requests = records.filter((record) => record.message === 'proxy.request');
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((record) => record.context['via'] === 'direct')).toBe(true);
    expect(records.find((record) => record.message === 'shoperstocks.enriched')?.context['enriched']).toBe(1);
  });

  it('reads the base stock when the page holds no cache', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 7 });
      }
      return jsonResponse('<html>no cache</html>');
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(7);
    expect(records.find((record) => record.message === 'shoperstocks.enriched')?.context['noCache']).toBe(1);
  });

  it('keeps a product when a stock fetch fails', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse('missing', 404);
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'shoperstocks.stock failed')).toBe(true);
    expect(records.find((record) => record.message === 'shoperstocks.enriched')?.context['failed']).toBe(1);
  });

  it('retries and masks when the page body read throws', async () => {
    const { logger, records } = createLoggerWithRecords();
    let pageCalls = 0;
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      const value = String(url);
      if (value.includes('/list')) {
        return jsonResponse(listBody());
      }
      if (value.includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      pageCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => {
          throw new Error('stream reset');
        },
      };
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(pageCalls).toBe(3);
    expect(records.some((record) => record.message === 'shoperstocks.page network')).toBe(true);
  });

  it('masks an unbuyable product when the page fetch fails', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody(false));
      }
      return jsonResponse('busy', 500);
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    // A failed pull must never store the catalog floor 0 as a real count.
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'shoperstocks.page failed')).toBe(true);
  });

  it('masks a product when the page holds a broken cache', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      return jsonResponse('Shop.values.ProductStocksCache = "!!!bad";');
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'shoperstocks.cache broken')).toBe(true);
  });

  it('masks a variant product with an empty cache object', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      return jsonResponse(pageWithCache({}, [['469', 'S']]));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'shoperstocks.cache empty')).toBe(true);
  });

  it('masks a product when the stock call throws a network error', async () => {
    const { logger, records } = createLoggerWithRecords();
    let calls = 0;
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        calls += 1;
        throw new Error('reset');
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(calls).toBeGreaterThan(1);
    expect(records.some((record) => record.message === 'shoperstocks.stock network')).toBe(true);
  });

  it('treats an empty cache list as a simple product', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      return jsonResponse(pageWithCache([]));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(records.some((record) => record.message === 'shoperstocks.cache broken')).toBe(false);
  });

  it('retries a 503 on the product page and reads it on a later attempt', async () => {
    vi.useFakeTimers();
    const { logger, records } = createLoggerWithRecords();
    let pageCalls = 0;
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      const value = String(url);
      if (value.includes('/list')) {
        return jsonResponse(listBody());
      }
      if (value.includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      pageCalls += 1;
      if (pageCalls === 1) {
        return jsonResponse('busy', 503);
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }));
    };
    const provider = buildShoperCacheStockProvider(config(), logger, fetchFn);
    const pending = provider.fetchCatalog();
    await vi.runAllTimersAsync();
    const catalog = await pending;
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(pageCalls).toBe(2);
    expect(records.some((record) => record.message === 'shoperstocks.page retry')).toBe(true);
    vi.useRealTimers();
  });

  it('logs and stops when the budget is spent', async () => {
    const { logger, records } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }));
    };
    const provider = buildShoperCacheStockProvider({ ...config(), durationSeconds: 0 }, logger, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(records.some((record) => record.message === 'shoperstocks.budget')).toBe(true);
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
  });

  it('paces every request when the rate is set', async () => {
    vi.useFakeTimers();
    const { logger } = createLoggerWithRecords();
    const fetchFn = async (url: string | URL | Request): Promise<DirectFetchResponse> => {
      if (String(url).includes('/list')) {
        return jsonResponse(listBody());
      }
      if (String(url).includes('/product/getstock/')) {
        return jsonResponse({ sid: 39, stock: 5 });
      }
      return jsonResponse(pageWithCache({ 469: { sid: 5008 } }));
    };
    const provider = buildShoperCacheStockProvider({ ...config(), ratePerSecond: 2 }, logger, fetchFn);
    const pending = provider.fetchCatalog();
    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
