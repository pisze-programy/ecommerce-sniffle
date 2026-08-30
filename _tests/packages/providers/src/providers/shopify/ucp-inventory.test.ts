import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import type { Product, ProviderConfig, Variant } from '../../../../../../packages/providers/src/types.ts';
import {
  parseUcpCart,
  probeBatch,
  probeBatchResolved,
  buildUcpInventoryProvider,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/ucp-inventory.ts';

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

function ucpBody(
  lineItems: Array<{ id: string; quantity: number }>,
  messages: Array<{ code: string; content?: string }> = []
): string {
  const inner = JSON.stringify({
    line_items: lineItems.map((item) => ({ item: { id: item.id }, quantity: item.quantity })),
    messages,
  });
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: inner }], isError: false },
  });
}

function ucpError(message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32001, message } });
}

const CATALOG = JSON.stringify({
  products: [
    {
      id: 1,
      handle: 'alpha',
      title: 'Alpha',
      variants: [{ id: 101, title: 'Default Title', price: '10.00', available: true }],
    },
    {
      id: 2,
      handle: 'beta',
      title: 'Beta',
      variants: [
        { id: 201, title: 'Small', price: '20.00', available: true },
        { id: 202, title: 'Large', price: '20.00', available: true },
      ],
    },
    {
      id: 3,
      handle: 'gamma',
      title: 'Gamma',
      variants: [{ id: 301, title: 'Default Title', price: '30.00', available: false }],
    },
  ],
});

const CFG: ProviderConfig = {
  id: 'test',
  domain: 'test.com',
  platform: 'shopify',
  schedule: '0 2 * * *',
  window: 'both',
  mode: 'vps-mutation',
  stockSource: 'ucp-inventory',
  ratePerSecond: 1,
  durationSeconds: 30,
  requiresProxy: true,
  endpoint: 'https://test.com/products.json',
  enabled: true,
};

function variantOf(product: Product | undefined, index: number): Variant {
  if (product === undefined) {
    throw new Error('product missing');
  }
  const variant = product.variants[index];
  if (variant === undefined) {
    throw new Error('variant missing');
  }
  return variant;
}

function gid(id: string): string {
  return `gid://shopify/ProductVariant/${id}`;
}

describe('parseUcpCart', () => {
  it('reads the clamped quantity from the line items', () => {
    const result = parseUcpCart(ucpBody([{ id: gid('101'), quantity: 20 }]));
    expect(result.failed).toBe(false);
    expect(result.quantities.get(gid('101'))).toBe(20);
    expect(result.outOfStockMessages).toBe(0);
    expect(result.invalid).toBe(false);
  });

  it('counts the out-of-stock messages', () => {
    const result = parseUcpCart(ucpBody([], [{ code: 'merchandise_out_of_stock', content: 'Produkt Gamma' }]));
    expect(result.failed).toBe(false);
    expect(result.outOfStockMessages).toBe(1);
  });

  it('flags an invalid batch', () => {
    const result = parseUcpCart(ucpBody([], [{ code: 'invalid', content: 'too many lines' }]));
    expect(result.invalid).toBe(true);
  });

  it('fails on a json-rpc error', () => {
    const result = parseUcpCart(ucpError('UCP discovery failed'));
    expect(result.failed).toBe(true);
  });

  it('fails on an unreadable body', () => {
    expect(parseUcpCart('not json').failed).toBe(true);
  });
});

