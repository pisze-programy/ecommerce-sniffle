import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import {
  parseBasketWarning,
  parseShoperList,
  parseShoperPages,
  extractWarning,
  revealVariant,
  buildOptionCombos,
  revealProduct,
  fetchShoperCatalog,
  extractCookiesFromResponse,
  isEmptyAddResponse,
  buildBasketRevealProvider,
} from '../../../../../../packages/providers/src/providers/shoper/basket-reveal.ts';
import type { Product } from '@ecommerce-sniffle/providers';

const { undiciFetchMock, closeableAgent } = vi.hoisted(() => ({
  undiciFetchMock: vi.fn(),
  closeableAgent: class {
    async close(): Promise<void> {}
  },
}));

vi.mock('undici', () => ({
  fetch: undiciFetchMock,
  Agent: closeableAgent,
  ProxyAgent: closeableAgent,
}));

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

const DOMAIN = 'sklepskolim.pl';

describe('extractWarning', () => {
  it('extracts the decoded warning from a raw json body', () => {
    const capture = capturingLogger();
    const raw =
      '{"basket":{},"_flash_messenger":{"error":[],"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek SKOLIM - 13 szt. ."],"info":[],"success":[]}}';
    const warning = extractWarning(raw, capture.logger);
    expect(warning).toBe('Aktualnie dostępna ilość to: Kubek SKOLIM - 13 szt. .');
    expect(parseBasketWarning(warning ?? '')).toBe(13);
    expect(capture.records).toHaveLength(0);
  });

  it('extracts the warning from the flashMessages key', () => {
    const capture = capturingLogger();
    const raw =
      '{"flashMessages":[{"isError":true,"message":"Ten produkt nie jest dost\u0119pny w wybranej ilo\u015bci. Maksymalna dost\u0119pna ilo\u015b\u0107 to 1505 szt.","showInBasketOnly":false}]}';
    const warning = extractWarning(raw, capture.logger);
    expect(warning).toBe('Ten produkt nie jest dostępny w wybranej ilości. Maksymalna dostępna ilość to 1505 szt.');
    expect(parseBasketWarning(warning ?? '')).toBe(1505);
    expect(capture.records).toHaveLength(0);
  });

  it('returns null when the flash messenger is missing', () => {
    const capture = capturingLogger();
    expect(extractWarning('{"basket":{}}', capture.logger)).toBeNull();
    expect(capture.records).toHaveLength(0);
  });

  it('returns null and logs a warning when the body is not valid json', () => {
    const capture = capturingLogger();
    expect(extractWarning('not json', capture.logger)).toBeNull();
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe('warn');
    expect(capture.records[0]?.message).toBe('basketreveal.put response parse failed');
  });
});

describe('parseBasketWarning', () => {
  it('reads the maximum available quantity message', () => {
    expect(parseBasketWarning('Maksymalna dostępna ilość to 1505 szt.')).toBe(1505);
  });

  it('reads the maximum available quantity message from a longer text', () => {
    const text = 'Ten produkt nie jest dostępny w wybranej ilości. Maksymalna dostępna ilość to 1505 szt.';
    expect(parseBasketWarning(text)).toBe(1505);
  });

  it('reads the plain spelling variant', () => {
    expect(parseBasketWarning('Maksymalna dostepna ilosc to 42 szt')).toBe(42);
  });

  it('keeps the existing current-stock message', () => {
    expect(parseBasketWarning('Aktualnie dostępna ilość to: Kubek - 13 szt. .')).toBe(13);
    expect(parseBasketWarning('Current stock is: Mug - 7 szt.')).toBe(7);
  });

  it('reads the last number when the product name contains a count', () => {
    const text =
      'Ilość produktów w koszyku przekracza dostępny stan magazynowy. <br /> ' +
      'Aktualnie dostępna ilość to: SOSY ZERO SŁODKIE DZIK® - 2 SZT. - 1505 szt. [Smak 1: Jagoda; Smak 2: Jagoda].';
    expect(parseBasketWarning(text)).toBe(1505);
  });

  it('returns null when no quantity message is present', () => {
    expect(parseBasketWarning('Produkt dodany do koszyka.')).toBeNull();
  });
});

