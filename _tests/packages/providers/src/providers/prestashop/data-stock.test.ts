import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import {
  parseDataStock,
  parsePrestaPrice,
  refreshDataStock,
  buildPrestaShopDataStockProvider,
} from '../../../../../../packages/providers/src/providers/prestashop/data-stock.ts';

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

function detailsBlock(dataStock: string | null, outOfStock: boolean): string {
  let html = '<div class="product-quantities"><span class="label">W magazynie</span>';
  if (dataStock !== null) {
    html += `<span data-stock="${dataStock}">${dataStock} Przedmioty</span>`;
  }
  html += '</div>';
  if (outOfStock) {
    html += '<div class="product-out-of-stock"></div>';
  }
  return html;
}

function pricesBlock(price: string | null): string {
  if (price === null) {
    return '';
  }
  return `<div class="current-price-value text-right" content="${price}">${price} zł</div>`;
}

function refreshJson(dataStock: string | null, outOfStock = false, price: string | null = '119.99'): string {
  return JSON.stringify({ product_details: detailsBlock(dataStock, outOfStock), product_prices: pricesBlock(price) });
}

describe('parseDataStock', () => {
  it('reads the exact stock and the price from the product details', () => {
    const outcome = parseDataStock(refreshJson('410'));
    expect(outcome.quantity).toBe(410);
    expect(outcome.available).toBe(true);
    expect(outcome.price).toBe(119.99);
  });

  it('reads a large stock count', () => {
    const outcome = parseDataStock(refreshJson('12132'));
    expect(outcome.quantity).toBe(12132);
  });

  it('returns zero when the product is out of stock', () => {
    const outcome = parseDataStock(refreshJson(null, true));
    expect(outcome.quantity).toBe(0);
    expect(outcome.available).toBe(false);
  });

  it('returns null when the stock is absent and the product is not marked out', () => {
    const outcome = parseDataStock(refreshJson(null, false));
    expect(outcome.quantity).toBeNull();
  });

  it('returns a null price when the response has no price block', () => {
    const outcome = parseDataStock(refreshJson('410', false, null));
    expect(outcome.quantity).toBe(410);
    expect(outcome.price).toBeNull();
  });

  it('returns null when the body is not valid json', () => {
    const outcome = parseDataStock('not-json');
    expect(outcome.quantity).toBeNull();
    expect(outcome.price).toBeNull();
  });
});

describe('parsePrestaPrice', () => {
  it('reads the price from the open graph meta', () => {
    expect(
      parsePrestaPrice(
        '<meta property="product:price:amount" content="119.99"><meta property="product:price:currency" content="PLN">'
      )
    ).toBe(119.99);
  });

  it('reads the price from the json-ld block', () => {
    expect(parsePrestaPrice('{"@type":"Product","price":"165","priceCurrency":"PLN"}')).toBe(165);
  });

  it('reads the price from the current-price-value fragment', () => {
    expect(parsePrestaPrice('<div class="current-price-value text-right" content="199.00">199,00 zł</div>')).toBe(199);
  });

  it('returns null when no price marker exists', () => {
    expect(parsePrestaPrice('<html><body>no price</body></html>')).toBeNull();
  });
});

describe('refreshDataStock', () => {
  it('posts the refresh action and reads the stock', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => refreshJson('410'),
    });
    const outcome = await refreshDataStock('www.phlov.com', 'tok123', '89', fetchMock);
    expect(outcome.quantity).toBe(410);
    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toContain('id_product=89');
    expect(String(call?.[0])).toContain('token=tok123');
    expect((call?.[1] as RequestInit | undefined)?.method).toBe('POST');
    expect(String((call?.[1] as RequestInit | undefined)?.body)).toContain('action=refresh');
    expect(capture.records).toHaveLength(0);
  });

  it('returns zero for an out-of-stock product', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => refreshJson(null, true),
    });
    const outcome = await refreshDataStock('www.phlov.com', 'tok123', '89', fetchMock);
    expect(outcome.quantity).toBe(0);
  });
});

describe('buildPrestaShopDataStockProvider reveal', () => {
  const cfg = {
    id: 'phlov',
    domain: 'www.phlov.com',
    platform: 'prestashop' as const,
    schedule: '0 12 * * *',
    window: 'both' as const,
    mode: 'vps-mutation' as const,
    stockSource: 'cart-probe' as const,
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: false,
    endpoint: 'https://www.phlov.com/',
    enabled: true,
  };

  function okResponse(body: string) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      json: async () => ({}),
      body: null,
    };
  }

  it('reveals the exact stock for every product', async () => {
    const capture = capturingLogger();
    const catalogPage = '<a href="https://www.phlov.com/pielegnacja-twarzy/89-glow-cream-5907775584740.html">x</a>';
    const productPage =
      '<input type="hidden" name="token" value="tok123">' + '<input type="hidden" name="id_product" value="89">';
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/')) {
        return okResponse('<a href="/1-kategoria">cat</a>');
      }
      if (u.includes('/1-kategoria')) {
        return okResponse(catalogPage);
      }
      return okResponse('<html></html>');
    });
    undiciFetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('id_product=')) {
        return okResponse(refreshJson('410'));
      }
      return okResponse(productPage);
    });
    const provider = buildPrestaShopDataStockProvider(cfg, capture.logger, fetchMock);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(410);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
    expect(catalog.products[0]?.variants[0]?.price.amount).toBe(119.99);
  });

  it('marks an out-of-stock product as zero', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/')) {
        return okResponse('<a href="/1-kategoria">cat</a>');
      }
      if (u.includes('/1-kategoria')) {
        return okResponse('<a href="https://www.phlov.com/pielegnacja-twarzy/89-glow-cream-5907775584740.html">x</a>');
      }
      return okResponse('<html></html>');
    });
    undiciFetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('id_product=')) {
        return okResponse(refreshJson(null, true));
      }
      return okResponse('<input type="hidden" name="token" value="tok123">');
    });
    const provider = buildPrestaShopDataStockProvider(cfg, capture.logger, fetchMock);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(0);
    expect(catalog.products[0]?.variants[0]?.available).toBe(false);
  });
});
