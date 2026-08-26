import { buildProvider } from '../../../factory.ts';
import { measureFetch } from '../../../network/manager.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../../types.ts';
import { fetchShopifyCatalog } from './adapter.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GRAPHQL_PAGE = 250;
const VARIANTS_PER_PRODUCT = 100;

type GraphqlFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// The shop embeds the storefront access token in the page.
export function extractStorefrontAccessToken(html: string): string | null {
  const match = /"accessToken":"([a-f0-9]{32})"/.exec(html);
  return match === null ? null : (match[1] ?? null);
}

export function gidToVariantId(gid: string): string | null {
  const parts = gid.split('/');
  const last = parts.length > 0 ? parts[parts.length - 1] : undefined;
  return last === undefined || last.length === 0 ? null : last;
}

// The GraphQL query returns the per-variant availability.
// This is a read-only source. The VPS IP stays clean.
export async function fetchStorefrontAvailability(
  domain: string,
  token: string,
  fetchFn: GraphqlFetch
): Promise<Map<string, boolean>> {
  const availability = new Map<string, boolean>();
  let cursor: string | null = null;
  while (true) {
    const after = cursor === null ? '' : `, after: "${cursor}"`;
    const query =
      `{ products(first: ${GRAPHQL_PAGE}${after}) { edges { cursor node { ` +
      `variants(first: ${VARIANTS_PER_PRODUCT}) { edges { node { id availableForSale } } } ` +
      `} } pageInfo { hasNextPage } } }`;
    const response = await fetchFn(`https://${domain}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query }),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return availability;
    }
    const root = data as Readonly<Record<string, unknown>>;
    const dataObj = root['data'] as Readonly<Record<string, unknown>> | undefined;
    const productsObj = dataObj?.['products'] as Readonly<Record<string, unknown>> | undefined;
    const edges = (productsObj?.['edges'] ?? []) as ReadonlyArray<unknown>;
    for (const edge of edges) {
      const node = (edge as Readonly<Record<string, unknown>>)?.['node'] as
        Readonly<Record<string, unknown>> | undefined;
      const variantsObj = node?.['variants'] as Readonly<Record<string, unknown>> | undefined;
      const variantEdges = (variantsObj?.['edges'] ?? []) as ReadonlyArray<unknown>;
      for (const variantEdge of variantEdges) {
        const variantNode = (variantEdge as Readonly<Record<string, unknown>>)?.['node'] as
          Readonly<Record<string, unknown>> | undefined;
        const gid = variantNode?.['id'];
        const available = variantNode?.['availableForSale'];
        if (typeof gid === 'string' && typeof available === 'boolean') {
          const id = gidToVariantId(gid);
          if (id !== null) {
            availability.set(id, available);
          }
        }
      }
    }
    const pageInfo = productsObj?.['pageInfo'] as Readonly<Record<string, unknown>> | undefined;
    if (pageInfo?.['hasNextPage'] !== true) {
      break;
    }
    const last = edges.length > 0 ? (edges[edges.length - 1] as Readonly<Record<string, unknown>>) : undefined;
    const lastCursor = last?.['cursor'];
    cursor = typeof lastCursor === 'string' ? lastCursor : null;
    if (cursor === null) {
      break;
    }
  }
  return availability;
}

function applyAvailability(product: Product, availability: Map<string, boolean>): Product {
  const variants: Variant[] = product.variants.map((variant) => {
    const available = availability.get(variant.id);
    if (available === undefined) {
      return variant;
    }
    return { ...variant, quantity: available ? 1 : 0, available };
  });
  return { ...product, variants };
}

export function buildStorefrontAvailabilityProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch
): Provider {
  const rawCatalogFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const catalogFetch = measureFetch(rawCatalogFetch, logger, providerConfig.id, 'direct');
  return buildProvider(providerConfig, logger, async (): Promise<Catalog> => {
    const catalog = await fetchShopifyCatalog(providerConfig.endpoint, providerConfig.domain, logger, catalogFetch);
    const first = catalog.products[0];
    const token = first === undefined ? null : await fetchStorefrontToken(first.url, logger, catalogFetch);
    if (token === null) {
      logger.warn('storefront no token', { domain: providerConfig.domain });
      return catalog;
    }
    const availability = await fetchStorefrontAvailability(providerConfig.domain, token, catalogFetch);
    const products = catalog.products.map((product) => applyAvailability(product, availability));
    logger.debug('storefront availability fetched', {
      domain: providerConfig.domain,
      variants: catalog.products.reduce((n, p) => n + p.variants.length, 0),
    });
    return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
  });
}

async function fetchStorefrontToken(productUrl: string, logger: Logger, fetchFn: WrappedFetch): Promise<string | null> {
  try {
    const response = await fetchFn(productUrl, { headers: { 'User-Agent': USER_AGENT } });
    const html = await response.text();
    return extractStorefrontAccessToken(html);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('storefront token fetch failed', { error: message });
    return null;
  }
}