describe('revealVariant', () => {
  it('logs a warning when the add response is not valid json', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'not-json',
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'basketreveal.add response parse failed')).toBe(true);
  });

  it('logs a warning when the basket add fails', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        headers: { get: () => null },
        text: async () => '{"message":"wybierz wariant"}',
      })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'basketreveal failed')).toBe(true);
  });

  it('returns 0 when the product is inactive', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"added":[],"_flash_messenger":{"error":["Produkt jest nieaktywny i nie mo\u017ce zosta\u0107 dodany do koszyka."],"warning":[]}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBe(0);
  });

  it('falls back to the put when the add response has no clamp', async () => {
    const capture = capturingLogger();
    const addBody = '{"added":[{"id":596940,"name":"Kubek"}]}';
    const putBody =
      '{"basket":{},"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek - 13 szt. ."]}}';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'Shop5=abc' },
          text: async () => addBody,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => putBody,
        })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBe(13);
  });

  it('blocks and logs when the basket add hits a cloudflare challenge', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => '<title>Verifying your connection...</title>',
      })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'basketreveal.challenge blocked')).toBe(true);
  });

  it('reads the clamp warning directly from the add response', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"added":[{"id":596940,"name":"Kubek"}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek - 13 szt. ."],"error":[]}}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'Shop5=abc' },
      text: async () => addBody,
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result?.quantity).toBe(13);
    expect(fetchMock.mock.calls.length).toBe(1);
    const addCall = fetchMock.mock.calls[0];
    const addInit = addCall?.[1];
    expect(String(addInit?.body)).toContain('999999999');
  });

  it('reads the exact quantity from the addedItem field', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"flashMessages":[{"isError":true,"message":"Maksymalna dost\u0119pna ilo\u015b\u0107 to 1505 szt."}],"addedItem":{"itemId":"abc123","quantity":1505,"addedQuantity":1505}}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => addBody,
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await revealVariant('wkdzik.pl', 7318, capture.logger);
    expect(result?.quantity).toBe(1505);
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(capture.records.some((record) => record.message === 'basketreveal.add empty for variant product')).toBe(
      false
    );
  });

  it('reads the exact quantity from the addedQuantity fallback', async () => {
    const capture = capturingLogger();
    const addBody = '{"addedItem":{"itemId":"abc123","addedQuantity":42}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('wkdzik.pl', 7318, capture.logger);
    expect(result?.quantity).toBe(42);
  });

  it('reads the quantity from the basket item matched by variantId', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"basket":{"items":{"list":[{"variantId":111,"quantity":99},{"variantId":7318,"quantity":1505}]}}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('wkdzik.pl', 7318, capture.logger);
    expect(result?.quantity).toBe(1505);
  });

  it('reads the quantity from the flashMessages clamp message', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"flashMessages":[{"isError":true,"message":"Ten produkt nie jest dost\u0119pny w wybranej ilo\u015bci. Maksymalna dost\u0119pna ilo\u015b\u0107 to 1505 szt."}]}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('wkdzik.pl', 7318, capture.logger);
    expect(result?.quantity).toBe(1505);
  });

  it('blocks and logs when the basket put hits a cloudflare challenge', async () => {
    const capture = capturingLogger();
    const addBody = '{"added":[{"id":596940,"name":"Kubek"}]}';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'Shop5=abc' },
          text: async () => addBody,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 429,
          headers: { get: () => null },
          text: async () => '<title>Verifying your connection...</title>',
        })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'basketreveal.challenge blocked')).toBe(true);
  });

  it('marks the product as having options when the added item has a variant label', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"added":[{"id":596940,"name":"SOSY ZERO","variant":"Smak 1: Jagoda; Smak 2: Jagoda","quantity":999999999}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: SOSY ZERO - 2 SZT. - 1505 szt. [Smak 1: Jagoda; Smak 2: Jagoda]"],"error":[]}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('wkdzik.pl', 7318, capture.logger);
    expect(result?.quantity).toBe(1505);
    expect(result?.hasOptions).toBe(true);
  });

  it('marks the product as simple when the added item has no variant label', async () => {
    const capture = capturingLogger();
    const addBody =
      '{"added":[{"id":596940,"name":"Kubek"}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek - 13 szt. ."],"error":[]}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => addBody,
      })
    );
    const result = await revealVariant('sklepskolim.pl', 47, capture.logger);
    expect(result?.quantity).toBe(13);
    expect(result?.hasOptions).toBe(false);
  });
});