describe('probeBatch', () => {
  const entry = (id: string): NonNullable<Parameters<typeof probeBatch>[1][number]> => ({
    product: { id, title: id, url: 'https://test.com/p', variants: [] },
    variant: {
      id,
      title: id,
      sku: null,
      price: { amount: 1, currency: 'PLN' },
      regularPrice: null,
      available: true,
      quantity: null,
    },
    title: id,
  });

  it('posts a ucp create_cart with the profile and the gzip header', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const params = body['params'] as Record<string, unknown>;
      const args = params['arguments'] as Record<string, unknown>;
      const cart = args['cart'] as Record<string, unknown>;
      const lines = cart['line_items'] as Array<Record<string, unknown>>;
      const meta = args['meta'] as Record<string, unknown>;
      const profile = ((meta['ucp-agent'] as Record<string, unknown>)['profile'] ?? '') as string;
      expect(profile).toContain('ucp/agent-profile.json');
      expect(lines[0]).toEqual({ item: { id: gid('101') }, quantity: 999999 });
      expect(String(init?.body)).toContain('create_cart');
      return okResponse(ucpBody([{ id: gid('101'), quantity: 20 }]));
    });
    const outcome = await probeBatch('test.com', [entry('101')], capture.logger, fetchMock);
    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toContain('/api/ucp/mcp');
    const headers = (call?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers?.['Accept-Encoding']).toBe('gzip');
    expect(outcome.ok).toBe(true);
    expect(outcome.resolved.get('101')).toBe(20);
    expect(capture.records).toHaveLength(0);
  });

  it('resolves a missing variant to 0 when the out-of-stock count matches', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async () =>
      okResponse(ucpBody([{ id: gid('101'), quantity: 10 }], [{ code: 'merchandise_out_of_stock' }]))
    );
    const outcome = await probeBatch('test.com', [entry('101'), entry('202')], capture.logger, fetchMock);
    expect(outcome.ok).toBe(true);
    expect(outcome.resolved.get('101')).toBe(10);
    expect(outcome.resolved.get('202')).toBe(0);
    expect(outcome.unresolved).toHaveLength(0);
  });

  it('leaves a missing variant unresolved when the counts do not match', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async () => okResponse(ucpBody([{ id: gid('101'), quantity: 10 }], [])));
    const outcome = await probeBatch('test.com', [entry('101'), entry('202')], capture.logger, fetchMock);
    expect(outcome.resolved.get('101')).toBe(10);
    expect(outcome.unresolved).toEqual(['202']);
  });

  it('flags a no-cap variant that accepts the full quantity', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async () => okResponse(ucpBody([{ id: gid('101'), quantity: 999999 }])));
    const outcome = await probeBatch('test.com', [entry('101')], capture.logger, fetchMock);
    expect(outcome.noCap).toEqual(['101']);
    expect(outcome.resolved.get('101')).toBeUndefined();
  });

  it('reports an invalid batch without resolving anything', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async () => okResponse(ucpBody([], [{ code: 'invalid' }])));
    const outcome = await probeBatch('test.com', [entry('101')], capture.logger, fetchMock);
    expect(outcome.ok).toBe(true);
    expect(outcome.invalid).toBe(true);
  });

  it('fails cleanly on a network error', async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const outcome = await probeBatch('test.com', [entry('101')], capture.logger, fetchMock);
    expect(outcome.ok).toBe(false);
    expect(capture.records.some((record) => record.message === 'ucp-inventory.probe failed')).toBe(true);
  });
});

describe('probeBatchResolved', () => {
  const entry = (id: string): NonNullable<Parameters<typeof probeBatch>[1][number]> => ({
    product: { id, title: id, url: 'https://test.com/p', variants: [] },
    variant: {
      id,
      title: id,
      sku: null,
      price: { amount: 1, currency: 'PLN' },
      regularPrice: null,
      available: true,
      quantity: null,
    },
    title: id,
  });

  it('splits an invalid batch and resolves both halves', async () => {
    const capture = capturingLogger();
    let calls = 0;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const params = body['params'] as Record<string, unknown>;
      const args = params['arguments'] as Record<string, unknown>;
      const cart = args['cart'] as Record<string, unknown>;
      const lines = cart['line_items'] as Array<Record<string, unknown>>;
      if (calls === 1) {
        // The full batch is rejected as too large.
        return okResponse(ucpBody([], [{ code: 'invalid' }]));
      }
      const quantities = lines.map((line) => {
        const id =
          String((line['item'] as Record<string, unknown>)['id'] ?? '')
            .split('/')
            .pop() ?? '';
        return { id: gid(id), quantity: Number(id) };
      });
      return okResponse(ucpBody(quantities));
    });
    const outcome = await probeBatchResolved('test.com', [entry('101'), entry('202')], capture.logger, fetchMock);
    expect(outcome.ok).toBe(true);
    expect(outcome.invalid).toBe(false);
    expect(outcome.resolved.get('101')).toBe(101);
    expect(outcome.resolved.get('202')).toBe(202);
  });
});

