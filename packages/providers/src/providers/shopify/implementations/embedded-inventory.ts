import { buildProvider } from '../../../factory.ts';
import { BROWSER_HEADERS } from '../../../browser-headers.ts';
import { measureFetch } from '../../../network/manager.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../../types.ts';
import { fetchCatalogForConfig } from './adapter.ts';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseEmbeddedInventory(html: string, scriptId: string, logger: Logger): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const pattern = new RegExp(`id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`);
  const match = pattern.exec(html);
  if (match === null) {
    return map;
  }
  const body = match[1];
  if (body === undefined) {
    return map;
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('embeddedinventory.script parse failed', { error: message, size: body.length });
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

export function parseBisVariantData(html: string, logger: Logger): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, 'bis-variant-data', logger);
}

export function parseVariantInventoryData(html: string, logger: Logger): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, 'variantInventoryData', logger);
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
    let raw: string | undefined = undefined;
    if (parseIntValue !== undefined) {
      raw = parseIntValue;
    } else if (quoted !== undefined) {
      raw = quoted;
    } else {
      raw = plain;
    }
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

export type InventoryParser = (html: string, logger: Logger, domain: string) => ReadonlyMap<string, number>;

// The leak vector names the app that writes the stock. The probe and the
// provider share the names. See docs/CLAMP-BYPASS.md.
export type LeakVector = 'kaching-inventory' | 'data-inventory-quantity' | 'grow-inventory-map' | 'restock-quantity';
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
      try {
        await response.body.cancel();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('shopify.cookie cancel failed', { domain, error: message });
      }
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
    // A 403 is a hard block. A retry or a cookie rotation does not fix it.
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

export function parseShopifyXmlInventory(xml: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const match of xml.matchAll(/<variant>[\s\S]*?<\/variant>/g)) {
    const body = match[0];
    if (body === undefined) {
      continue;
    }
    const id = /<id type="integer">(-?\d+)<\/id>/.exec(body)?.[1];
    const quantity = /<inventory-quantity[^>]*>(-?\d+)<\/inventory-quantity>/.exec(body)?.[1];
    if (id === undefined || quantity === undefined) {
      continue;
    }
    map.set(id, Number(quantity));
  }
  return map;
}

export function parseShopifyJsInventory(body: string, logger: Logger): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('embeddedinventory.script parse failed', { error: message, size: body.length });
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

// The Kaching Bundles app writes a JSON block per product.
export function parseKachingInventory(html: string, logger: Logger): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const blocks = html.matchAll(/<script[^>]*class="[^"]*kaching-bundles-product[^"]*"[^>]*>([\s\S]*?)<\/script>/g);
  for (const block of blocks) {
    const text = block[1];
    if (text === undefined) {
      continue;
    }
    const parsed = parseJsonSafe(text.trim(), logger);
    if (parsed === null) {
      continue;
    }
    const products = Array.isArray(parsed) ? parsed : [parsed];
    for (const product of products) {
      if (typeof product !== 'object' || product === null) {
        continue;
      }
      const variants = (product as Readonly<Record<string, unknown>>)['variants'];
      if (!Array.isArray(variants)) {
        continue;
      }
      for (const variant of variants) {
        if (typeof variant !== 'object' || variant === null) {
          continue;
        }
        const record = variant as Readonly<Record<string, unknown>>;
        setInventoryEntry(map, record['id'], record['inventoryQuantity']);
      }
    }
  }
  return map;
}

// A custom theme script writes a JSON array of id and qty.
export function parseDataInventoryQuantity(html: string, logger: Logger): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const blocks = html.matchAll(/<script[^>]*data-inventory-quantity[^>]*>([\s\S]*?)<\/script>/g);
  for (const block of blocks) {
    const text = block[1];
    if (text === undefined) {
      continue;
    }
    const parsed = parseJsonSafe(text.trim(), logger);
    if (!Array.isArray(parsed)) {
      continue;
    }
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const record = entry as Readonly<Record<string, unknown>>;
      setInventoryEntry(map, record['id'], record['qty']);
    }
  }
  return map;
}