describe('buildOptionCombos', () => {
  it('builds a single combo from one group', () => {
    const combos = buildOptionCombos([{ id: 59, name: 'Rozmiar', values: [{ id: '472', name: 'XL' }] }]);
    expect(combos).toHaveLength(1);
    expect(combos[0]?.options).toEqual({ '59': '472' });
    expect(combos[0]?.label).toBe('Rozmiar: XL');
  });

  it('builds the cartesian product across groups', () => {
    const combos = buildOptionCombos([
      {
        id: 1,
        name: 'Rozmiar',
        values: [
          { id: 's', name: 'S' },
          { id: 'm', name: 'M' },
        ],
      },
      { id: 2, name: 'Kolor', values: [{ id: 'cz', name: 'czarny' }] },
    ]);
    expect(combos).toHaveLength(2);
    expect(combos[0]?.label).toBe('Rozmiar: S, Kolor: czarny');
    expect(combos[1]?.label).toBe('Rozmiar: M, Kolor: czarny');
  });

  it('builds a placeholder combo for a text option without values', () => {
    const combos = buildOptionCombos([{ id: 38, name: 'GRAWERUNEK', type: 'text' }]);
    expect(combos).toHaveLength(1);
    expect(combos[0]?.options).toEqual({ '38': 'x' });
  });

  it('returns an empty array for a malformed configuration', () => {
    expect(buildOptionCombos(null)).toEqual([]);
    expect(buildOptionCombos([{ id: 1, values: [] }])).toEqual([]);
    expect(buildOptionCombos('nope')).toEqual([]);
  });
});

