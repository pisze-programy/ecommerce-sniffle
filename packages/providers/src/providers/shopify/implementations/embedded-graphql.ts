// Shopify Storefront GraphQL inventory. See docs/CLAMP-BYPASS.md.
// The store grants the inventory scope to the public token in the page.
// The cart cap does not apply to the Storefront API.
// The provider reads the catalog, then one GraphQL query per 250 products.

import { buildProvider, ProviderError } from '../../../factory.ts';
import { BROWSER_HEADERS } from '../../../browser-headers.ts';
import { measureFetch } from '../../../network/manager.ts';
import { RateLimiter } from '../../../network/limiter.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../../types.ts';
import { fetchCatalogForConfig } from './adapter.ts';

// A safety net, not a product limit. 40 pages hold 10 000 products.
// A reached cap returns null. The run must never truncate in silence.
const MAX_PAGES = 40;
// Shopify retires an API version after about one year.
// Raise this value when Shopify drops the version.
const STOREFRONT_API_VERSION = '2026-07';

// The Storefront access token is 32 hex chars.
export function parseStorefrontToken(html: string): string | null {
  const match = /storefrontAccessToken\s*[=:]\s*"([a-f0-9]{32})"/i.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1].toLowerCase();
}

export function parseShopDomain(html: string): string | null {
  const match = /([a-z0-9-]+\.myshopify\.com)/i.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1].toLowerCase();
}

interface GraphqlAnswer {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: unknown }[];
}

function parseJson(text: string, logger: Logger): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('embeddedgraphql.json parse failed', { error: message, size: text.length });
    return null;
  }
}

function firstError(answer: GraphqlAnswer): string | null {
  if (answer.errors === undefined || answer.errors.length === 0) {
    return null;
  }
  const first = answer.errors[0];
  if (first === undefined || typeof first.message !== 'string' || first.message.length === 0) {
    return 'graphql error';
  }
  return first.message;
}

function variantId(gid: unknown): string | null {
  if (typeof gid !== 'string' || gid.length === 0) {
    return null;
  }
  const parts = gid.split('/');
  const id = parts[parts.length - 1];
  if (id === undefined || !/^\d+$/.test(id)) {
    return null;
  }
  return id;
}

