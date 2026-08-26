import type { Logger } from '../../../logger.ts';
import type { Catalog, Money, Product, Variant } from '../../../types.ts';

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
  fetchFn: CatalogFetch = fetch
): Promise<Catalog> {
  const products: Product[] = [];
  let page = 1;
  let pageCount = 0;
  while (true) {
    if (page > MAX_PAGES) {
      throw new Error(`Shopify catalog too large for ${domain} (more than ${MAX_PAGES} pages)`);
    }
    const data = await fetchPage(endpoint, page, fetchFn);
    const parsed = parseShopifyCatalog(data, domain);
    products.push(...parsed);
    pageCount += 1;
    if (parsed.length < PAGE_SIZE) {
      break;
    }
    page += 1;
  }
  logger.debug('shopify catalog fetched', { domain, pages: pageCount, products: products.length });
  return { domain, fetchedAt: new Date().toISOString(), products };
}
