import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import { ooponkaModule } from '../../../../../../packages/providers/src/providers/shopify/ooponka.ts';

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
      handle: 'ooponka-mydlo',
      title: 'Ooponka Mydło',
      variants: [
        { id: 101, title: 'Default Title', price: '39.00', available: true },
        { id: 102, title: 'Duże', price: '59.00', available: false },
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

describe('ooponkaModule config', () => {
  it('reads the catalog and probes UCP on the domain', () => {
    expect(ooponkaModule.config.id).toBe('ooponka');
    expect(ooponkaModule.config.domain).toBe('ooponka.com');
    expect(ooponkaModule.config.platform).toBe('shopify');
    expect(ooponkaModule.config.mode).toBe('vps-mutation');
    expect(ooponkaModule.config.stockSource).toBe('ucp-inventory');
    expect(ooponkaModule.config.endpoint).toBe('https://ooponka.com/products.json');
    expect(ooponkaModule.config.requiresProxy).toBe(true);
    expect(ooponkaModule.config.entityId).toBe('ooponka');
    expect(ooponkaModule.config.enabled).toBe(true);
    expect(ooponkaModule.config.currency).toBe('PLN');
  });
});

describe('ooponkaModule revealStock', () => {
  it('reveals the exact count from the UCP clamp', async () => {
    const { logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('ooponka.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('ooponka.com/api/ucp/mcp')) {
          return okResponse(ucpBody([{ id: gid('101'), quantity: 6 }]));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = ooponkaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(6);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
    expect(catalog.products[0]?.variants[1]?.available).toBe(false);
  });

  it('resolves a no-cap response with the availability flag', async () => {
    const { logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('ooponka.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('ooponka.com/api/ucp/mcp')) {
          return okResponse(ucpBody([{ id: gid('101'), quantity: 999999 }]));
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = ooponkaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(1);
  });

  it('logs the failure and keeps the quantity null when UCP is down', async () => {
    const { records, logger } = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('ooponka.com/products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('ooponka.com/api/ucp/mcp')) {
          return statusResponse(500);
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = ooponkaModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
    expect(records.some((record) => record.message === 'ucp-inventory.http error')).toBe(true);
  });
});