// Reads quantityAvailable for every variant. The result is keyed by
// the plain variant id.
// The result is null when the pull did not complete. A partial map
// would store a partial snapshot. The task must fail instead.
export async function fetchStorefrontInventory(
  shop: string,
  token: string,
  logger: Logger,
  fetchFn: WrappedFetch,
  rateLimiter: RateLimiter,
  maxPages: number = MAX_PAGES
): Promise<ReadonlyMap<string, number> | null> {
  const map = new Map<string, number>();
  let cursor: string | null = null;
  let complete = false;
  let attempts = 0;
  // The counts detect a short read. A short read means an incomplete
  // pull. The pull must fail. A partial map must never reach a snapshot.
  let variantsSeen = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    attempts += 1;
    await rateLimiter.acquire();
    const query =
      'query($cursor: String) { products(first: 250, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { variants(first: 100) { nodes { id quantityAvailable } } } } }';
    const response = await fetchFn(`https://${shop}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });
    const text = await response.text();
    if (!response.ok) {
      logger.warn('embeddedgraphql.http error', { shop, status: response.status });
      break;
    }
    const parsed = parseJson(text, logger);
    if (parsed === null) {
      break;
    }
    const answer = parsed as GraphqlAnswer;
    const error = firstError(answer);
    if (error !== null) {
      logger.error('embeddedgraphql.query failed', { shop, error });
      break;
    }
    const data = answer.data;
    if (typeof data !== 'object' || data === null) {
      break;
    }
    const products = (data as Readonly<Record<string, unknown>>)['products'];
    if (typeof products !== 'object' || products === null) {
      break;
    }
    const record = products as Readonly<Record<string, unknown>>;
    const nodes = record['nodes'];
    if (!Array.isArray(nodes)) {
      logger.warn('embeddedgraphql.nodes missing', { shop, page });
      break;
    }
    let pageVariants = 0;
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) {
        continue;
      }
      const variants = (node as Readonly<Record<string, unknown>>)['variants'];
      if (typeof variants !== 'object' || variants === null) {
        continue;
      }
      const variantNodes = (variants as Readonly<Record<string, unknown>>)['nodes'];
      if (!Array.isArray(variantNodes)) {
        continue;
      }
      for (const variant of variantNodes) {
        if (typeof variant !== 'object' || variant === null) {
          continue;
        }
        const entry = variant as Readonly<Record<string, unknown>>;
        const id = variantId(entry['id']);
        const quantity = entry['quantityAvailable'];
        if (id === null || typeof quantity !== 'number' || !Number.isFinite(quantity)) {
          continue;
        }
        map.set(id, Math.trunc(quantity));
        pageVariants += 1;
      }
    }
    // A page with products must also hold variants. An empty read is
    // a broken body, not a real shop.
    if (nodes.length > 0 && pageVariants === 0) {
      logger.warn('embeddedgraphql.no variants', { shop, page, nodes: nodes.length });
      break;
    }
    variantsSeen += pageVariants;
    const pageInfo = record['pageInfo'];
    if (typeof pageInfo !== 'object' || pageInfo === null) {
      logger.warn('embeddedgraphql.pageinfo missing', { shop, page });
      break;
    }
    const info = pageInfo as Readonly<Record<string, unknown>>;
    const hasNext = info['hasNextPage'];
    if (typeof hasNext !== 'boolean') {
      logger.warn('embeddedgraphql.pageinfo invalid', { shop, page });
      break;
    }
    if (!hasNext) {
      complete = true;
      break;
    }
    const endCursor = info['endCursor'];
    if (typeof endCursor !== 'string' || endCursor.length === 0) {
      break;
    }
    cursor = endCursor;
  }
  if (!complete) {
    logger.error('embeddedgraphql.incomplete', { shop, pages: attempts, variants: map.size });
    return null;
  }
  if (variantsSeen === 0) {
    logger.error('embeddedgraphql.empty', { shop, pages: attempts });
    return null;
  }
  return map;
}

function applyInventory(product: Product, inventory: ReadonlyMap<string, number>): Product {
  const variants: Variant[] = product.variants.map((variant) => {
    const quantity = inventory.get(variant.id);
    if (quantity === undefined) {
      return variant;
    }
    // A negative value is not a count. It marks a buyable item.
    const normalized = quantity < 0 ? 1 : quantity;
    return { ...variant, quantity: normalized, available: normalized > 0 };
  });
  return { ...product, variants };
}

export function buildEmbeddedGraphqlProvider(
  config: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch
): Provider {
  const rawFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const fetchFn = measureFetch(rawFetch, logger, config.id, 'direct');
  const rateLimiter = new RateLimiter(config.ratePerSecond);
  return buildProvider(config, logger, async (): Promise<Catalog> => {
    const catalog = await fetchCatalogForConfig(config, logger, fetchFn);
    const seed = catalog.products[0];
    if (seed === undefined) {
      return catalog;
    }
    const page = await fetchFn(seed.url, { headers: { ...BROWSER_HEADERS } });
    const html = await page.text();
    const token = parseStorefrontToken(html);
    const shop = parseShopDomain(html);
    if (token === null || shop === null) {
      logger.error('embeddedgraphql.no token', {
        domain: config.domain,
        hasToken: token !== null,
        hasShop: shop !== null,
      });
      throw new ProviderError(`Storefront token missing for ${config.domain}`, config.id);
    }
    const inventory = await fetchStorefrontInventory(shop, token, logger, fetchFn, rateLimiter);
    if (inventory === null) {
      throw new ProviderError(`Storefront inventory incomplete for ${config.domain}`, config.id);
    }
    logger.info('embeddedgraphql.fetched', { domain: config.domain, shop, variants: inventory.size });
    return {
      domain: config.domain,
      fetchedAt: new Date().toISOString(),
      products: catalog.products.map((product) => applyInventory(product, inventory)),
    };
  });
}
