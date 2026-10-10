// Sylius (Codarius syliusshop theme) exact stock from the product page.
// The page renders one div per variant inside #variants-pricing.
// The div holds data-availability. The value is the Sylius
// ProductVariant.onHand. It is the exact count per variant.
// The read is a GET. It runs direct. It uses no proxy.

import { buildProvider } from '../../factory.ts';
import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import { BROWSER_HEADERS } from '../../browser-headers.ts';
import type { ProviderModule } from '../../module.ts';
import type { Catalog, Money, Product, Variant } from '../../types.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'korczakisyn'),
  'config korczakisyn'
);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
// One variant div holds about 300 characters. The window bounds the
// scan, not the network read. The page is already in memory.
const VARIANTS_WINDOW = 200_000;

export interface SyliusVariant {
  readonly key: string;
  readonly quantity: number;
  readonly sku: string | null;
}

// Reads the variant block. One div per variant.
// A page without the block returns an empty list.
export function parseSyliusVariants(html: string): readonly SyliusVariant[] {
  const start = html.indexOf('id="variants-pricing"');
  if (start < 0) {
    return [];
  }
  const segment = html.slice(start, start + VARIANTS_WINDOW);
  const variants: SyliusVariant[] = [];
  const seen = new Set<string>();
  for (const match of segment.matchAll(
    /data-variant-option-values="([^"]*)"[^>]*?data-availability="(\d+)"[^>]*?data-sku="([^"]*)"/g
  )) {
    const key = match[1];
    const raw = match[2];
    const sku = match[3];
    if (key === undefined || raw === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    variants.push({ key, quantity: Number(raw), sku: sku === undefined || sku.length === 0 ? null : sku });
  }
  return variants;
}

// Reads the numeric product id from the add-to-cart form.
export function parseSyliusProductId(html: string): string | null {
  const match = /\/ajax\/cart\/add\?productId=(\d+)/.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1];
}

// Reads the product price from the JSON-LD offer.
export function parseSyliusPrice(html: string): number {
  const withCurrency = /"priceCurrency"\s*:\s*"[^"]*"\s*,\s*"price"\s*:\s*(\d+(?:\.\d+)?)/.exec(html);
  if (withCurrency !== null && withCurrency[1] !== undefined) {
    return Number(withCurrency[1]);
  }
  const plain = /"price"\s*:\s*(\d+(?:\.\d+)?)/.exec(html);
  if (plain !== null && plain[1] !== undefined) {
    return Number(plain[1]);
  }
  return 0;
}

// Reads the product title from the first h1. Falls back to the title tag.
export function parseSyliusTitle(html: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (h1 !== null && h1[1] !== undefined) {
    const text = h1[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 0) {
      return text;
    }
  }
  const title = /<title>([^<]*)<\/title>/.exec(html);
  if (title !== null && title[1] !== undefined) {
    return title[1].trim();
  }
  return '';
}

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

type CatalogFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBody(url: string, fetchFn: CatalogFetch): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetchFn(url, { headers: { ...BROWSER_HEADERS } });
    if (response.ok) {
      // The runtime decompresses Content-Encoding gzip and br. The body
      // is plain text. The shop serves the sitemap as text/xml. The
      // provider never needs node:zlib, so it stays safe on the CF
      // worker (no nodejs_compat flag).
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.toString('utf8');
    }
    if ((response.status === 429 || response.status === 403 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

// Collects the pl_PL product urls. The sitemap index points to the
// product sitemap. The sk_SK urls are duplicates or gone. They are
// dropped. The result is deduplicated by url.
async function fetchProductUrls(fetchFn: CatalogFetch): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  const queue = [config.endpoint];
  while (queue.length > 0) {
    const url = queue.shift();
    if (url === undefined || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const body = await fetchBody(url, fetchFn);
    for (const match of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = match[1];
      if (loc === undefined) {
        continue;
      }
      if (loc.includes('/pl_PL/products/')) {
        urls.push(loc);
      } else if (loc.includes('sitemap')) {
        queue.push(loc);
      }
    }
  }
  return urls;
}

export const korczakisynModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const fetchFn: CatalogFetch = (url, init) => {
        if (deps.directFetch !== undefined) {
          return deps.directFetch(url, init);
        }
        return fetch(url, init);
      };
      const excluded = new Set<string>(config.excludedProductIds ?? []);
      const urls = await fetchProductUrls(fetchFn);
      const products: Product[] = [];
      const seen = new Set<string>();
      const waitMs = config.ratePerSecond > 0 ? Math.round(1000 / config.ratePerSecond) : 0;
      let first = true;
      for (const url of urls) {
        if (waitMs > 0 && !first) {
          await delayMs(waitMs);
        }
        first = false;
        try {
          const html = await fetchBody(url, fetchFn);
          const productId = parseSyliusProductId(html);
          if (productId === null) {
            deps.logger.warn('korczakisyn.product no id', { url });
            continue;
          }
          if (excluded.has(productId)) {
            deps.logger.info('korczakisyn.product excluded', { productId, url });
            continue;
          }
          if (seen.has(productId)) {
            continue;
          }
          const syliusVariants = parseSyliusVariants(html);
          if (syliusVariants.length === 0) {
            deps.logger.warn('korczakisyn.product no availability', { productId, url });
            continue;
          }
          seen.add(productId);
          const variants: Variant[] = syliusVariants.map((entry) => ({
            id: `${productId}-${entry.key}`,
            title: entry.key,
            sku: entry.sku,
            price: money(parseSyliusPrice(html)),
            regularPrice: null,
            available: entry.quantity > 0,
            quantity: entry.quantity,
          }));
          products.push({ id: productId, title: parseSyliusTitle(html), url, variants });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.logger.warn('korczakisyn.product fetch failed', { url, error: message });
        }
      }
      if (products.length === 0) {
        throw new Error('korczakisyn catalog empty');
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