// The Grow app writes a JS map of variant id and count.
export function parseGrowInventory(html: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const match of html.matchAll(/gwProductInventoryQuantity\[(\d+)\]\s*=\s*"?(\d+)"?/g)) {
    const id = match[1];
    const quantity = match[2];
    if (id === undefined || quantity === undefined) {
      continue;
    }
    setInventoryEntry(map, id, Number(quantity));
  }
  return map;
}

// The ReStock config groups the variants. Group A is the product
// variants. Group B is an unrelated app block. The parser reads one
// group per call. A window of 200000 characters bounds the scan.
// A variant object holds about 60 to 120 characters.
const RESTOCK_VARIANT_WINDOW = 200000;

// The ReStock app writes the variant stock per item. Each item is a flat
// object of id and quantity. One item becomes one entry. A quantity
// outside a group means the block is not the ReStock block.
export function parseRestockProducts(
  html: string,
  logger: Logger,
  domain: string
): ReadonlyMap<LeakVector, ReadonlyMap<string, number>> {
  const result = new Map<LeakVector, ReadonlyMap<string, number>>();
  const start = html.indexOf('_ReStockConfig');
  if (start < 0) {
    return result;
  }
  const segment = html.slice(start, start + RESTOCK_VARIANT_WINDOW);
  if (segment.length >= RESTOCK_VARIANT_WINDOW) {
    logger.warn('embeddedinventory.restock truncated', { domain, size: html.length });
    return result;
  }
  for (const item of html.matchAll(/\{[^{}]*\}/g)) {
    const text = item[0];
    if (text === undefined) {
      continue;
    }
    const id = /\bid\s*:\s*(\d+)/.exec(text);
    const quantity = /\bquantity\s*:\s*(\d+)/.exec(text);
    if (id !== null && quantity !== null && id[1] !== undefined && quantity[1] !== undefined) {
      addRestockEntry(result, 'restock-quantity', id[1], Number(quantity[1]));
      continue;
    }
    const productId = /"id"\s*:\s*(\d+)/.exec(text);
    const productQty = /"qty"\s*:\s*(\d+)/.exec(text);
    if (productId !== null && productQty !== null && productId[1] !== undefined && productQty[1] !== undefined) {
      addRestockEntry(result, 'data-inventory-quantity', productId[1], Number(productQty[1]));
    }
  }
  return result;
}

function addRestockEntry(
  result: Map<LeakVector, ReadonlyMap<string, number>>,
  vector: LeakVector,
  id: string,
  quantity: number
): void {
  const current = result.get(vector);
  const map = current === undefined ? new Map<string, number>() : new Map(current);
  setInventoryEntry(map, id, quantity);
  result.set(vector, map);
}

// The ReStock config holds one group. The group is the product variants.
export function parseRestockQuantity(html: string, logger: Logger, domain: string): ReadonlyMap<string, number> {
  const groups = parseRestockProducts(html, logger, domain);
  const variants = groups.get('restock-quantity');
  return variants === undefined ? new Map<string, number>() : new Map(variants);
}

function parseJsonSafe(text: string, logger: Logger): unknown | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('embeddedinventory.script parse failed', { error: message, size: text.length });
    return null;
  }
}

function setInventoryEntry(map: Map<string, number>, id: unknown, quantity: unknown): void {
  const idText = typeof id === 'number' ? String(Math.trunc(id)) : typeof id === 'string' ? id : null;
  if (idText === null || idText === '0') {
    return;
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return;
  }
  map.set(idText, Math.trunc(quantity));
}

// Reads the handle from the catalog product url.
// The adapter builds the url as https://domain/products/<handle>.
// A handle holds no slash. The last path segment is the handle.
export function parseProductHandle(url: string): string | null {
  const withoutQuery = url.split('?')[0];
  if (withoutQuery === undefined) {
    return null;
  }
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1];
  if (last === undefined || last.length === 0) {
    return null;
  }
  return last;
}

