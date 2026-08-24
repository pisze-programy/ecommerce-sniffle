import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildProvider } from "../../factory.ts";
import type { Catalog, Money, Product, Variant } from "../../types.ts";
import type { Logger } from "../../logger.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "dobrerzeczy"), "config dobrerzeczy");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_DEPTH = 50;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

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

export function parseNuxtPayload(html: string, logger?: Logger): readonly unknown[] | null {
  const match = /<script[^>]*__NUXT_DATA__[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (match === null) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? "");
  } catch (error: unknown) {
    if (logger !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("dobrerzeczy.nuxt payload parse failed", { error: message });
    }
    return null;
  }
  if (!Array.isArray(data)) {
    return null;
  }
  return data;
}

function deref(payload: readonly unknown[], node: unknown): unknown {
  if (typeof node === "number" && node >= 0 && node < payload.length) {
    return payload[node];
  }
  return node;
}

function isProductObject(obj: Readonly<Record<string, unknown>>): boolean {
  return "_id" in obj && "price" in obj && "sizes" in obj && "slug" in obj;
}

export function findProduct(
  payload: readonly unknown[],
): Readonly<Record<string, unknown>> | null {
  const visited = new Set<number>();
  function walk(node: unknown, depth: number): Readonly<Record<string, unknown>> | null {
    if (depth > MAX_DEPTH) {
      return null;
    }
    if (typeof node === "number") {
      if (node < 0 || node >= payload.length) {
        return null;
      }
      if (visited.has(node)) {
        return null;
      }
      visited.add(node);
      return walk(payload[node], depth + 1);
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found !== null) {
          return found;
        }
      }
      return null;
    }
    if (typeof node === "object" && node !== null) {
      const obj = node as Readonly<Record<string, unknown>>;
      if (isProductObject(obj)) {
        return obj;
      }
      for (const value of Object.values(obj)) {
        const found = walk(value, depth + 1);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  }
  return walk(payload[0], 0);
}

function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseProduct(html: string, url: string, logger: Logger): Product | null {
  const payload = parseNuxtPayload(html, logger);
  if (payload === null) {
    logger.warn("dobrerzeczy.nuxt payload missing", { url });
    return null;
  }
  const product = findProduct(payload);
  if (product === null) {
    logger.warn("dobrerzeczy.product not found in payload", { url });
    return null;
  }
  const rawId = deref(payload, product["_id"]);
  const id = typeof rawId === "string" ? rawId : url;
  const rawTitle = deref(payload, product["name"]);
  const title = typeof rawTitle === "string" ? rawTitle : url;
  const rawPrice = deref(payload, product["price"]);
  const price = typeof rawPrice === "number" ? rawPrice : 0;
  const rawPreorder = deref(payload, product["isPreorder"]);
  const isPreorder = rawPreorder === true;
  const rawSizes = deref(payload, product["sizes"]);
  const variants: Variant[] = [];
  if (Array.isArray(rawSizes)) {
    for (const ref of rawSizes) {
      const rawEntry = deref(payload, ref);
      if (typeof rawEntry !== "object" || rawEntry === null) {
        continue;
      }
      const entry = rawEntry as Readonly<Record<string, unknown>>;
      const rawSize = deref(payload, entry["size"]);
      const sizeName =
        typeof rawSize === "object" && rawSize !== null
          ? deref(payload, (rawSize as Readonly<Record<string, unknown>>)["name"])
          : null;
      const rawSizeId = deref(payload, entry["_id"]);
      const rawStock = deref(payload, entry["stock"]);
      const stock = typeof rawStock === "number" ? rawStock : null;
      const available = isPreorder ? true : stock !== null && stock > 0;
      variants.push({
        id: typeof rawSizeId === "string" ? rawSizeId : `${id}-${String(variants.length)}`,
        title: typeof sizeName === "string" ? sizeName : "default",
        sku: null,
        price: money(price),
        regularPrice: null,
        available,
        quantity: isPreorder ? 1 : stock,
      });
    }
  }
  if (variants.length === 0) {
    logger.warn("dobrerzeczy.product has no sizes", { url });
    return null;
  }
  return { id, title, url, variants };
}

async function fetchText(url: string, notFoundAllowed = false): Promise<string | null> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) {
      return response.text();
    }
    if (response.status === 429 || response.status === 403 || response.status >= 500) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
    }
    if (response.status === 404 && notFoundAllowed) {
      return null;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

export const dobrerzeczyModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const xml = (await fetchText(config.endpoint)) ?? "";
      const urls = parseSitemapUrls(xml);
      if (urls.length === 0) {
        throw new Error("dobrerzeczy sitemap empty");
      }
      const products: Product[] = [];
      for (const url of urls) {
        const html = await fetchText(url, true);
        if (html === null) {
          deps.logger.warn("dobrerzeczy.product missing", { url });
          continue;
        }
        const product = parseProduct(html, url, deps.logger);
        if (product !== null) {
          products.push(product);
        }
      }
      if (products.length === 0) {
        throw new Error("dobrerzeczy catalog empty");
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
