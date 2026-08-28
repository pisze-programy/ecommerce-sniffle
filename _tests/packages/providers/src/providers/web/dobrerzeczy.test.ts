import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { Logger, LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import {
  findAllProducts,
  parseNuxtPayload,
  parseProductFromPayload,
  dobrerzeczyModule,
} from '../../../../../../packages/providers/src/providers/web/dobrerzeczy.ts';

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

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(ok: boolean, status: number, body: string) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

function htmlFor(data: unknown): string {
  return `<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}

function payload(): unknown[] {
  return [
    ['ShallowReactive', 1],
    { pinia: 3 },
    ['ShallowReactive', 4],
    { shop: 5 },
    { product: 5 },
    { _id: 6, name: 7, price: 8, sizes: 9, slug: 10, isPreorder: 11, isCollection: 26 },
    'prod-1',
    'Koszulka classic',
    50,
    [12, 17],
    'koszulka-classic',
    false,
    { size: 13, stock: 15, _id: 16 },
    { _id: 14, name: 18, sizes: 9 },
    'size-meta-s',
    3,
    'size-entry-s',
    { size: 21, stock: 23, _id: 24 },
    'S',
    0,
    '',
    { _id: 22, name: 25 },
    'size-meta-m',
    0,
    'size-entry-m',
    'M',
    true,
  ];
}

describe('parseNuxtPayload', () => {
  it('parses a valid nuxt payload', () => {
    const data = parseNuxtPayload(htmlFor([['ShallowReactive', 1], { pinia: 3 }]));
    expect(data).not.toBeNull();
    expect(data?.length).toBe(2);
  });

  it('returns null when the payload script is missing', () => {
    expect(parseNuxtPayload('<html></html>')).toBeNull();
  });

  it('returns null for invalid json', () => {
    expect(parseNuxtPayload('<script id="__NUXT_DATA__">not-json</script>')).toBeNull();
  });

  it('logs a warning when the payload is invalid json', () => {
    const capture = capturingLogger();
    expect(parseNuxtPayload('<script id="__NUXT_DATA__">not-json</script>', capture.logger)).toBeNull();
    expect(capture.records[0]?.level).toBe('warn');
    expect(capture.records[0]?.message).toBe('dobrerzeczy.nuxt payload parse failed');
  });

  it('returns null for a non-array payload', () => {
    expect(parseNuxtPayload(htmlFor({ a: 1 }))).toBeNull();
  });
});

describe('findAllProducts', () => {
  it('finds every product in a cyclic payload without hanging', () => {
    const products = findAllProducts(payload());
    expect(products).toHaveLength(1);
    expect(products[0]?.['_id']).toBe(6);
    expect(products[0]?.['slug']).toBe(10);
  });

  it('finds multiple products in one payload', () => {
    const data = payload();
    data.push(
      { _id: 40, name: 41, price: 42, sizes: 43, slug: 44, isPreorder: 45 },
      'prod-2',
      'Tees Soma',
      42,
      [],
      'tees-soma',
      false
    );
    const products = findAllProducts(data);
    expect(products).toHaveLength(2);
    expect(products[1]?.['_id']).toBe(40);
  });

  it('returns an empty array for a payload with no products', () => {
    expect(findAllProducts([['ShallowReactive', 1], { pinia: 3 }])).toEqual([]);
  });
});

describe('parseProductFromPayload', () => {
  it('parses a product with exact stock per size', () => {
    const data = payload();
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product?.id).toBe('prod-1');
    expect(product?.title).toBe('Koszulka classic');
    expect(product?.url).toBe('https://dobrerzeczy.pl/produkt/koszulka-classic');
    expect(product?.variants).toHaveLength(2);
    const sizeS = product?.variants[0];
    expect(sizeS?.title).toBe('S');
    expect(sizeS?.quantity).toBe(3);
    expect(sizeS?.available).toBe(true);
    expect(sizeS?.price.amount).toBe(50);
    const sizeM = product?.variants[1];
    expect(sizeM?.title).toBe('M');
    expect(sizeM?.quantity).toBe(0);
    expect(sizeM?.available).toBe(false);
  });

  it('marks a preorder product as buyable with quantity 1', () => {
    const data = payload();
    data[11] = true;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product?.variants[0]?.quantity).toBe(1);
    expect(product?.variants[0]?.available).toBe(true);
  });

  it('treats a product outside the active collection as sold out', () => {
    const data = payload();
    data[26] = false;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product?.variants[0]?.quantity).toBe(0);
    expect(product?.variants[0]?.available).toBe(false);
    expect(product?.variants[1]?.quantity).toBe(0);
    expect(product?.variants[1]?.available).toBe(false);
  });

  it('keeps the per-size stock when the product is in the active collection', () => {
    const data = payload();
    data[26] = true;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product?.variants[0]?.quantity).toBe(3);
    expect(product?.variants[0]?.available).toBe(true);
  });

  it('keeps the stock as masked when the size has no stock', () => {
    const data = payload();
    data[15] = null;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product?.variants[0]?.quantity).toBeNull();
    expect(product?.variants[0]?.available).toBe(false);
  });

  it('returns null when the product has no sizes', () => {
    const data = payload();
    (data[5] as Record<string, unknown>)['sizes'] = 50;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product).toBeNull();
  });

  it('returns null when the product has no id', () => {
    const data = payload();
    data[6] = 999;
    (data[5] as Record<string, unknown>)['slug'] = 999;
    const product = parseProductFromPayload(data, data[5] as Record<string, unknown>, 'dobrerzeczy.pl', silentLogger());
    expect(product).toBeNull();
  });
});

describe('dobrerzeczyModule', () => {
  it('fetches the whole catalog from one homepage request', async () => {
    const capture = capturingLogger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(true, 200, htmlFor(payload()))));
    const provider = dobrerzeczyModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(3);
  });

  it('throws when the payload is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(true, 200, '<html></html>')));
    const provider = dobrerzeczyModule.build({ logger: silentLogger() });
    await expect(provider.fetchCatalog()).rejects.toThrow('dobrerzeczy payload missing');
  });

  it('throws when the payload has no products', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(true, 200, htmlFor([['ShallowReactive', 1]]))));
    const provider = dobrerzeczyModule.build({ logger: silentLogger() });
    await expect(provider.fetchCatalog()).rejects.toThrow('dobrerzeczy catalog empty');
  });

  it('retries a rate limited homepage and succeeds', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          return response(false, 429, 'rate limited');
        }
        return response(true, 200, htmlFor(payload()));
      })
    );
    const provider = dobrerzeczyModule.build({ logger: silentLogger() });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(attempts).toBe(3);
  });

  it('logs an error when the homepage stays rate limited', async () => {
    const capture = capturingLogger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(false, 429, 'rate limited')));
    const provider = dobrerzeczyModule.build({ logger: capture.logger });
    await expect(provider.fetchCatalog()).rejects.toThrow('failed with status 429');
    expect(capture.records.some((record) => record.message === 'Provider.fetchCatalog failed')).toBe(true);
  });
});
