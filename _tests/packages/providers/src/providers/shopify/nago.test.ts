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

function mcpBody(errors: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify({ errors }) }] },
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

describe('nagoModule', () => {
  it('reveals exact stock through the mcp clamp', async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) return okResponse(CATALOG);
        if (u.includes('/api/mcp')) {
          return okResponse(
            mcpBody([
              { field: ['add_items', '0', 'quantity'], message: 'Możesz dodać do koszyka tylko 8 Longsleeve - S.' },
              { field: ['add_items', '1', 'quantity'], message: 'Możesz dodać do koszyka tylko 13 Longsleeve - M.' },
            ])
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
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes('products.json')) return okResponse(CATALOG);
        if (u.includes('/api/mcp')) {
          return okResponse(
            mcpBody([
              { field: ['add_items', '0', 'quantity'], message: 'Możesz dodać do koszyka tylko 8 Longsleeve - S.' },
            ])
          );
        }
        throw new Error('unexpected url ' + u);
      })
    );
    const provider = nagoModule.build({ logger });
    const catalog = await provider.revealStock({ productIds: [] });
    // Variant M (200) got no clamp error -> no cap -> available flag 1.
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(8);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(1);
  });
});
