import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildProvider } from "../../factory.ts";
import type { Catalog, Money, Product, Variant } from "../../types.ts";
import type { Logger } from "../../logger.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "premieresociety"), "config premieresociety");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CONCURRENCY = 6;

export function decodeHtml(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseProductUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pattern = /(?:https:\/\/premieresociety\.com)?(\/pl\/[a-z0-9-]+\/\d+-[a-z0-9-]+\.html)/g;
  for (const match of html.matchAll(pattern)) {
    const path = match[1];
    if (path !== undefined && !seen.has(path)) {
      seen.add(path);
      urls.push(`https://premieresociety.com${path}`);
    }
  }
  return urls;
}

export interface PrestaProductInfo {
  readonly quantity: number | null;
  readonly price: number | null;
  readonly available: boolean | null;
}

export function parseProductInfo(html: string): PrestaProductInfo {
  const qtyMatch = /name="stripe_product_quantity"[^>]*value="(\d+)"/.exec(html);
  let quantity: number | null = null;
  if (qtyMatch !== null) {
    quantity = Number(qtyMatch[1]);
  }
  const priceMatch = /"price": ?"([\d.]+)"/.exec(html);
  let price: number | null = null;
  if (priceMatch !== null) {
    const value = Number.parseFloat(priceMatch[1] ?? "");
    price = Number.isNaN(value) ? null : value;
  }
  const availMatch = /schema\.org\/(InStock|OutOfStock)/.exec(html);
  let available: boolean | null = null;
  if (availMatch !== null) {
    available = (availMatch[1] ?? "") === "InStock";
  }
  return { quantity, price, available };
}

export function productAndVariantIds(url: string): { productId: string; variantId: string } {
  const path = new URL(url).pathname;
  const last = path.split("/").pop() ?? "";
  const first = last.split("-")[0] ?? "";
  const digits = first.replace(/\D/g, "");
  if (digits.length === 0) {
    return { productId: url, variantId: url };
  }
  return { productId: digits, variantId: url };
}

function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseProduct(html: string, url: string, logger: Logger): Product | null {
  const info = parseProductInfo(html);
  if (info.quantity === null || info.price === null) {
    logger.warn("premieresociety.product parse failed", { url });
    return null;
  }
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title = titleMatch === null ? url : decodeHtml(titleMatch[1] ?? "").trim();
  const ids = productAndVariantIds(url);
  const variants: Variant[] = [
    {
      id: ids.variantId,
      title: "default",
      sku: null,
      price: money(info.price),
      regularPrice: null,
      available: info.available === null ? info.quantity > 0 : info.available,
      quantity: info.quantity,
    },
  ];
  return { id: ids.productId, title, url, variants };
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
        const product = parseProduct(html, url, logger);
        if (product !== null) {
          products.push(product);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("premieresociety.product fetch failed", { url, error: message });
      }
    }
  }
  const workers: Promise<void>[] = [];
  const count = Math.min(CONCURRENCY, urls.length);
  for (let i = 0; i < count; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return products;
}

export const premieresocietyModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const categoryHtml = await fetchText(config.endpoint);
      const urls = parseProductUrls(categoryHtml);
      const products = await fetchAllProducts(urls, deps.logger);
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
