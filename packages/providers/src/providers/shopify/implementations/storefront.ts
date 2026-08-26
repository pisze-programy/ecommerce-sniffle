import { buildProvider } from '../../../factory.ts';
import { BROWSER_HEADERS } from '../../../browser-headers.ts';
import type { DirectFetch, DirectFetchOptions } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Money, Product, Provider, ProviderConfig, Variant } from '../../../types.ts';

const GRAPHQL_API_VERSION = '2024-07';
const TOKEN_ABORT_BYTES = 200_000;
const PAGE_SIZE = 250;

export function parseStorefrontToken(html: string): string | null {
  const single = /"storefrontAccessToken"\s*:\s*"([^"]+)"/.exec(html);
  if (single !== null && single[1] !== undefined) {
    return single[1];
  }
  const map = /storefrontAccessTokens\s*=\s*(\{[^}]+\})/.exec(html);
  if (map !== null && map[1] !== undefined) {
    try {
      const tokens = JSON.parse(map[1]) as Readonly<Record<string, unknown>>;
      for (const value of Object.values(tokens)) {
        if (typeof value === 'string') {
          return value;
        }
      }
    } catch {
      // ignore invalid json
    }
  }
  return null;
}

export function parseVariantId(gid: string): string {
  const match = /ProductVariant\/(\d+)/.exec(gid);
  return match !== null ? (match[1] ?? gid) : gid;
}

interface GraphQLVariant {
  readonly id: string;
  readonly quantityAvailable: number;
  readonly price: number;
  readonly currency: string;
}

interface GraphQLProduct {
  readonly title: string;
  readonly handle: string;
  readonly variants: readonly GraphQLVariant[];
}

export function parseGraphQLCatalog(payload: unknown): readonly GraphQLProduct[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const data = (payload as Readonly<Record<string, unknown>>)['data'];
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const products = (data as Readonly<Record<string, unknown>>)['products'];
  if (typeof products !== 'object' || products === null) {
    return [];
  }
  const edges = (products as Readonly<Record<string, unknown>>)['edges'];
  if (!Array.isArray(edges)) {
    return [];
  }
  const result: GraphQLProduct[] = [];
  for (const edge of edges) {
    if (typeof edge !== 'object' || edge === null) {
      continue;
    }
    const node = (edge as Readonly<Record<string, unknown>>)['node'];
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    const title = (node as Readonly<Record<string, unknown>>)['title'];
    const handle = (node as Readonly<Record<string, unknown>>)['handle'];
    if (typeof title !== 'string' || typeof handle !== 'string') {
      continue;
    }
    const variantsNode = (node as Readonly<Record<string, unknown>>)['variants'];
    const variantEdges =
      typeof variantsNode === 'object' && variantsNode !== null
        ? (variantsNode as Readonly<Record<string, unknown>>)['edges']
        : null;
    const variants: GraphQLVariant[] = [];
    if (Array.isArray(variantEdges)) {
      for (const variantEdge of variantEdges) {
        if (typeof variantEdge !== 'object' || variantEdge === null) {
          continue;
        }
        const variantNode = (variantEdge as Readonly<Record<string, unknown>>)['node'];
        if (typeof variantNode !== 'object' || variantNode === null) {
          continue;
        }
        const id = (variantNode as Readonly<Record<string, unknown>>)['id'];
        const quantity = (variantNode as Readonly<Record<string, unknown>>)['quantityAvailable'];
        const priceNode = (variantNode as Readonly<Record<string, unknown>>)['price'];
        const priceAmount =
          typeof priceNode === 'object' && priceNode !== null
            ? (priceNode as Readonly<Record<string, unknown>>)['amount']
            : null;
        const price =
          typeof priceAmount === 'number' ? priceAmount : typeof priceAmount === 'string' ? Number(priceAmount) : 0;
        const currency =
          typeof priceNode === 'object' && priceNode !== null
            ? (priceNode as Readonly<Record<string, unknown>>)['currencyCode']
            : null;
        if (typeof id === 'string' && typeof quantity === 'number') {
          variants.push({
            id: parseVariantId(id),
            quantityAvailable: quantity,
            price,
            currency: typeof currency === 'string' ? currency : 'PLN',
          });
        }
      }
    }
    result.push({ title, handle, variants });
  }
  return result;
}

function money(amount: number, currency: string): Money {
  return { amount, currency };
}

function readEndCursor(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const data = (payload as Readonly<Record<string, unknown>>)['data'];
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const products = (data as Readonly<Record<string, unknown>>)['products'];
  if (typeof products !== 'object' || products === null) {
    return null;
  }
  const pageInfo = (products as Readonly<Record<string, unknown>>)['pageInfo'];
  if (typeof pageInfo !== 'object' || pageInfo === null) {
    return null;
  }
  const cursor = (pageInfo as Readonly<Record<string, unknown>>)['endCursor'];
  return typeof cursor === 'string' ? cursor : null;
}

type CatalogFetch = (
  url: string,
  init?: RequestInit,
  options?: DirectFetchOptions
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

async function fetchStorefrontToken(baseUrl: string, fetchFn: CatalogFetch, logger: Logger): Promise<string | null> {
  try {
    const response = await fetchFn(`${baseUrl}/`, { headers: { ...BROWSER_HEADERS } }, { maxBytes: TOKEN_ABORT_BYTES });
    const buffer = Buffer.from(await response.arrayBuffer());
    return parseStorefrontToken(buffer.toString('utf8'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('storefront.token fetch failed', { error: message });
    return null;
  }
}

export function buildStorefrontApiProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch
): Provider {
  const baseUrl = `https://${providerConfig.domain}`;
  const graphqlUrl = `${baseUrl}/api/${GRAPHQL_API_VERSION}/graphql.json`;
  const fetchFn: CatalogFetch = (url, init, options) => {
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  return buildProvider(providerConfig, logger, async (): Promise<Catalog> => {
    const token = await fetchStorefrontToken(baseUrl, fetchFn, logger);
    if (token === null) {
      throw new Error('storefront token missing');
    }
    const products: Product[] = [];
    let cursor: string | null = null;
    while (true) {
      const after = cursor === null ? '' : `, after: "${cursor}"`;
      const query =
        `{ products(first: ${PAGE_SIZE}${after}) { ` +
        `pageInfo { hasNextPage endCursor } ` +
        `edges { node { title handle variants(first: ${PAGE_SIZE}) { ` +
        `edges { node { id quantityAvailable price { amount currencyCode } } } } } } } }`;
      const response = await fetchFn(graphqlUrl, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': token,
        },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      const parsed = parseGraphQLCatalog(data);
      for (const graphQLProduct of parsed) {
        const variants: Variant[] = graphQLProduct.variants.map((variant) => ({
          id: variant.id,
          title: 'default',
          sku: null,
          price: money(variant.price, variant.currency),
          regularPrice: null,
          available: variant.quantityAvailable > 0,
          quantity: variant.quantityAvailable,
        }));
        products.push({
          id: graphQLProduct.handle,
          title: graphQLProduct.title,
          url: `${baseUrl}/products/${graphQLProduct.handle}`,
          variants,
        });
      }
      if (parsed.length < PAGE_SIZE) {
        break;
      }
      const nextCursor = readEndCursor(data);
      if (nextCursor === null) {
        break;
      }
      cursor = nextCursor;
    }
    logger.debug('storefront catalog fetched', { domain: providerConfig.domain, products: products.length });
    return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
  });
}