// Reads every product page. The cap does not apply to the page.
// A budget stops the loop. The remaining products stay unchanged.
export async function enrichProducts(
  products: readonly Product[],
  domain: string,
  parseFn: InventoryParser,
  logger: Logger,
  fetchFn: CatalogFetch,
  ratePerSecond: number,
  urlSuffix: string,
  cookieFetch: WrappedFetch,
  budgetMs: number
): Promise<Product[]> {
  const result: Product[] = [];
  const waitMs = ratePerSecond > 0 ? Math.round(1000 / ratePerSecond) : 0;
  const deadlineMs = Date.now() + budgetMs;
  let first = true;
  let cookie: string | null = null;
  if (Date.now() < deadlineMs) {
    cookie = await fetchShopifyCookie(domain, logger, cookieFetch);
    logger.info('shopify.cookie', { domain, reason: 'session-start', present: cookie !== null });
  }
  let enriched = 0;
  let noScript = 0;
  let failed = 0;
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    if (product === undefined) {
      continue;
    }
    if (Date.now() >= deadlineMs) {
      logger.warn('embeddedinventory.budget', { domain, remaining: products.length - index });
      for (let rest = index; rest < products.length; rest += 1) {
        const pending = products[rest];
        if (pending !== undefined) {
          result.push(pending);
        }
      }
      break;
    }
    if (waitMs > 0 && !first) {
      await delayMs(waitMs);
    }
    first = false;
    const handle = parseProductHandle(product.url);
    if (handle === null) {
      logger.warn('embedded.product bad url', { productId: product.id, url: product.url });
      failed += 1;
      result.push(product);
      continue;
    }
    const url = `https://${domain}/products/${handle}${urlSuffix}`;
    try {
      const html = await fetchText(url, fetchFn, cookie);
      const inventory = parseFn(html, logger, domain);
      if (inventory.size === 0) {
        logger.warn('embedded.product no script', { productId: product.id, url });
        noScript += 1;
        result.push(product);
        continue;
      }
      result.push({ ...product, variants: applyInventory(product.variants, inventory) });
      enriched += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/status 429/.test(message)) {
        const rotated = await fetchShopifyCookie(domain, logger, cookieFetch);
        if (rotated !== null) {
          cookie = rotated;
          logger.info('shopify.rotation', { domain, reason: '429-persistent', productId: product.id });
        }
        try {
          const html = await fetchText(url, fetchFn, cookie);
          const inventory = parseFn(html, logger, domain);
          if (inventory.size > 0) {
            result.push({ ...product, variants: applyInventory(product.variants, inventory) });
            enriched += 1;
            continue;
          }
          logger.warn('embedded.product no script', { productId: product.id, url });
          noScript += 1;
          result.push(product);
          continue;
        } catch (retryError: unknown) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          logger.warn('embedded.product fetch failed', { productId: product.id, error: retryMessage });
          failed += 1;
          result.push(product);
          continue;
        }
      }
      logger.warn('embedded.product fetch failed', { productId: product.id, error: message });
      failed += 1;
      result.push(product);
    }
  }
  logger.info('embedded.product enriched', {
    domain,
    products: products.length,
    enriched,
    noScript,
    failed,
  });
  return result;
}

function applyInventory(variants: readonly Variant[], inventory: ReadonlyMap<string, number>): Variant[] {
  return variants.map((variant) => {
    const quantity = inventory.get(variant.id);
    if (quantity === undefined) {
      return variant;
    }
    const normalized = quantity < 0 ? 1 : quantity;
    return { ...variant, quantity: normalized, available: normalized > 0 };
  });
}

export function buildEmbeddedInventoryProvider(
  config: ProviderConfig,
  logger: Logger,
  parseFn: InventoryParser,
  directFetch?: DirectFetch,
  urlSuffix = ''
): Provider {
  const rawFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const budgetMs = Math.max(config.durationSeconds * 1000, 10 * 60 * 1000);
  const catalogFetch = measureFetch(rawFetch, logger, config.id, 'direct');
  // The cookie fetch is a direct request. It is not a proxy request.
  const cookieFetch = measureFetch(rawFetch, logger, config.id, 'direct');
  return buildProvider(config, logger, async (): Promise<Catalog> => {
    const catalog = await fetchCatalogForConfig(config, logger, catalogFetch);
    const products = await enrichProducts(
      catalog.products,
      config.domain,
      parseFn,
      logger,
      catalogFetch,
      config.ratePerSecond,
      urlSuffix,
      cookieFetch,
      budgetMs
    );
    return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
  });
}
