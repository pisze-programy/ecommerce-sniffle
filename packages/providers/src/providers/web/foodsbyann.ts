import { buildProvider } from "../../factory.ts";
import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import type { Catalog, Money, Product, Variant } from "../../types.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "foodsbyann"), "config foodsbyann");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface IdoSellSize {
  readonly id: string;
  readonly amount: number;
}

export function parseIdoSellSizes(html: string): readonly IdoSellSize[] {
  const sizes: IdoSellSize[] = [];
  const entry = /"([a-zA-Z0-9_]+)"\s*:\s*\{\s*"type":"[^"]*"[^}]*?"amount":(\d+)/g;
  for (const match of html.matchAll(entry)) {
    const id = match[1];
    const amount = match[2];
    if (id !== undefined && amount !== undefined) {
      sizes.push({ id, amount: Number(amount) });
    }
  }
  return sizes;
}

export function parseIdoSellProductId(url: string): string {
  const match = /product-pol-(\d+)/.exec(url);
  if (match !== null) {
    return match[1] ?? url;
  }
  return url;
}

export function parseIdoSellPrice(html: string): number {
  const match = /"price":"(\d+(?:\.\d+)?)"/.exec(html);
  if (match !== null) {
    const value = Number(match[1]);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return 0;
}

export function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

async function fetchBody(url: string): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) {
      if (url.endsWith(".gz")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        try {
          const { gunzipSync } = await import("node:zlib");
          return gunzipSync(buffer).toString("utf8");
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`gunzip failed for ${url}: ${message}`);
        }
      }
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

async function fetchSitemapUrls(): Promise<string[]> {
  const urls: string[] = [];
  const queue = [config.endpoint];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const url = queue.shift();
    if (url === undefined || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const body = await fetchBody(url);
    for (const match of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = match[1];
      if (loc === undefined) {
        continue;
      }
      if (loc.includes("product-pol-")) {
        urls.push(loc);
      } else if (loc.includes("sitemap")) {
        queue.push(loc);
      }
    }
  }
  return urls;
}

export const foodsbyannModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const urls = await fetchSitemapUrls();
      const products: Product[] = [];
      const waitMs = config.ratePerSecond > 0 ? Math.round(1000 / config.ratePerSecond) : 0;
      let first = true;
      for (const url of urls) {
        if (waitMs > 0 && !first) {
          await delayMs(waitMs);
        }
        first = false;
        try {
          const html = await fetchBody(url);
          const sizes = parseIdoSellSizes(html);
          if (sizes.length === 0) {
            deps.logger.warn("foodsbyann.product no sizes", { url });
            continue;
          }
          const productId = parseIdoSellProductId(url);
          const title = /<title>([^<]+)/.exec(html)?.[1]?.trim() ?? productId;
          const priceAmount = parseIdoSellPrice(html);
          const variants: Variant[] = sizes.map((size) => ({
            id: `${productId}-${size.id}`,
            title: size.id,
            sku: null,
            price: money(priceAmount),
            regularPrice: null,
            available: size.amount > 0,
            quantity: size.amount,
          }));
          products.push({ id: productId, title, url, variants });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.logger.warn("foodsbyann.product fetch failed", { url, error: message });
        }
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
