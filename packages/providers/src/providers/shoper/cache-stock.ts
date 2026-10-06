// Shoper exact stock from the public product stock endpoint.
// See docs/CLAMP-BYPASS.md.
//
// The shop renders exact stock per stock id. Two page sources name the
// stock ids:
//   1. The catalog list holds the base stock id (no option).
//   2. The product page holds Shop.values.ProductStocksCache. It is a
//      base64 JSON of { "<optionValueId>": { "sid": <stockId> } }. It
//      names every option stock id and the option name.
// The endpoint `product/getstock/product/<id>/...?stock=<stockId>`
// returns the exact `stock` for one stock id.
//
// This is a GET path. It runs direct. It uses no proxy.
// It covers the option variants and the simple products.
//
// Live proof on 2026-10-05 (developer machine, direct):
// product 31 stock ids [39, 5008, 5009, 5010, 5011, 5044] ->
//   stock [78, 12, 12, 12, 6, 10].
// product 280 [7119, 7120, 7121, 7122, 7123] ->
//   stock [100, 0, 18, 4, 21].
// product 39 (simple, kubek) [47] -> stock [9].
// The cart add returned the same stock id for every buyable variant.

import { buildProvider } from '../../factory.ts';
import { BROWSER_HEADERS } from '../../browser-headers.ts';
import { measureFetch } from '../../network/manager.ts';
import type { WrappedFetch } from '../../network/manager.ts';
import type { DirectFetch } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../types.ts';
import { fetchShoperCatalog } from './basket-reveal.ts';

// The cache sits in one script line. The window bounds the regex
// scan, not the network read. The page is already in memory.
const CACHE_MAX_CHARS = 500000;
const STOCK_IMG_WIDTH = 500;
const STOCK_IMG_HEIGHT = 500;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 800;

interface CacheEntry {
  readonly stockId: string;
}

// The cache read has four outcomes.
// 'absent': the page holds no marker, or an empty cache list. The
//   product is simple or holds text options only.
// 'empty': the page holds the marker and the body is an empty object.
//   A variant product that lost its option stock. It is suspect.
// 'broken': the page holds the marker and the body is not readable.
// A map: the option value id to the stock id. The product has variants.
export type CacheRead = 'absent' | 'empty' | 'broken' | ReadonlyMap<string, CacheEntry>;

// Reads Shop.values.ProductStocksCache. The body is base64 JSON.
// The result is keyed by the option value id. An entry holds the stock
// id. The order follows the document.
export function parseProductStocksCache(html: string, logger: Logger): CacheRead {
  const marker = 'ProductStocksCache';
  const at = html.indexOf(marker);
  if (at < 0) {
    return 'absent';
  }
  const match = /ProductStocksCache\s*=\s*"([^"]+)"/.exec(html.slice(at, at + CACHE_MAX_CHARS));
  if (match === null || match[1] === undefined) {
    logger.warn('shoperstocks.marker without value', { at });
    return 'broken';
  }
  const encoded = match[1];
  let parsed: unknown;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const value: unknown = JSON.parse(decoded);
    parsed = value;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('shoperstocks.cache parse failed', { size: encoded.length, error: message });
    return 'broken';
  }
  const entries = new Map<string, CacheEntry>();
  const collect = (key: string, value: unknown): void => {
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const stockId = (value as Readonly<Record<string, unknown>>)['sid'];
    if (typeof stockId !== 'number' && typeof stockId !== 'string') {
      return;
    }
    entries.set(key, { stockId: String(stockId) });
  };
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const record = item as Readonly<Record<string, unknown>>;
      let key: unknown = record['id'];
      if (key === undefined) {
        key = record['optionValueId'];
      }
      if (key === undefined) {
        key = record['option_value_id'];
      }
      if (typeof key === 'number' || typeof key === 'string') {
        collect(String(key), item);
      }
    }
    if (entries.size === 0) {
      // An empty list means the product has no option variants.
      return 'absent';
    }
    return entries;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    logger.warn('shoperstocks.cache shape', { kind: typeof parsed });
    return 'broken';
  }
  for (const [key, value] of Object.entries(parsed as Readonly<Record<string, unknown>>)) {
    collect(key, value);
  }
  if (entries.size === 0) {
    // The payload is an object with no usable entry. This is not a
    // simple product. A simple product writes an empty list.
    return 'empty';
  }
  return entries;
}

// Reads the option names of the product form. The result maps the
// option value id to the option name. A later group with the same
// value id does not overwrite an earlier one. This keeps the first
// name. The cache key stays the source of truth for the stock.
export function parseOptionNames(html: string): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const select of html.matchAll(/<select[^>]*name="option_\d+"[^>]*>([\s\S]*?)<\/select>/g)) {
    const body = select[1];
    if (body === undefined) {
      continue;
    }
    for (const option of body.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)<\/option>/g)) {
      const id = option[1];
      const name = option[2];
      if (id !== undefined && name !== undefined && !names.has(id)) {
        names.set(id, name.trim());
      }
    }
  }
  return names;
}

