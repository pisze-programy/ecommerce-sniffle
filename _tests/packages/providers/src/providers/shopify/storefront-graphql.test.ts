import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import {
  extractStorefrontAccessToken,
  gidToVariantId,
  fetchStorefrontAvailability,
  buildStorefrontAvailabilityProvider,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/storefront-graphql.ts';

describe('extractStorefrontAccessToken', () => {
  it('extracts the token from the shopify-features json', () => {
    const html =
      '<script id="shopify-features" type="application/json">{"accessToken":"afdf357271d8cff8936241fda0e82a84","domain":"theodderside.com"}</script>';
    expect(extractStorefrontAccessToken(html)).toBe('afdf357271d8cff8936241fda0e82a84');
  });

  it('returns null when no token exists', () => {
    expect(extractStorefrontAccessToken('<html></html>')).toBeNull();
  });
});

describe('gidToVariantId', () => {
  it('takes the last segment of a gid', () => {
    expect(gidToVariantId('gid://shopify/ProductVariant/123')).toBe('123');
  });

  it('returns null for an empty string', () => {
    expect(gidToVariantId('')).toBeNull();
  });
});

describe('fetchStorefrontAvailability', () => {
  const token = 'afdf357271d8cff8936241fda0e82a84';
  const page = JSON.stringify({
    data: {
      products: {
        edges: [
          {
            cursor: 'c1',
            node: {
              variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/111', availableForSale: true } }] },
            },
          },
        ],
        pageInfo: { hasNextPage: false },
      },
    },
  });

  it('returns the availability map keyed by the plain variant id', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => page });
    const result = await fetchStorefrontAvailability('shop.com', token, fetchFn);
    expect(result.get('111')).toBe(true);
    const call = fetchFn.mock.calls[0];
    expect(String(call?.[0])).toContain('graphql.json');
    const init = call?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string> | undefined)?.['X-Shopify-Storefront-Access-Token']).toBe(token);
  });

  it('follows the cursor while more pages exist', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    cursor: 'c1',
                    node: {
                      variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/1', availableForSale: true } }] },
                    },
                  },
                ],
                pageInfo: { hasNextPage: true },
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    cursor: 'c2',
                    node: {
                      variants: {
                        edges: [{ node: { id: 'gid://shopify/ProductVariant/2', availableForSale: false } }],
                      },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          }),
      });
    const result = await fetchStorefrontAvailability('shop.com', token, fetchFn);
    expect(result.get('1')).toBe(true);
    expect(result.get('2')).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('stops on a json parse error', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'not-json' });
    const result = await fetchStorefrontAvailability('shop.com', token, fetchFn);
    expect(result.size).toBe(0);
  });
});

describe('buildStorefrontAvailabilityProvider', () => {
  const cfg = {
    id: 'test',
    domain: 'test.com',
    platform: 'shopify' as const,
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'vps-get' as const,
    stockSource: 'storefront-availability' as const,
    ratePerSecond: 1,
    durationSeconds: 5,
    requiresProxy: false,
    endpoint: 'https://test.com/products.json',
    enabled: true,
  };

  function okResponse(body: string) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      json: async () => JSON.parse(body),
      body: null,
    };
  }

  it('applies the availability to the catalog variants', async () => {
    const logger = createLogger(() => {});
    const catalogBody = JSON.stringify({
      products: [
        { id: 1, handle: 'a', title: 'A', variants: [{ id: 111, title: 'XS', available: true }] },
        { id: 2, handle: 'b', title: 'B', variants: [{ id: 222, title: 'S', available: true }] },
      ],
    });
    const pageBody = '<script id="shopify-features">{"accessToken":"afdf357271d8cff8936241fda0e82a84"}</script>';
    const gqlBody = JSON.stringify({
      data: {
        products: {
          edges: [
            {
              node: {
                variants: {
                  edges: [
                    { node: { id: 'gid://shopify/ProductVariant/111', availableForSale: true } },
                    { node: { id: 'gid://shopify/ProductVariant/222', availableForSale: false } },
                  ],
                },
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    });
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('products.json')) return okResponse(catalogBody);
      if (u.includes('graphql.json')) return okResponse(gqlBody);
      return okResponse(pageBody);
    });
    const provider = buildStorefrontAvailabilityProvider(cfg, logger, fetchMock);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(1);
    expect(catalog.products[1]?.variants[0]?.quantity).toBe(0);
    expect(catalog.products[1]?.variants[0]?.available).toBe(false);
  });
});
