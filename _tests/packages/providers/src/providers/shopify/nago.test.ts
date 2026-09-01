import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import { nagoModule } from '../../../../../../packages/providers/src/providers/shopify/nago.ts';

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

const CATALOG = JSON.stringify({
  products: [
    {
      id: 1,
      handle: 'longsleeve',
      title: 'Longsleeve',
      variants: [
        { id: 100, title: 'S', price: '100', compare_at_price: null, available: true, inventory_quantity: null },
        { id: 200, title: 'M', price: '100', compare_at_price: null, available: true, inventory_quantity: null },
      ],
    },
  ],
});

function readVariantIds(body: string): string[] {
  const data = JSON.parse(body) as Readonly<Record<string, unknown>>;
  const params = data['params'] as Readonly<Record<string, unknown>>;
  const args = params['arguments'] as Readonly<Record<string, unknown>>;
  const cart = args['cart'] as Readonly<Record<string, unknown>>;
  const lines = (cart['line_items'] ?? []) as Array<Readonly<Record<string, unknown>>>;
  return lines.map(
    (line) =>
      String((line['item'] as Readonly<Record<string, unknown>>)['id'] ?? '')
        .split('/')
        .pop() ?? ''
  );
}

describe('nagoModule', () => {
  it('reveals exact stock through the ucp clamp', async () => {
    const logger = createLogger(() => {});
    const quantities = new Map<string, number>([
      ['100', 8],
      ['200', 13],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/api/ucp/mcp')) {
          const ids = readVariantIds(String(init?.body));
          return okResponse(
            ucpBody(ids.map((id) => ({ id: `gid://shopify/ProductVariant/${id}`, quantity: quantities.get(id) ?? 0 })))
          );
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = nagoModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(8);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(13);
    expect(catalog.products[0]?.variants[1]?.available).toBe(true);
  });

  it('marks a variant as no cap when the shop accepts the huge quantity', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('products.json')) {
          return okResponse(CATALOG);
        }
        if (u.includes('/api/ucp/mcp')) {
          const ids = readVariantIds(String(init?.body));
          return okResponse(
            ucpBody(
              ids.map((id) => ({
                id: `gid://shopify/ProductVariant/${id}`,
                quantity: id === '200' ? 999999 : 8,
              }))
            )
          );
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = nagoModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    // Variant M (200) accepted the huge quantity -> no cap -> available flag 1.
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(8);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(1);
  });
});
