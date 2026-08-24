import { buildProvider } from "../../factory.ts";
import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import type { Logger } from "../../logger.ts";
import type { Catalog, Money, Product, Variant } from "../../types.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "magdabutrym"), "config magdabutrym");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE_URL = "https://www.magdabutrym.com";
const LOCALE = "/pl-en";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseRscQuantityAvailable(html: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const pattern =
    /\\"id\\":\\"gid:\/\/shopify\/ProductVariant\/(\d+)\\",\\"title\\":\\"([^\\"]*)\\",\\"price\\":\\"[^\\"]*\\",\\"quantityAvailable\\":(-?\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const quantity = match[3];
    if (id !== undefined && quantity !== undefined) {
      map.set(id, Number(quantity));
    }
  }
  return map;
}

export function extractHandle(url: string): string | null {
  const match = /\/product\/([^/]+)$/.exec(url);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

async function fetchText(url: string): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en,pl;q=0.9" },
    });
    if (response.ok) {
      return response.text();
    }
    if (
      (response.status === 429 || response.status === 403 || response.status >= 500) &&
      attempt < MAX_ATTEMPTS
    ) {
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

async function fetchProductHandles(logger: Logger): Promise<string[]> {
  const index = await fetchText(`${BASE_URL}/sitemap.xml`);
  const allSitemap = /<loc>([^<]*sitemap-category\/all\.xml[^<]*)<\/loc>/.exec(index);
  const sitemapUrl = allSitemap !== null && allSitemap[1] !== undefined ? allSitemap[1] : `${BASE_URL}/sitemap-category/all.xml`;
  const xml = await fetchText(sitemapUrl);
  const handles: string[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const loc = match[1];
    if (loc === undefined) {
      continue;
    }
    const handle = extractHandle(loc);
    if (handle !== null && !seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  }
  if (handles.length === 0) {
    logger.warn("magdabutrym catalog empty", { domain: config.domain });
  }
  return handles;
}

async function fetchProduct(handle: string): Promise<{
  readonly title: string;
  readonly variants: readonly Variant[];
} | null> {
  const html = await fetchText(`${BASE_URL}${LOCALE}/product/${handle}`);
  const inventory = parseRscQuantityAvailable(html);
  if (inventory.size === 0) {
    return null;
  }
  const titleMatch = /<title>([^<]+)/.exec(html);
  const title = titleMatch !== null && titleMatch[1] !== undefined ? titleMatch[1].trim() : handle;
  const variants: Variant[] = [];
  for (const [id, quantity] of inventory) {
    const normalized = quantity < 0 ? 1 : quantity;
    variants.push({
      id,
      title: "default",
      sku: null,
      price: money(0),
      regularPrice: null,
      available: normalized > 0,
      quantity: normalized,
    });
  }
  return { title, variants };
}

export const magdabutrymModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const handles = await fetchProductHandles(deps.logger);
      const products: Product[] = [];
      const waitMs = config.ratePerSecond > 0 ? Math.round(1000 / config.ratePerSecond) : 0;
      let first = true;
      for (const handle of handles) {
        if (waitMs > 0 && !first) {
          await delayMs(waitMs);
        }
        first = false;
        try {
          const product = await fetchProduct(handle);
          if (product === null) {
            deps.logger.warn("magdabutrym.product no inventory", { handle });
            continue;
          }
          products.push({
            id: handle,
            title: product.title,
            url: `${BASE_URL}${LOCALE}/product/${handle}`,
            variants: product.variants,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.logger.warn("magdabutrym.product fetch failed", { handle, error: message });
        }
      }
      deps.logger.debug("magdabutrym catalog fetched", {
        domain: config.domain,
        handles: handles.length,
        products: products.length,
      });
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