// Reads the exact stock for one stock id. The body is JSON.
// Returns null on a broken body or a missing count.
export function parseStockValue(body: string, logger: Logger, stockId: string): number | null {
  const text = body.trim();
  if (text.length === 0) {
    logger.warn('shoperstocks.stock empty', { stockId });
    return null;
  }
  let parsed: unknown;
  try {
    const value: unknown = JSON.parse(text);
    parsed = value;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('shoperstocks.stock parse failed', { stockId, error: message, size: text.length });
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    logger.warn('shoperstocks.stock shape', { stockId, kind: typeof parsed });
    return null;
  }
  const stock = (parsed as Readonly<Record<string, unknown>>)['stock'];
  if (typeof stock !== 'number' || !Number.isFinite(stock)) {
    logger.warn('shoperstocks.stock shape', { stockId, kind: typeof stock });
    return null;
  }
  if (!Number.isInteger(stock)) {
    // The source changed. A truncated count is a guess. Reject it.
    logger.warn('shoperstocks.stock fractional', { stockId, stock });
    return null;
  }
  return stock;
}

// Builds the variant list. Every variant gets an exact count.
// The base variant keeps the catalog id. The option variants use the
// cache stock id. The title of an option variant is the option name.
// A base id that the config excludes is skipped. The cache variants
// then stand alone.
export function buildStockVariants(
  product: Product,
  inventory: ReadonlyMap<string, CacheEntry>,
  optionNames: ReadonlyMap<string, string>,
  stock: ReadonlyMap<string, number>
): readonly Variant[] | null {
  const base = product.variants[0];
  if (base === undefined) {
    return null;
  }
  const variants: Variant[] = [];
  const seen = new Set<string>();
  const baseStock = stock.get(base.id);
  if (baseStock !== undefined) {
    variants.push({ ...base, quantity: baseStock, available: baseStock > 0 });
    seen.add(base.id);
  }
  for (const [optionId, entry] of inventory) {
    if (seen.has(entry.stockId)) {
      continue;
    }
    const count = stock.get(entry.stockId);
    if (count === undefined) {
      continue;
    }
    seen.add(entry.stockId);
    const name = optionNames.get(optionId);
    const title = name === undefined || name.length === 0 ? optionId : name;
    variants.push({
      id: entry.stockId,
      title,
      sku: base.sku,
      price: base.price,
      regularPrice: base.regularPrice,
      available: count > 0,
      quantity: count,
    });
  }
  if (variants.length === 0) {
    return null;
  }
  return variants;
}

// Collects every stock id of one product. The base id comes first.
// The order is stable. A duplicate id is dropped.
export function collectStockIds(product: Product, inventory: ReadonlyMap<string, CacheEntry>): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const base = product.variants[0];
  if (base !== undefined) {
    ids.push(base.id);
    seen.add(base.id);
  }
  for (const [, entry] of inventory) {
    if (seen.has(entry.stockId)) {
      continue;
    }
    seen.add(entry.stockId);
    ids.push(entry.stockId);
  }
  return ids;
}

async function fetchPage(
  url: string,
  logger: Logger,
  domain: string,
  productId: string,
  fetchFn: WrappedFetch,
  deadlineMs: number
): Promise<{ ok: boolean; status: number; text: string }> {
  let last: { ok: boolean; status: number; text: string } = { ok: false, status: 0, text: '' };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Awaited<ReturnType<WrappedFetch>>;
    let text: string;
    try {
      response = await fetchFn(url, { headers: { ...BROWSER_HEADERS } });
      // The body read can throw on a dropped stream. It stays in the
      // same catch. A body error must retry or mask, never abort the run.
      text = await response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('shoperstocks.page network', { domain, productId, attempt, error: message });
      if (attempt < MAX_ATTEMPTS && Date.now() < deadlineMs) {
        await sleepMs(RETRY_BASE_MS * attempt);
        continue;
      }
      return last;
    }
    last = { ok: response.ok, status: response.status, text };
    if (response.ok) {
      return last;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS && Date.now() < deadlineMs) {
      logger.warn('shoperstocks.page retry', { domain, productId, status: response.status, attempt });
      await sleepMs(RETRY_BASE_MS * attempt);
      continue;
    }
    return last;
  }
  return last;
}