function stubUcpServer(handler: (body: Record<string, unknown>) => string, catalogBody: string = CATALOG): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/ucp/mcp')) {
        return okResponse(handler(JSON.parse(String(init?.body))));
      }
      if (url.includes('products.json')) {
        return okResponse(catalogBody);
      }
      throw new Error(`unexpected url ${url}`);
    })
  );
}

function readLineItems(body: Record<string, unknown>): string[] {
  const params = body['params'] as Record<string, unknown>;
  const args = params['arguments'] as Record<string, unknown>;
  const cart = args['cart'] as Record<string, unknown>;
  const lines = (cart['line_items'] ?? []) as Array<Record<string, unknown>>;
  return lines.map(
    (line) =>
      String((line['item'] as Record<string, unknown>)['id'] ?? '')
        .split('/')
        .pop() ?? ''
  );
}

describe('buildUcpInventoryProvider', () => {
  it('reveals the exact stock for every buyable variant', async () => {
    const capture = capturingLogger();
    const counts = new Map<string, number>([
      ['101', 20],
      ['201', 5],
      ['202', 3],
    ]);
    stubUcpServer((body) => {
      const ids = readLineItems(body);
      return ucpBody(
        ids.map((id) => {
          const count = counts.get(id);
          return { id: gid(id), quantity: count === undefined ? 0 : count };
        })
      );
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(variantOf(catalog.products[0], 0).quantity).toBe(20);
    expect(variantOf(catalog.products[1], 0).quantity).toBe(5);
    expect(variantOf(catalog.products[1], 1).quantity).toBe(3);
    expect(variantOf(catalog.products[2], 0).quantity).toBe(0);
  });

  it('marks a sold-out variant as 0 via the out-of-stock message', async () => {
    const capture = capturingLogger();
    stubUcpServer((body) => {
      const ids = readLineItems(body);
      const inStock = ids.filter((id) => id !== '202');
      const messages = ids.includes('202') ? [{ code: 'merchandise_out_of_stock', content: 'x' }] : [];
      return ucpBody(
        inStock.map((id) => ({ id: gid(id), quantity: Number(id) })),
        messages
      );
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(variantOf(catalog.products[1], 1).quantity).toBe(0);
  });

  it('falls back to the available flag for a no-cap variant', async () => {
    const capture = capturingLogger();
    stubUcpServer((body) => {
      const ids = readLineItems(body);
      return ucpBody(ids.map((id) => ({ id: gid(id), quantity: id === '202' ? 999999 : Number(id) })));
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(variantOf(catalog.products[1], 1).quantity).toBe(1);
    expect(capture.records.some((record) => record.message === 'ucp-inventory.no cap')).toBe(true);
  });

  it('ignores an auto-gift line that is not part of the batch', async () => {
    const capture = capturingLogger();
    stubUcpServer((body) => {
      const ids = readLineItems(body);
      const lines = ids.map((id) => ({ id: gid(id), quantity: Number(id) }));
      // The shop injects a gift variant that we never probed.
      lines.push({ id: gid('999'), quantity: 1 });
      return ucpBody(lines);
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(variantOf(catalog.products[0], 0).quantity).toBe(101);
    expect(variantOf(catalog.products[1], 0).quantity).toBe(201);
  });

  it('keeps a variant masked when the probe fails on every attempt', async () => {
    const capture = capturingLogger();
    stubUcpServer(() => {
      throw new Error('network down');
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    expect(variantOf(catalog.products[0], 0).quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'ucp-inventory.probe failed')).toBe(true);
    expect(capture.records.some((record) => record.message === 'ucp-inventory.unresolved')).toBe(true);
  });

  it('filters the catalog to the requested product ids', async () => {
    const capture = capturingLogger();
    stubUcpServer((body) => {
      const ids = readLineItems(body);
      return ucpBody(ids.map((id) => ({ id: gid(id), quantity: 9 })));
    });
    const provider = buildUcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: ['1'] });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.id).toBe('1');
    expect(variantOf(catalog.products[0], 0).quantity).toBe(9);
  });
});
