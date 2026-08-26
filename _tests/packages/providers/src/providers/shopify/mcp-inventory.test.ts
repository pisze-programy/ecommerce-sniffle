import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../../packages/providers/src/logger.ts';
import type { ProviderConfig, Product, Variant } from '../../../../../../packages/providers/src/types.ts';
import {
  buildBatches,
  buildMcpInventoryProvider,
  extractCountAndTitle,
  mcpVariantTitle,
  parseBodyJson,
  parseMcpCounts,
  toMcpGid,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/mcp-inventory.ts';

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

function mcpBody(errors: Array<Record<string, unknown>>): string {
  const inner = JSON.stringify({ errors });
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: inner }] },
  });
}

function clampMessage(count: number, title: string): string {
  return `You can only add ${count} ${title} to the cart.`;
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

const TITLES = new Map<string, string>([
  ['101', 'Alpha'],
  ['201', 'Beta - Small'],
  ['202', 'Beta - Large'],
]);

const CFG: ProviderConfig = {
  id: 'test',
  domain: 'test.com',
  platform: 'shopify',
  schedule: '0 2 * * *',
  window: 'both',
  mode: 'vps-mutation',
  stockSource: 'mcp-inventory',
  ratePerSecond: 1,
  durationSeconds: 30,
  requiresProxy: true,
  endpoint: 'https://test.com/products.json',
  enabled: true,
};

function variantOf(product: Product, index: number): Variant {
  const variant = product.variants[index];
  if (variant === undefined) {
    throw new Error('variant missing');
  }
  return variant;
}

describe('toMcpGid', () => {
  it('wraps the plain id in a shopify gid', () => {
    expect(toMcpGid('123')).toBe('gid://shopify/ProductVariant/123');
  });
});

describe('mcpVariantTitle', () => {
  const product: Product = { id: '1', title: 'Alpha', url: 'https://test.com/products/a', variants: [] };

  it('uses the product title for a default variant', () => {
    const variant: Variant = {
      id: '101',
      title: 'Default Title',
      sku: null,
      price: { amount: 10, currency: 'PLN' },
      regularPrice: null,
      available: true,
      quantity: null,
    };
    expect(mcpVariantTitle(product, variant)).toBe('Alpha');
  });

  it('appends the option value for a sized variant', () => {
    const variant: Variant = {
      id: '201',
      title: 'Small',
      sku: null,
      price: { amount: 20, currency: 'PLN' },
      regularPrice: null,
      available: true,
      quantity: null,
    };
    expect(mcpVariantTitle(product, variant)).toBe('Alpha - Small');
  });
});

describe('extractCountAndTitle', () => {
  it('reads an english clamp message', () => {
    expect(extractCountAndTitle('You can only add 2 8×10 IN | CASH SYMBOL to the cart.')).toEqual({
      count: 2,
      title: '8×10 IN | CASH SYMBOL',
    });
  });

  it('reads a polish clamp message and strips the trailing period', () => {
    expect(extractCountAndTitle('Możesz dodać do koszyka tylko 50 Bikery basic beige - S.')).toEqual({
      count: 50,
      title: 'Bikery basic beige - S',
    });
  });

  it('returns null for an unknown message', () => {
    expect(extractCountAndTitle('coś poszło nie tak')).toBeNull();
  });
});

describe('parseBodyJson', () => {
  it('parses a plain json body', () => {
    expect(parseBodyJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses the first data line of an sse body', () => {
    const body = 'data: {"a":1}\n\ndata: {"a":2}\n\n';
    expect(parseBodyJson(body)).toEqual({ a: 1 });
  });

  it('returns null for invalid json', () => {
    expect(parseBodyJson('not json')).toBeNull();
  });
});

describe('parseMcpCounts', () => {
  it('reads the clamped counts from the nested content json', () => {
    const capture = capturingLogger();
    const body = mcpBody([
      { field: ['add_items', '0', 'quantity'], message: clampMessage(2, 'Alpha') },
      { field: ['add_items', '1', 'quantity'], message: clampMessage(1, 'Beta - Small') },
    ]);
    const result = parseMcpCounts(body, capture.logger);
    expect(result.parsed).toBe(true);
    expect(result.counts).toEqual([
      { title: 'Alpha', count: 2 },
      { title: 'Beta - Small', count: 1 },
    ]);
    expect(capture.records).toHaveLength(0);
  });

  it('reads counts from an sse body', () => {
    const capture = capturingLogger();
    const body = `data: ${mcpBody([{ field: ['add_items', '0', 'quantity'], message: clampMessage(7, 'Gamma') }])}\n\n`;
    const result = parseMcpCounts(body, capture.logger);
    expect(result.parsed).toBe(true);
    expect(result.counts).toEqual([{ title: 'Gamma', count: 7 }]);
  });

  it('reports a valid response without a quantity field path as parsed', () => {
    const capture = capturingLogger();
    const body = mcpBody([{ message: 'Only 2 items were added to your cart due to availability.' }]);
    const result = parseMcpCounts(body, capture.logger);
    expect(result.parsed).toBe(true);
    expect(result.counts).toEqual([]);
  });

  it('logs a warning and reports unparsed when the outer json is invalid', () => {
    const capture = capturingLogger();
    expect(parseMcpCounts('not json at all', capture.logger)).toEqual({ parsed: false, counts: [] });
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe('warn');
    expect(capture.records[0]?.message).toBe('mcp-inventory.response parse failed');
  });

  it('logs a warning and reports unparsed when the inner content json is invalid', () => {
    const capture = capturingLogger();
    const body = JSON.stringify({ jsonrpc: '2.0', result: { content: [{ type: 'text', text: 'not json' }] } });
    expect(parseMcpCounts(body, capture.logger)).toEqual({ parsed: false, counts: [] });
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.message).toBe('mcp-inventory.inner parse failed');
  });
});

describe('buildBatches', () => {
  const entry = (title: string, id: string): NonNullable<ReturnType<typeof buildBatches>[number][number]> => ({
    product: { id, title, url: 'https://test.com/p', variants: [] },
    variant: {
      id,
      title,
      sku: null,
      price: { amount: 1, currency: 'PLN' },
      regularPrice: null,
      available: true,
      quantity: null,
    },
    title,
  });

  it('never puts the same title twice in one batch', () => {
    const entries = [entry('A', '1'), entry('B', '2'), entry('C', '3'), entry('A', '4')];
    const batches = buildBatches(entries, 10);
    for (const batch of batches) {
      const titles = batch.map((item) => item.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
    expect(batches.flat().length).toBe(4);
  });

  it('splits a long list into batches of the given size', () => {
    const entries = Array.from({ length: 25 }, (_, i) => entry(`T${i}`, String(i)));
    const batches = buildBatches(entries, 10);
    expect(batches.length).toBe(3);
    expect(batches[0]?.length).toBe(10);
    expect(batches[2]?.length).toBe(5);
  });
});

function stubCatalogOnly(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('products.json')) {
        return okResponse(CATALOG);
      }
      throw new Error('unexpected url');
    })
  );
}