describe('revealProduct', () => {
  const variantProduct: Product = {
    id: '31',
    title: 'Bluza',
    url: 'https://sklepskolim.pl/pl/p/bluza/31',
    variants: [
      {
        id: '39',
        title: 'default',
        sku: null,
        price: { amount: 179, currency: 'PLN' },
        regularPrice: null,
        available: true,
        quantity: null,
      },
    ],
  };

  const detailJson = JSON.stringify({
    options_configuration: [{ id: 59, name: 'Rozmiar', values: [{ id: '472', name: 'XL' }] }],
  });
  const addEmpty = '{"added":[],"_flash_messenger":{"error":["wybierz wariant"]}}';
  const addOk = '{"added":[{"id":1,"variant":"Rozmiar: XL"}]}';
  const putOk = '{"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Bluza - 7 szt. ."]}}';

  function okResponse(body: string, setCookie: string | null = null) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => setCookie },
      text: async () => body,
      arrayBuffer: async () => Buffer.from(body).buffer as ArrayBuffer,
      json: async () => JSON.parse(body),
    };
  }

  it('expands the option combos when the base add reveals options', async () => {
    const capture = capturingLogger();
    const baseAdd =
      '{"added":[{"id":1,"variant":"Smak 1: A; Smak 2: B"}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: SOSY - 2 SZT. - 1505 szt. [Smak 1: A; Smak 2: B]"],"error":[]}}';
    const detailTwo = JSON.stringify({
      options_configuration: [
        {
          id: 37,
          name: 'Smak 1',
          values: [
            { id: '351', name: 'A' },
            { id: '352', name: 'C' },
          ],
        },
      ],
    });
    const comboA =
      '{"added":[{"id":1,"variant":"Smak 1: A"}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: SOSY - 2 SZT. - 10 szt. [Smak 1: A]"],"error":[]}}';
    const comboC =
      '{"added":[{"id":1,"variant":"Smak 1: C"}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: SOSY - 2 SZT. - 0 szt. [Smak 1: C]"],"error":[]}}';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(baseAdd))
        .mockResolvedValueOnce(okResponse(detailTwo))
        .mockResolvedValueOnce(okResponse(comboA))
        .mockResolvedValueOnce(okResponse(comboC))
    );
    const variants = await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    expect(variants).toHaveLength(2);
    expect(variants[0]?.id).toBe('31-Smak 1: A');
    expect(variants[0]?.quantity).toBe(10);
    expect(variants[1]?.id).toBe('31-Smak 1: C');
    expect(variants[1]?.quantity).toBe(0);
  });

  it('caps an option explosion and stops on dead combos', async () => {
    const capture = capturingLogger();
    const detailExplosion = JSON.stringify({
      options_configuration: [
        { id: 1, name: 'A', values: Array.from({ length: 15 }, (_, i) => ({ id: String(i), name: `a${i}` })) },
        { id: 2, name: 'B', values: Array.from({ length: 15 }, (_, i) => ({ id: String(i), name: `b${i}` })) },
      ],
    });
    let calls = 0;
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      calls += 1;
      if (u.includes('/products/PLN/')) {
        return okResponse(detailExplosion);
      }
      return okResponse(addEmpty);
    });
    vi.stubGlobal('fetch', fetchMock);
    const variants = await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    expect(calls).toBeLessThanOrEqual(17);
    expect(capture.records.some((record) => record.message === 'basketreveal.option explosion')).toBe(true);
    expect(capture.records.some((record) => record.message === 'basketreveal.dead combos')).toBe(true);
    expect(variants).toHaveLength(1);
  });

  it('probes all combos when the count stays under the cap', async () => {
    const capture = capturingLogger();
    const detailBelow = JSON.stringify({
      options_configuration: [
        {
          id: 1,
          name: 'A',
          values: [
            { id: '1', name: 'x' },
            { id: '2', name: 'y' },
          ],
        },
        { id: 2, name: 'B', values: [{ id: '3', name: 'z' }] },
      ],
    });
    let basketCalls = 0;
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/products/PLN/')) {
        return okResponse(detailBelow);
      }
      basketCalls += 1;
      return okResponse(addEmpty);
    });
    vi.stubGlobal('fetch', fetchMock);
    await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    expect(basketCalls).toBe(3);
    expect(capture.records.some((record) => record.message === 'basketreveal.option explosion')).toBe(false);
  });

  it('expands a variant product with a unique per-product id', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(addEmpty))
        .mockResolvedValueOnce(okResponse(detailJson))
        .mockResolvedValueOnce(okResponse(addOk, 'Shop5=abc'))
        .mockResolvedValueOnce(okResponse(putOk))
    );
    const variants = await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.id).toBe('31-Rozmiar: XL');
    expect(variants[0]?.title).toBe('Rozmiar: XL');
    expect(variants[0]?.quantity).toBe(7);
  });

  it('keeps ids distinct across products with the same option label', async () => {
    const capture = capturingLogger();
    const otherProduct: Product = { ...variantProduct, id: '32' };
    const bodies = [addEmpty, detailJson, addOk, putOk];
    const cookies = [null, null, 'Shop5=abc', null];
    let callIndex = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      const index = callIndex % bodies.length;
      callIndex += 1;
      const body = bodies[index];
      const cookie = cookies[index];
      return okResponse(body === undefined ? '' : body, cookie === undefined ? null : cookie);
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    const second = await revealProduct('sklepskolim.pl', otherProduct, capture.logger);
    expect(first[0]?.id).toBe('31-Rozmiar: XL');
    expect(second[0]?.id).toBe('32-Rozmiar: XL');
    expect(first[0]?.id).not.toBe(second[0]?.id);
  });

  it('keeps the base variant masked and logs when the detail fetch fails', async () => {
    const capture = capturingLogger();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(addEmpty))
      .mockRejectedValueOnce(new Error('detail network down'));
    vi.stubGlobal('fetch', fetchMock);
    const variants = await revealProduct('sklepskolim.pl', variantProduct, capture.logger);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.id).toBe('39');
    expect(variants[0]?.quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'basketreveal.product detail error')).toBe(true);
  });

  it('returns quantity 0 for a not buyable product without probing', async () => {
    const capture = capturingLogger();
    const notBuyable: Product = {
      ...variantProduct,
      variants: [{ ...variantProduct.variants[0]!, available: false, quantity: 0 }],
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const variants = await revealProduct('sklepskolim.pl', notBuyable, capture.logger);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.quantity).toBe(0);
    expect(variants[0]?.available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchShoperCatalog', () => {
  function listProduct(id: number) {
    return {
      id,
      stockId: id + 1000,
      name: `P${id}`,
      url: `https://sklepskolim.pl/pl/p/p${id}/${id}`,
      can_buy: true,
      price: { gross: { base_float: 10, final_float: 10 } },
    };
  }

  it('paginates with limit and offset until the list is empty', async () => {
    const capture = capturingLogger();
    const requested: string[] = [];
    const fetchFn = vi.fn(async (url: unknown) => {
      requested.push(String(url));
      const str = String(url);
      const offset = /offset=(\d+)/.exec(str);
      const off = offset === null ? 0 : Number(offset[1]);
      if (off === 0) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
          json: async () => ({ list: [listProduct(1), listProduct(2)] }),
        };
      }
      if (off === 2) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
          json: async () => ({ list: [listProduct(3)] }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({ list: [] }),
      };
    });
    const catalog = await fetchShoperCatalog(
      'https://sklepskolim.pl/webapi/front/pl_PL/products/PLN/list',
      'sklepskolim.pl',
      capture.logger,
      fetchFn
    );
    expect(catalog.products).toHaveLength(3);
    expect(requested[0]).toContain('limit=50&offset=0');
    expect(requested[1]).toContain('limit=50&offset=2');
    expect(requested[2]).toContain('limit=50&offset=3');
  });

  it('dedupes repeated products across pages', async () => {
    const capture = capturingLogger();
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
          json: async () => ({ list: [listProduct(1), listProduct(1)] }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({ list: [] }),
      };
    });
    const catalog = await fetchShoperCatalog(
      'https://sklepskolim.pl/webapi/front/pl_PL/products/PLN/list',
      'sklepskolim.pl',
      capture.logger,
      fetchFn
    );
    expect(catalog.products).toHaveLength(1);
  });
});

