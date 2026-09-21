import type { Logger } from '../../../logger.ts';
import type { Catalog, Money, Product, ProviderConfig, Variant } from '../../../types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PAGE_SIZE = 250;
const MAX_PAGES = 100;
const MAX_ATTEMPTS = 3;

export function parsePrice(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

export function parseShopifyVariant(raw: unknown): Variant | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  if (typeof obj['id'] !== 'number') {
    return null;
  }
  const price = parsePrice(typeof obj['price'] === 'string' ? obj['price'] : null);
  const regular = parsePrice(typeof obj['compare_at_price'] === 'string' ? obj['compare_at_price'] : null);
  const available = typeof obj['available'] === 'boolean' ? obj['available'] : false;
  const inventoryQuantity = typeof obj['inventory_quantity'] === 'number' ? obj['inventory_quantity'] : null;
  const title = typeof obj['title'] === 'string' && obj['title'].length > 0 ? obj['title'] : 'default';
  const priceAmount = price === null ? 0 : price;
  return {
    id: String(obj['id']),
    title,
    sku: typeof obj['sku'] === 'string' ? obj['sku'] : null,
    price: money(priceAmount),
    regularPrice: regular !== null && regular > priceAmount ? money(regular) : null,
    available,
    quantity: inventoryQuantity !== null ? inventoryQuantity : available ? null : 0,
  };
}

function parseTags(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) {
    return raw.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
}

export function parseShopifyProduct(raw: unknown, domain: string): Product | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  if (typeof obj['id'] !== 'number') {
    return null;
  }
  const id = String(obj['id']);
  const handle = typeof obj['handle'] === 'string' ? obj['handle'] : '';
  const title = typeof obj['title'] === 'string' ? obj['title'] : id;
  const variantsRaw = Array.isArray(obj['variants']) ? obj['variants'] : [];
  const variants: Variant[] = [];
  for (const rawVariant of variantsRaw) {
    const variant = parseShopifyVariant(rawVariant);
    if (variant !== null) {
      variants.push(variant);
    }
  }
  return {
    id,
    title,
    url: `https://${domain}/products/${handle}`,
    variants,
    tags: parseTags(obj['tags']),
  };
}

export function parseShopifyCatalog(raw: unknown, domain: string): Product[] {
  if (typeof raw !== 'object' || raw === null) {
    return [];
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  const productsRaw = Array.isArray(obj['products']) ? obj['products'] : [];
  const products: Product[] = [];
  for (const rawProduct of productsRaw) {
    const product = parseShopifyProduct(rawProduct, domain);
    if (product !== null) {
      products.push(product);
    }
  }
  return products;
}

type CatalogFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// The skip set for a provider. The config holds the duplicate product ids.
export function duplicateProductSet(config: ProviderConfig): ReadonlySet<string> {
  const ids = config.duplicateProductIds;
  if (ids === undefined) {
    return new Set<string>();
  }
  return new Set<string>(ids.map((id) => String(id)));
}

// The shop's combined-products app lists one product twice: a shell and
// its source. Both carry the same variant ids. The snapshots table holds
// one row per (shop, time, variant). The second product breaks the
// insert. Drop the tagged shell. Never drop a product without the tag.
// A tagged product that shares no variant stays.
export function dedupeCombinedProducts(catalog: Catalog, tag: string, logger: Logger): Catalog {
  const owners = new Map<string, number[]>();
  catalog.products.forEach((product, index) => {
    for (const variant of product.variants) {
      const list = owners.get(variant.id);
      if (list === undefined) {
        owners.set(variant.id, [index]);
      } else {
        list.push(index);
      }
    }
  });
  const dropped = new Map<number, Set<string>>();
  for (const [variantId, indexes] of owners) {
    if (indexes.length < 2) {
      continue;
    }
    const tagged = indexes.filter((index) => {
      const product = catalog.products[index];
      return product !== undefined && (product.tags ?? []).includes(tag);
    });
    const untagged = indexes.filter((index) => !tagged.includes(index));
    // A real product owns the variant. Drop it from the tagged shells only.
    // When every owner is tagged, or none is, keep the first and drop the
    // rest. Exactly one owner always remains. The insert cannot collide.
    const losers = tagged.length > 0 && untagged.length > 0 ? tagged : indexes.slice(1);
    for (const index of losers) {
      const set = dropped.get(index);
      if (set === undefined) {
        dropped.set(index, new Set([variantId]));
      } else {
        set.add(variantId);
      }
    }
  }
  const products: Product[] = [];
  let skipped = 0;
  catalog.products.forEach((product, index) => {
    const drop = dropped.get(index);
    if (drop === undefined) {
      products.push(product);
      return;
    }
    const variants = product.variants.filter((variant) => !drop.has(variant.id));
    if (variants.length === 0) {
      skipped += 1;
      logger.warn('shopify.combined product skipped', { domain: catalog.domain, productId: product.id });
      return;
    }
    products.push({ ...product, variants });
  });
  if (skipped > 0) {
    logger.debug('shopify combined dedupe', { domain: catalog.domain, skipped });
  }
  return { ...catalog, products };
}

// Fetch the catalog. Skip the known duplicate products from the config.
// Then drop the combined-product shells that are not on the list.
export async function fetchCatalogForConfig(
  config: ProviderConfig,
  logger: Logger,
  fetchFn: CatalogFetch = fetch
): Promise<Catalog> {
  const catalog = await fetchShopifyCatalog(
    config.endpoint,
    config.domain,
    logger,
    fetchFn,
    duplicateProductSet(config)
  );
  const tag = config.combinedProductTag;
  if (tag === undefined) {
    return catalog;
  }
  return dedupeCombinedProducts(catalog, tag, logger);
}

async function fetchPage(endpoint: string, page: number, fetchFn: CatalogFetch): Promise<unknown> {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint}${separator}limit=${PAGE_SIZE}&page=${page}`;
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      continue;
    }
    if (!response.ok) {
      throw new Error(`GET ${url} failed with status ${response.status}`);
    }
    return response.json();
  }
}

export async function fetchShopifyCatalog(
  endpoint: string,
  domain: string,
  logger: Logger,
  fetchFn: CatalogFetch = fetch,
  excludeProductIds: ReadonlySet<string> = new Set<string>()
): Promise<Catalog> {
  const products: Product[] = [];
  let skipped = 0;
  let page = 1;
  let pageCount = 0;
  while (true) {
    if (page > MAX_PAGES) {
      throw new Error(`Shopify catalog too large for ${domain} (more than ${MAX_PAGES} pages)`);
    }
    const data = await fetchPage(endpoint, page, fetchFn);
    const parsed = parseShopifyCatalog(data, domain);
    for (const product of parsed) {
      if (excludeProductIds.has(product.id)) {
        skipped += 1;
        logger.warn('shopify.duplicate product skipped', { domain, productId: product.id });
        continue;
      }
      products.push(product);
    }
    pageCount += 1;
    if (parsed.length < PAGE_SIZE) {
      break;
    }
    page += 1;
  }
  logger.debug('shopify catalog fetched', { domain, pages: pageCount, products: products.length, skipped });
  return { domain, fetchedAt: new Date().toISOString(), products };
}