describe('buildMcpInventoryProvider', () => {
  it('reveals exact stock for every buyable variant and keeps sold out at 0', async () => {
    const capture = capturingLogger();
    const counts = new Map<string, number>([
      ['101', 2],
      ['201', 1],
      ['202', 3],
    ]);
    const handler = (body: Record<string, unknown>): string => {
      const items = body['params'] as Record<string, unknown>;
      const addItems = ((items?.['arguments'] as Record<string, unknown>)?.['add_items'] ?? []) as Array<
        Record<string, string>
      >;
      const reversed = [...addItems].reverse();
      const errors: Array<Record<string, unknown>> = [];
      for (const item of reversed) {
        const vid =
          String(item['product_variant_id'] ?? '')
            .split('/')
            .pop() ?? '';
        const count = counts.get(vid);
        const title = TITLES.get(vid);
        if (count !== undefined && title !== undefined) {
          errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(count, title) });
        }
      }
      return mcpBody(errors);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/mcp')) {
          return okResponse(handler(JSON.parse(String(init?.body))));
        }
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const alpha = catalog.products[0];
    const beta = catalog.products[1];
    const gamma = catalog.products[2];
    expect(variantOf(alpha ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBe(2);
    expect(variantOf(beta ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBe(1);
    expect(variantOf(beta ?? { id: '', title: '', url: '', variants: [] }, 1).quantity).toBe(3);
    expect(variantOf(gamma ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBe(0);
    expect(variantOf(gamma ?? { id: '', title: '', url: '', variants: [] }, 0).available).toBe(false);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.no cap')).toBe(false);
  });

  it('ignores a phantom title that is not part of the batch', async () => {
    const capture = capturingLogger();
    const handler = (body: Record<string, unknown>): string => {
      const params = body['params'] as Record<string, unknown>;
      const addItems = ((params?.['arguments'] as Record<string, unknown>)?.['add_items'] ?? []) as Array<
        Record<string, string>
      >;
      const errors: Array<Record<string, unknown>> = [
        { field: ['add_items', '9', 'quantity'], message: clampMessage(7, 'PHANTOM ITEM') },
      ];
      for (const item of addItems) {
        const vid =
          String(item['product_variant_id'] ?? '')
            .split('/')
            .pop() ?? '';
        const count = new Map([['101', 2]]).get(vid);
        if (count !== undefined) {
          errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(count, 'Alpha') });
        }
      }
      return mcpBody(errors);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/mcp')) {
          return okResponse(handler(JSON.parse(String(init?.body))));
        }
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const alpha = catalog.products[0];
    expect(variantOf(alpha ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBe(2);
  });

  it('falls back to the available flag for a no-cap variant', async () => {
    const capture = capturingLogger();
    const handler = (body: Record<string, unknown>): string => {
      const params = body['params'] as Record<string, unknown>;
      const addItems = ((params?.['arguments'] as Record<string, unknown>)?.['add_items'] ?? []) as Array<
        Record<string, string>
      >;
      const errors: Array<Record<string, unknown>> = [];
      for (const item of addItems) {
        const vid =
          String(item['product_variant_id'] ?? '')
            .split('/')
            .pop() ?? '';
        if (vid === '202') {
          continue;
        }
        const count = new Map([['101', 2]]).get(vid);
        const title = TITLES.get(vid);
        if (count !== undefined && title !== undefined) {
          errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(count, title) });
        }
      }
      return mcpBody(errors);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/mcp')) {
          return okResponse(handler(JSON.parse(String(init?.body))));
        }
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const beta = catalog.products[1];
    expect(variantOf(beta ?? { id: '', title: '', url: '', variants: [] }, 1).quantity).toBe(1);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.no cap')).toBe(true);
  });

  it('keeps a variant masked when the mcp call fails on every attempt', async () => {
    const capture = capturingLogger();
    const catalogBody = JSON.stringify({
      products: [
        {
          id: 1,
          handle: 'alpha',
          title: 'Alpha',
          variants: [{ id: 101, title: 'Default Title', price: '10.00', available: true }],
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('products.json')) {
          return okResponse(catalogBody);
        }
        throw new Error('network down');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const alpha = catalog.products[0];
    expect(variantOf(alpha ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBeNull();
    expect(capture.records.some((record) => record.message === 'mcp-inventory.probe failed')).toBe(true);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.unresolved')).toBe(true);
  });

  it('sums the split clamp counts for a variant', async () => {
    const capture = capturingLogger();
    const handler = (body: Record<string, unknown>): string => {
      const params = body['params'] as Record<string, unknown>;
      const addItems = ((params?.['arguments'] as Record<string, unknown>)?.['add_items'] ?? []) as Array<
        Record<string, string>
      >;
      const errors: Array<Record<string, unknown>> = [];
      for (const item of addItems) {
        const vid =
          String(item['product_variant_id'] ?? '')
            .split('/')
            .pop() ?? '';
        const title = TITLES.get(vid);
        if (vid === '202' && title !== undefined) {
          errors.push(
            { field: ['add_items', '0', 'quantity'], message: clampMessage(3, title) },
            { field: ['add_items', '1', 'quantity'], message: clampMessage(4, title) }
          );
          continue;
        }
        const count = new Map([['101', 2]]).get(vid);
        if (count !== undefined && title !== undefined) {
          errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(count, title) });
        }
      }
      return mcpBody(errors);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/mcp')) {
          return okResponse(handler(JSON.parse(String(init?.body))));
        }
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const beta = catalog.products[1];
    expect(variantOf(beta ?? { id: '', title: '', url: '', variants: [] }, 1).quantity).toBe(7);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.ambiguous')).toBe(false);
  });

  it('retries a failed probe and resolves on the second attempt', async () => {
    const capture = capturingLogger();
    let mcpCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (url.includes('/api/mcp')) {
          mcpCalls += 1;
          if (mcpCalls === 1) {
            // The first batch probe fails. Every variant moves to the
            // individual retry path.
            throw new Error('network down');
          }
          if (mcpCalls === 2) {
            // The first individual attempt fails too.
            throw new Error('network down');
          }
          const params = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const addItems = ((params['params'] as Record<string, unknown>)['arguments'] as Record<string, unknown>)[
            'add_items'
          ] as Array<Record<string, string>>;
          const errors: Array<Record<string, unknown>> = [];
          for (const item of addItems) {
            const vid =
              String(item['product_variant_id'] ?? '')
                .split('/')
                .pop() ?? '';
            const count = new Map([
              ['101', 2],
              ['202', 5],
            ]).get(vid);
            const title = TITLES.get(vid);
            if (count !== undefined && title !== undefined) {
              errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(count, title) });
            }
          }
          return okResponse(mcpBody(errors));
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const beta = catalog.products[1];
    expect(variantOf(beta ?? { id: '', title: '', url: '', variants: [] }, 1).quantity).toBe(5);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.probe failed')).toBe(true);
    expect(capture.records.some((record) => record.message === 'mcp-inventory.retry')).toBe(true);
  });

  it('filters the catalog to the requested product ids', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/mcp')) {
          const params = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const addItems = ((params['params'] as Record<string, unknown>)['arguments'] as Record<string, unknown>)[
            'add_items'
          ] as Array<Record<string, string>>;
          const errors: Array<Record<string, unknown>> = [];
          for (const item of addItems) {
            const vid =
              String(item['product_variant_id'] ?? '')
                .split('/')
                .pop() ?? '';
            if (vid === '101') {
              errors.push({ field: ['add_items', '0', 'quantity'], message: clampMessage(9, 'Alpha') });
            }
          }
          return okResponse(mcpBody(errors));
        }
        if (url.includes('products.json')) {
          return okResponse(CATALOG);
        }
        throw new Error('unexpected url');
      })
    );
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    const catalog = await provider.revealStock({ productIds: ['1'] });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.id).toBe('1');
    expect(variantOf(catalog.products[0] ?? { id: '', title: '', url: '', variants: [] }, 0).quantity).toBe(9);
  });

  it('logs a warning when the catalog fetch fails', async () => {
    const capture = capturingLogger();
    stubCatalogOnly();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('catalog down'));
    const provider = buildMcpInventoryProvider(CFG, capture.logger);
    await expect(provider.revealStock({ productIds: [] })).rejects.toThrow('catalog down');
    expect(capture.records.some((record) => record.message === 'Provider.revealStock failed')).toBe(true);
  });
});