describe('extractCookiesFromResponse', () => {
  it('joins every set-cookie value when getSetCookie is available', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'basket=1; path=/');
    headers.append('set-cookie', 'Shop5=b9qhi3lasdkvfjhr17a9l6gl; path=/');
    expect(extractCookiesFromResponse(headers)).toBe('basket=1; Shop5=b9qhi3lasdkvfjhr17a9l6gl');
  });

  it('falls back to the first set-cookie header', () => {
    const headers = new Headers();
    headers.set('set-cookie', 'basket=1; path=/');
    expect(extractCookiesFromResponse(headers)).toBe('basket=1');
  });

  it('returns null when no cookie is set', () => {
    expect(extractCookiesFromResponse(new Headers())).toBeNull();
  });
});

describe('parseBasketWarning', () => {
  it('reads the exact quantity from the warning', () => {
    const warning =
      'Ilość produktów w koszyku przekracza dostępny stan magazynowy. <br /> Aktualnie dostępna ilość to: Kubek SKOLIM Wyglądasz Idealnie- granatowy - 13 szt. .';
    expect(parseBasketWarning(warning)).toBe(13);
  });

  it('reads the exact quantity from the English warning', () => {
    const warning =
      'Number of products in cart exceeds the stock. <br /> Current stock is: SALLY 4 czarna skórzana torebka - 7 szt. .';
    expect(parseBasketWarning(warning)).toBe(7);
  });

  it('returns null for a generic warning without a number', () => {
    expect(parseBasketWarning('Ilość produktów w koszyku przekracza dostępny stan magazynowy.')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseBasketWarning('')).toBeNull();
  });
});