async function fetchStockValue(
  config: ProviderConfig,
  productId: string,
  stockId: string,
  logger: Logger,
  fetchFn: WrappedFetch,
  deadlineMs: number
): Promise<number | null> {
  const url =
    `https://${config.domain}/product/getstock/product/${productId}` +
    `/imgwidth/${STOCK_IMG_WIDTH}/imgheight/${STOCK_IMG_HEIGHT}/?stock=${stockId}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Awaited<ReturnType<WrappedFetch>>;
    let body: string;
    try {
      response = await fetchFn(url, { headers: { ...BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest' } });
      // The body read can throw on a dropped stream. It stays in the
      // same catch. A body error must retry or mask, never abort the run.
      body = await response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('shoperstocks.stock network', { domain: config.domain, productId, stockId, attempt, error: message });
      if (attempt < MAX_ATTEMPTS && Date.now() < deadlineMs) {
        await sleepMs(RETRY_BASE_MS * attempt);
        continue;
      }
      return null;
    }
    if (response.ok) {
      return parseStockValue(body, logger, stockId);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS && Date.now() < deadlineMs) {
      logger.warn('shoperstocks.stock retry', {
        domain: config.domain,
        productId,
        stockId,
        status: response.status,
        attempt,
      });
      await sleepMs(RETRY_BASE_MS * attempt);
      continue;
    }
    logger.warn('shoperstocks.stock failed', {
      domain: config.domain,
      productId,
      stockId,
      status: response.status,
    });
    return null;
  }
  return null;
}

// Marks every variant unknown. A failed pull must never store a
// fabricated exact count. The catalog variant keeps `quantity: 0` when
// the shop marks it unbuyable. That zero is a floor, not a count.
// The mask hides it. The report sees the gap.
export function maskProduct(product: Product): Product {
  const variants: Variant[] = product.variants.map((variant) => ({ ...variant, quantity: null, available: false }));
  return { ...product, variants };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pace(waitMs: number): Promise<void> {
  if (waitMs <= 0) {
    return Promise.resolve();
  }
  return sleepMs(waitMs);
}

export function buildShoperCacheStockProvider(
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
  const waitMs = config.ratePerSecond > 0 ? Math.round(1000 / config.ratePerSecond) : 0;
  const deadlineMs = Date.now() + config.durationSeconds * 1000;
  return buildProvider(config, logger, async (): Promise<Catalog> => {
    const catalog = await fetchShoperCatalog(config.endpoint, config.domain, logger, fetchFn);
    const products: Product[] = [];
    let enriched = 0;
    let noCache = 0;
    let failed = 0;
    for (const product of catalog.products) {
      if (Date.now() >= deadlineMs) {
        logger.warn('shoperstocks.budget', {
          domain: config.domain,
          remaining: catalog.products.length - products.length,
        });
        for (const rest of catalog.products.slice(products.length)) {
          products.push(rest);
        }
        break;
      }
      await pace(waitMs);
      const response = await fetchPage(product.url, logger, config.domain, product.id, fetchFn, deadlineMs);
      if (!response.ok) {
        logger.warn('shoperstocks.page failed', {
          domain: config.domain,
          productId: product.id,
          status: response.status,
        });
        failed += 1;
        products.push(maskProduct(product));
        continue;
      }
      const html = response.text;
      const inventory = parseProductStocksCache(html, logger);
      if (inventory === 'broken') {
        // The page holds the marker and the cache is broken. The
        // variant list is unknown. Mask the product. Never fake a zero.
        logger.warn('shoperstocks.cache broken', { domain: config.domain, productId: product.id });
        failed += 1;
        products.push(maskProduct(product));
        continue;
      }
      if (inventory === 'empty') {
        // The page holds the marker and no usable entry. A variant
        // product that lost its option stock. Mask it. Never emit a
        // base-only variant.
        logger.warn('shoperstocks.cache empty', { domain: config.domain, productId: product.id });
        failed += 1;
        products.push(maskProduct(product));
        continue;
      }
      const isSimple = inventory === 'absent';
      const optionNames = isSimple ? new Map<string, string>() : parseOptionNames(html);
      const activeInventory = isSimple ? new Map<string, CacheEntry>() : inventory;
      const stockIds = collectStockIds(product, activeInventory);
      const stock = new Map<string, number>();
      let stockFailed = false;
      for (const stockId of stockIds) {
        if (Date.now() >= deadlineMs) {
          logger.warn('shoperstocks.budget', { domain: config.domain, productId: product.id });
          stockFailed = true;
          break;
        }
        await pace(waitMs);
        const count = await fetchStockValue(config, product.id, stockId, logger, fetchFn, deadlineMs);
        if (count === null) {
          stockFailed = true;
          break;
        }
        stock.set(stockId, count);
      }
      if (stockFailed) {
        failed += 1;
        products.push(maskProduct(product));
        continue;
      }
      if (isSimple) {
        // A simple product holds no option cache. The base stock is exact.
        noCache += 1;
        const baseVariants = buildStockVariants(product, activeInventory, optionNames, stock);
        if (baseVariants === null) {
          logger.warn('shoperstocks.no variants', { domain: config.domain, productId: product.id });
          failed += 1;
          products.push(maskProduct(product));
          continue;
        }
        products.push({ ...product, variants: baseVariants });
        enriched += 1;
        continue;
      }
      const variants = buildStockVariants(product, inventory, optionNames, stock);
      if (variants === null) {
        logger.warn('shoperstocks.no variants', { domain: config.domain, productId: product.id });
        failed += 1;
        products.push(maskProduct(product));
        continue;
      }
      products.push({ ...product, variants });
      enriched += 1;
    }
    logger.info('shoperstocks.enriched', {
      domain: config.domain,
      products: catalog.products.length,
      enriched,
      noCache,
      failed,
    });
    return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
  });
}
