import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import { wasalaaModule } from '../../../../../../packages/providers/src/providers/shopify/wasalaa.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    body: null,
  };
}

function statusResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => '',
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
    body: null,
  };
}

const CATALOG = JSON.stringify({
  products: [
    {
      id: 1,
      handle: 'n-13',
      title: 'N*13',
      variants: [
        { id: 101, title: 'grafit / S', price: '550.00', available: true },
        { id: 102, title: 'grafit / L', price: '550.00', available: false },
      ],
    },
  ],
});

function ucpBody(lineItems: Array<{ id: string; quantity: number }>): string {
  const inner = JSON.stringify({
    line_items: lineItems.map((item) => ({ item: { id: item.id }, quantity: item.quantity })),
    messages: [],
  });
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: inner }], isError: false },
  });
}

function gid(id: string): string {
  return `gid://shopify/ProductVariant/${id}`;
}

function capturingLogger(): { records: LogRecord[]; logger: Logger } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

describe('wasalaaModule config', () => {
  it('reads the catalog from the headless origin and probes UCP on the domain', () => {
    expect(wasalaaModule.config.id).toBe('wasalaa');
    expect(wasalaaModule.config.domain).toBe('wasalaa.com');
    expect(wasalaaModule.config.platform).toBe('shopify');
    expect(wasalaaModule.config.mode).toBe('vps-mutation');
    expect(wasalaaModule.config.stockSource).toBe('ucp-inventory');
    expect(wasalaaModule.config.endpoint).toBe('https://wasalaa.myshopify.com/products.json');
    expect(wasalaaModule.config.requiresProxy).toBe(true);
    expect(wasalaaModule.config.entityId).toBe('wasalaa');
    expect(wasalaaModule.config.enabled).toBe(true);
    expect(wasalaaModule.config.currency).toBe('PLN');
  });
});

describe('wasalaaModule revealStock', () => {
  it('reveals the exact count from the UCP clamp', async () => {
    const { logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('wasalaa.myshopify.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('wasalaa.com/api/ucp/mcp')) {
          return okResponse(ucpBody([{ id: gid('101'), quantity: 3 }]));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = wasalaaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(3);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
    expect(catalog.products[0]?.variants[1]?.available).toBe(false);
  });

  it('resolves a no-cap response with the availability flag', async () => {
    const { logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('wasalaa.myshopify.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('wasalaa.com/api/ucp/mcp')) {
          return okResponse(ucpBody([{ id: gid('101'), quantity: 999999 }]));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = wasalaaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(1);
  });

  it('logs the failure and keeps the quantity null when UCP is down', async () => {
    const { records, logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('wasalaa.myshopify.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('wasalaa.com/api/ucp/mcp')) {
          return statusResponse(500);
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = wasalaaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'ucp-inventory.http error')).toBe(true);
  });
});
