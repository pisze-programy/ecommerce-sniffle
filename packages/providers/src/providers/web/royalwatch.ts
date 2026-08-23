import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildProvider } from "../../factory.ts";
import type { Catalog, Money, Product, Variant } from "../../types.ts";
import type { Logger } from "../../logger.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "royalwatch"), "config royalwatch");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CONCURRENCY = 6;
const RETRY_LIMIT = 40;
const RETRY_DELAY_MS = 300;

export function decodeHtml(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const pattern = /<loc>([^<]+)<\/loc>/g;
  for (const match of xml.matchAll(pattern)) {
    const url = match[1];
    if (url !== undefined && url.includes("/produkt/")) {
      urls.push(url);
    }
  }
  return urls;
}

export interface OfferInfo {
  readonly price: number | null;
  readonly available: boolean | null;
}

export function parseOffer(html: string): OfferInfo {
  const priceMatch = /"@type":\s*"Offer",\s*"price":\s*"([\d.]+)"/.exec(html);
  let price: number | null = null;
  if (priceMatch !== null) {
    const value = Number.parseFloat(priceMatch[1] ?? "");
    price = Number.isNaN(value) ? null : value;
  }
  const availMatch = /"availability":\s*"[^"]*\/(InStock|OutOfStock)"/.exec(html);
  let available: boolean | null = null;
  if (availMatch !== null) {
    available = (availMatch[1] ?? "") === "InStock";
  }
  return { price, available };
}

export interface StockInfo {
  readonly quantity: number | null;
  readonly available: boolean;
}

export function parseStockBlock(html: string): StockInfo {
  const match = /<p class="stock\s+([a-z-]+)"[^>]*>\s*([^<]*)\s*<\/p>/.exec(html);
  if (match === null) {
    return { quantity: null, available: false };
  }
  const stockClass = match[1] ?? "";
  const text = match[2] ?? "";
  const quantityMatch = /(\d+)/.exec(text);
  const quantity = quantityMatch === null ? null : Number(quantityMatch[1]);
  return { quantity, available: stockClass.includes("in-stock") };
}

function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseProduct(html: string, url: string): Product | null {
  const offer = parseOffer(html);
  const stock = parseStockBlock(html);
  if (offer.price === null) {
    return null;
  }
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title = titleMatch === null ? url : decodeHtml(titleMatch[1] ?? "").trim();
  const available = stock.available ? true : offer.available === true;
  const quantity = stock.quantity !== null ? stock.quantity : available ? 1 : 0;
  const variants: Variant[] = [
    {
      id: `${url}#default`,
      title: "default",
      sku: null,
      price: money(offer.price),
      regularPrice: null,
      available,
      quantity,
    },
  ];
  return { id: url, title, url, variants };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.text();
}

async function fetchAllProducts(
  urls: readonly string[],
  logger: Logger,
): Promise<Product[]> {
  const products: Product[] = [];
  const failed: string[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= urls.length) {
        return;
      }
      const url = urls[index];
      if (url === undefined) {
        return;
      }
      try {
        const html = await fetchText(url);
        const product = parseProduct(html, url);
        if (product === null) {
          failed.push(url);
          continue;
        }
        products.push(product);
      } catch (error: unknown) {
        failed.push(url);
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("royalwatch.product fetch failed", { url, error: message });
      }
    }
  }
  const workers: Promise<void>[] = [];
  const count = Math.min(CONCURRENCY, urls.length);
  for (let i = 0; i < count; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  let retried = 0;
  for (const url of failed) {
    if (retried >= RETRY_LIMIT) {
      logger.warn("royalwatch.retry limit reached", { skipped: failed.length - retried });
      break;
    }
    retried += 1;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      const html = await fetchText(url);
      const product = parseProduct(html, url);
      if (product !== null) {
        products.push(product);
        continue;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("royalwatch.product retry failed", { url, error: message });
      continue;
    }
    logger.warn("royalwatch.product retry failed", { url });
  }
  return products;
}

export const royalwatchModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const xml = await fetchText(config.endpoint);
      const urls = parseSitemapUrls(xml);
      const products = await fetchAllProducts(urls, deps.logger);
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
