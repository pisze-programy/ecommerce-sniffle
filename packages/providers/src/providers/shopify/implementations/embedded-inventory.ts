import { buildProvider } from '../../../factory.ts';
import { BROWSER_HEADERS } from '../../../browser-headers.ts';
import { measureFetch } from '../../../network/manager.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../../types.ts';
import { fetchShopifyCatalog } from './adapter.ts';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseEmbeddedInventory(html: string, scriptId: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const pattern = new RegExp(`id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`);
  const match = pattern.exec(html);
  if (match === null) {
    return map;
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? '');
  } catch {
    return map;
  }
  if (!Array.isArray(data)) {
    return map;
  }
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const obj = entry as Readonly<Record<string, unknown>>;
    const id = obj['id'];
    const quantity = obj['inventory_quantity'];
    if ((typeof id === 'number' || typeof id === 'string') && typeof quantity === 'number') {
      map.set(String(id), quantity);
    }
  }
  return map;
}

export function parseBisVariantData(html: string): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, 'bis-variant-data');
}

export function parseVariantInventoryData(html: string): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, 'variantInventoryData');
}

export function parseRestockRocketQuantity(html: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const block = /variantsInventoryQuantity\s*=\s*\{([\s\S]*?)\};/.exec(html);
  if (block === null) {
    return map;
  }
  const body = block[1];
  if (body === undefined) {
    return map;
  }
  const entry = /(\d+)\s*:\s*(?:parseInt\("(-?\d+)"\)|"(-?\d+)"|(-?\d+))/g;
  for (const match of body.matchAll(entry)) {
    const id = match[1];
    const parseIntValue = match[2];
    const quoted = match[3];
    const plain = match[4];
    if (id === undefined) {
      continue;
    }
    const raw = parseIntValue ?? quoted ?? plain;
    if (raw === undefined) {
      continue;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      continue;
    }
    map.set(id, value);
  }
  return map;
}

type InventoryParser = (html: string) => ReadonlyMap<string, number>;
type CatalogFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export async function fetchShopifyCookie(
  domain: string,
  logger: Logger,
  fetchFn: WrappedFetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchFn(`https://${domain}/products.json`, {
      headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] as string },
    });
    const getSetCookie = (response.headers as { getSetCookie?: () => string[] } | undefined)?.getSetCookie;
    const values =
      typeof getSetCookie === 'function' && response.headers !== undefined ? getSetCookie.call(response.headers) : [];
    if (response.body !== undefined && response.body !== null) {
      await response.body.cancel().catch(() => {});
    }
    if (values.length === 0) {
      return null;
    }
    const pairs = values
      .map((value) => /^([^=;]+=[^;]+)/.exec(value)?.[1])
      .filter((value): value is string => typeof value === 'string');
    return pairs.length > 0 ? pairs.join('; ') : null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('shopify.cookie failed', { domain, error: message });
    return null;
  }
}

async function fetchText(url: string, fetchFn: CatalogFetch, cookie: string | null): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (cookie !== null) {
      headers['Cookie'] = cookie;
    }
    const response = await fetchFn(url, { headers });
    if (response.ok) {
      return response.text();
    }
    if ((response.status === 429 || response.status === 403 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

export function parseShopifyJsInventory(body: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return map;
  }
  if (typeof data !== 'object' || data === null) {
    return map;
  }
  const variants = (data as Readonly<Record<string, unknown>>)['variants'];
  if (!Array.isArray(variants)) {
    return map;
  }
  for (const entry of variants) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const obj = entry as Readonly<Record<string, unknown>>;
    const id = obj['id'];
    const quantity = obj['inventory_quantity'];
    if ((typeof id === 'number' || typeof id === 'string') && typeof quantity === 'number') {
      map.set(String(id), quantity);
    }
  }
  return map;
}

async function enrichProducts(
  products: readonly Product[],
  domain: string,
  parseFn: InventoryParser,
  logger: Logger,
  fetchFn: CatalogFetch,
  ratePerSecond: number,
  urlSuffix: string,
  cookieFetch: WrappedFetch
): Promise<Product[]> {
  const result: Product[] = [];
  const waitMs = ratePerSecond > 0 ? Math.round(1000 / ratePerSecond) : 0;
  let first = true;
  let cookie: string | null = null;
  try {
    cookie = await fetchShopifyCookie(domain, logger, cookieFetch);
  } catch {
    cookie = null;
  }
  logger.info('shopify.cookie', { domain, reason: 'session-start', present: cookie !== null });
  for (const product of products) {
    if (waitMs > 0 && !first) {
      await delayMs(waitMs);
    }
    first = false;
    const url = `https://${domain}/products/${product.url.split('/products/')[1] ?? ''}${urlSuffix}`;
    try {
      const html = await fetchText(url, fetchFn, cookie);
      const inventory = parseFn(html);
      if (inventory.size === 0) {
        result.push(product);
        continue;
      }
      const variants: Variant[] = product.variants.map((variant) => {
        const quantity = inventory.get(variant.id);
        if (quantity === undefined) {
          return variant;
        }
        const normalized = quantity < 0 ? 1 : quantity;
        return { ...variant, quantity: normalized, available: normalized > 0 };
      });
      result.push({ ...product, variants });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/status 429/.test(message)) {
        const rotated = await fetchShopifyCookie(domain, logger);
        if (rotated !== null) {
          cookie = rotated;
          logger.info('shopify.rotation', { domain, reason: '429-persistent', productId: product.id });
        }
        try {
          const html = await fetchText(url, fetchFn, cookie);
          const inventory = parseFn(html);
          if (inventory.size > 0) {
            const variants: Variant[] = product.variants.map((variant) => {
              const quantity = inventory.get(variant.id);
              if (quantity === undefined) {
                return variant;
              }
              const normalized = quantity < 0 ? 1 : quantity;
              return { ...variant, quantity: normalized, available: normalized > 0 };
            });
            result.push({ ...product, variants });
            continue;
          }
        } catch (retryError: unknown) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          logger.warn('embedded.product fetch failed', { productId: product.id, error: retryMessage });
          result.push(product);
          continue;
        }
      }
      logger.warn('embedded.product fetch failed', { productId: product.id, error: message });
      result.push(product);
    }
  }
  return result;
}

export function buildEmbeddedInventoryProvider(
  config: ProviderConfig,
  logger: Logger,
  parseFn: InventoryParser,
  directFetch?: DirectFetch,
  urlSuffix = ''
): Provider {
  const rawCatalogFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const catalogFetch = measureFetch(rawCatalogFetch, logger, config.id, 'direct');
  const cookieFetch = measureFetch((input, init) => fetch(input, init), logger, config.id, 'proxy');
  return buildProvider(config, logger, async (): Promise<Catalog> => {
    const catalog = await fetchShopifyCatalog(config.endpoint, config.domain, logger, catalogFetch);
    const products = await enrichProducts(
      catalog.products,
      config.domain,
      parseFn,
      logger,
      catalogFetch,
      config.ratePerSecond,
      urlSuffix,
      cookieFetch
    );
    return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
  });
}