describe('parseShoperPages', () => {
  it('reads the total page count', () => {
    expect(parseShoperPages({ list: [], count: 200, pages: 20 })).toBe(20);
  });

  it('returns null when pages is missing', () => {
    expect(parseShoperPages({ list: [] })).toBeNull();
    expect(parseShoperPages(null)).toBeNull();
  });
});

describe('parseShoperList', () => {
  const LIST = {
    list: [
      {
        id: 35,
        stockId: 43,
        name: 'Bluza SKOLIM',
        url: 'https://sklepskolim.pl/pl/p/bluza/35',
        can_buy: true,
        price: { gross: { base_float: 200, final_float: 179 } },
      },
      {
        id: 36,
        stockId: 44,
        name: 'Kubek SKOLIM',
        url: 'https://sklepskolim.pl/pl/p/kubek/36',
        can_buy: false,
        price: { gross: { base_float: 40, final_float: 40 } },
      },
    ],
  };

  it('maps products and their stock variants', () => {
    const products = parseShoperList(LIST, DOMAIN);
    expect(products).toHaveLength(2);
    const bluza = products[0];
    expect(bluza?.id).toBe('35');
    expect(bluza?.title).toBe('Bluza SKOLIM');
    const variant = bluza?.variants[0];
    expect(variant?.id).toBe('43');
    expect(variant?.available).toBe(true);
    expect(variant?.quantity).toBeNull();
    expect(variant?.price.amount).toBe(179);
    expect(variant?.regularPrice?.amount).toBe(200);
  });

  it('maps a can_buy false product to quantity 0', () => {
    const kubek = parseShoperList(LIST, DOMAIN)[1];
    expect(kubek?.variants[0]?.available).toBe(false);
    expect(kubek?.variants[0]?.quantity).toBe(0);
    expect(kubek?.variants[0]?.regularPrice).toBeNull();
    expect(kubek?.variants[0]?.price.amount).toBe(40);
  });

  it('returns an empty array for invalid payloads', () => {
    expect(parseShoperList(null, DOMAIN)).toEqual([]);
    expect(parseShoperList({ noList: true }, DOMAIN)).toEqual([]);
    expect(parseShoperList('nope', DOMAIN)).toEqual([]);
  });

  it('skips malformed products', () => {
    const products = parseShoperList({ list: [null, 'bad', { id: 1 }] }, DOMAIN);
    expect(products).toEqual([]);
  });
});

describe('buildBasketRevealProvider exclusion', () => {
  const excludedCfg = {
    id: 'test-shop',
    domain: 'test.pl',
    platform: 'shoper' as const,
    schedule: '* * * * *',
    window: 'both' as const,
    mode: 'vps-mutation' as const,
    stockSource: 'basket-reveal' as const,
    ratePerSecond: 1,
    durationSeconds: 60,
    requiresProxy: true,
    endpoint: 'https://test.pl/webapi/front/pl_PL/products/PLN/list',
    excludedStockIds: [5054],
    enabled: true,
  };

  function okResponse(body: string) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => body,
      arrayBuffer: async () => Buffer.from(body).buffer as ArrayBuffer,
      json: async () => JSON.parse(body),
    };
  }

  it('skips the excluded stock ids during the reveal', async () => {
    const capture = capturingLogger();
    const catalogBody = JSON.stringify({
      pages: 1,
      list: [
        {
          id: 1,
          stockId: 5054,
          name: 'ETUI',
          url: 'https://test.pl/p/etui',
          can_buy: true,
          price: { gross: { final_float: 10, base_float: 10 } },
        },
        {
          id: 2,
          stockId: 999,
          name: 'KOSZULKA',
          url: 'https://test.pl/p/koszulka',
          can_buy: true,
          price: { gross: { final_float: 20, base_float: 20 } },
        },
      ],
    });
    const addBody =
      '{"added":[{"id":1}],"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Koszulka - 5 szt. ."],"error":[]}}';
    undiciFetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/products/PLN/list')) {
        return okResponse(catalogBody);
      }
      return okResponse(addBody);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('/products/PLN/list')) {
          return okResponse(catalogBody);
        }
        throw new Error('unexpected direct url ' + u);
      })
    );
    const provider = buildBasketRevealProvider(excludedCfg, capture.logger);
    const result = await provider.revealStock({ productIds: [] });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe('2');
    expect(capture.records.some((record) => record.message === 'basketreveal.excluded')).toBe(true);
  });
});

describe('isEmptyAddResponse', () => {
  it('returns true for an empty add response', () => {
    expect(isEmptyAddResponse('{"added":[],"basket":{"count":0}}')).toBe(true);
  });

  it('returns false when an item was added', () => {
    expect(isEmptyAddResponse('{"added":[{"id":1}]}')).toBe(false);
  });

  it('returns false when a warning is present', () => {
    expect(isEmptyAddResponse('{"added":[],"_flash_messenger":{"warning":["Current stock is: X - 3 szt."]}}')).toBe(
      false
    );
  });

  it('returns false for a challenge page', () => {
    expect(isEmptyAddResponse('<title>Verifying your connection...</title>')).toBe(false);
  });
});

describe('revealVariant retry', () => {
  function okResponse(body: string): {
    ok: boolean;
    status: number;
    headers: { get: () => string | null };
    text: () => Promise<string>;
  } {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => body,
    };
  }

  it('retries an empty add and succeeds on the second attempt', async () => {
    undiciFetchMock.mockReset();
    const capture = capturingLogger();
    undiciFetchMock
      .mockResolvedValueOnce(okResponse('{"added":[],"basket":{"count":0}}', 'cart=1'))
      .mockResolvedValueOnce(
        okResponse('{"added":[{"id":9}],"_flash_messenger":{"warning":["Current stock is: X - 5 szt."]}}', 'cart=1')
      );
    const outcome = await revealVariant('wkdzik.pl', 999, capture.logger, {}, undiciFetchMock);
    expect(outcome).toEqual({ quantity: 5, hasOptions: false });
    expect(capture.records.some((record) => record.message === 'basketreveal.add empty retry')).toBe(true);
    expect(undiciFetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns masked after all retries stay empty', async () => {
    undiciFetchMock.mockReset();
    const capture = capturingLogger();
    undiciFetchMock.mockResolvedValue(okResponse('{"added":[],"basket":{"count":0}}', 'cart=1'));
    const outcome = await revealVariant('wkdzik.pl', 999, capture.logger, {}, undiciFetchMock);
    expect(outcome.quantity).toBeNull();
    expect(undiciFetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a network error and succeeds on the next attempt', async () => {
    undiciFetchMock.mockReset();
    const capture = capturingLogger();
    undiciFetchMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(
        okResponse('{"added":[{"id":7}],"_flash_messenger":{"warning":["Current stock is: X - 9 szt."]}}', 'cart=1')
      );
    const outcome = await revealVariant('wkdzik.pl', 999, capture.logger, {}, undiciFetchMock);
    expect(outcome).toEqual({ quantity: 9, hasOptions: false });
    expect(capture.records.some((record) => record.message === 'basketreveal.add network retry')).toBe(true);
    expect(undiciFetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns masked when the network keeps failing', async () => {
    undiciFetchMock.mockReset();
    const capture = capturingLogger();
    undiciFetchMock.mockRejectedValue(new Error('fetch failed'));
    const outcome = await revealVariant('wkdzik.pl', 999, capture.logger, {}, undiciFetchMock);
    expect(outcome.quantity).toBeNull();
    expect(undiciFetchMock).toHaveBeenCalledTimes(3);
    expect(capture.records.some((record) => record.message === 'basketreveal.add network retry')).toBe(true);
  });
});
