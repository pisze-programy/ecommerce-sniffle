import { buildStockRevealer } from "../../factory.ts";
import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { DirectFetch, ProviderModule } from "../../module.ts";
import type { Logger } from "../../logger.ts";
import type {
  Catalog,
  Money,
  Product,
  ProviderConfig,
  StockRevealTarget,
  StockRevealer,
  Variant,
} from "../../types.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "laboratoriumpanidomu"), "config laboratoriumpanidomu");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE_URL = "https://laboratoriumpanidomu.pl";
const PROBE_QUANTITY = "999999999";
const MAX_PAGES = 20;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function extractPrestaProductId(url: string): string | null {
  const match = /\/(\d+)-[^/]+\.html$/.exec(url);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

export function extractPrestaToken(html: string): string | null {
  const match = /<input type="hidden" name="token" value="([^"]+)"/.exec(html);
  return match === null ? null : (match[1] ?? null);
}

export function extractCookies(setCookie: string | null): string | null {
  if (setCookie === null) {
    return null;
  }
  const pairs: string[] = [];
  for (const part of setCookie.split(",")) {
    const match = /^\s*([^=;]+=[^;]+)/.exec(part);
    const value = match === null ? undefined : match[1];
    if (value !== undefined) {
      pairs.push(value);
    }
  }
  if (pairs.length === 0) {
    return null;
  }
  return pairs.join("; ");
}

export function parsePrestaCartQuantity(text: string): number | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const clamp = /Możesz kupić tylko ([\d\s]+) sztuk/.exec(JSON.stringify(obj));
  if (clamp !== null && clamp[1] !== undefined) {
    const parsed = Number(clamp[1]?.replace(/\s/g, ""));
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const cart = obj["cart"];
  if (typeof cart !== "object" || cart === null) {
    return null;
  }
  const products = (cart as Readonly<Record<string, unknown>>)["products"];
  if (!Array.isArray(products)) {
    return null;
  }
  const first = products[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }
  const quantity = (first as Readonly<Record<string, unknown>>)["quantity"];
  if (typeof quantity === "number") {
    return quantity;
  }
  return null;
}

export function parsePrestaCartPrice(text: string): number | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const cart = (data as Readonly<Record<string, unknown>>)["cart"];
  if (typeof cart !== "object" || cart === null) {
    return null;
  }
  const products = (cart as Readonly<Record<string, unknown>>)["products"];
  if (!Array.isArray(products)) {
    return null;
  }
  const first = products[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }
  const price = (first as Readonly<Record<string, unknown>>)["price"];
  if (typeof price === "number") {
    return price;
  }
  return null;
}

export function extractPrestaTitle(url: string): string {
  const match = /\/(?:\d+)-([^/]+)\.html$/.exec(url);
  if (match === null || match[1] === undefined) {
    return url;
  }
  return match[1].replace(/-/g, " ");
}

type CatalogFetch = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

async function fetchText(url: string, fetchFn: CatalogFetch): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "pl-PL" },
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

async function discoverCategories(
  fetchFn: CatalogFetch,
  logger: Logger,
): Promise<string[]> {
  const html = await fetchText(`${BASE_URL}/`, fetchFn);
  const categories = new Set<string>();
  for (const match of html.matchAll(/href="\/(\d+-[^"?]+)"/g)) {
    const category = match[1];
    if (category !== undefined) {
      categories.add(`/${category}`);
    }
  }
  const list = [...categories];
  if (list.length === 0) {
    logger.warn("presta.catalog no categories found", { domain: config.domain });
  }
  return list;
}

async function fetchProductUrls(
  category: string,
  ratePerSecond: number,
  fetchFn: CatalogFetch,
): Promise<string[]> {
  const urls: string[] = [];
  const waitMs = ratePerSecond > 0 ? Math.round(1000 / ratePerSecond) : 0;
  let first = true;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (waitMs > 0 && !first) {
      await delayMs(waitMs);
    }
    first = false;
    const url = `${BASE_URL}${category}${page > 1 ? `?page=${page}` : ""}`;
    const html = await fetchText(url, fetchFn);
    let added = 0;
    for (const match of html.matchAll(/href="([^"]*\/\d+-[^"#?]*\.html)"/g)) {
      const href = match[1];
      if (href === undefined) {
        continue;
      }
      const full = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (!urls.includes(full)) {
        urls.push(full);
        added += 1;
      }
    }
    if (added === 0) {
      break;
    }
  }
  return urls;
}

async function buildCatalog(
  providerConfig: ProviderConfig,
  logger: Logger,
  fetchFn: CatalogFetch,
): Promise<Catalog> {
  const categories = await discoverCategories(fetchFn, logger);
  const products: Product[] = [];
  const seen = new Set<string>();
  for (const category of categories) {
    const urls = await fetchProductUrls(category, providerConfig.ratePerSecond, fetchFn);
    for (const url of urls) {
      const id = extractPrestaProductId(url);
      if (id === null) {
        continue;
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const variants: Variant[] = [
        {
          id,
          title: "default",
          sku: null,
          price: money(0),
          regularPrice: null,
          available: true,
          quantity: null,
        },
      ];
      products.push({ id, title: extractPrestaTitle(url), url, variants });
    }
  }
  logger.debug("presta catalog fetched", { domain: providerConfig.domain, products: products.length });
  return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
}

export function buildLaboratoriumPaniDomuProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch,
): StockRevealer {
  const catalogFetch = (url: string, init?: RequestInit) => {
    if (directFetch !== undefined) {
      return directFetch(url, init);
    }
    return fetch(url, init);
  };
  return buildStockRevealer(
    providerConfig,
    logger,
    async (): Promise<Catalog> => buildCatalog(providerConfig, logger, catalogFetch),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await buildCatalog(providerConfig, logger, catalogFetch);
      const wanted = new Set<string>(target.productIds);
      if (catalog.products.length === 0) {
        return catalog;
      }
      const sessionHtml = await fetch(`${catalog.products[0]?.url ?? BASE_URL}`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "pl-PL" },
      });
      const sessionText = await sessionHtml.text();
      const cookies = extractCookies(sessionHtml.headers.get("set-cookie"));
      const token = extractPrestaToken(sessionText);
      if (token === null) {
        logger.warn("presta.reveal no token", { domain: providerConfig.domain });
        return catalog;
      }
      const headers: Readonly<Record<string, string>> = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pl-PL",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
        ...(cookies !== null ? { Cookie: cookies } : {}),
      };
      const revealedProducts: Product[] = [];
      for (const product of catalog.products) {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          revealedProducts.push(product);
          continue;
        }
        const baseVariant = product.variants[0];
        if (baseVariant === undefined) {
          revealedProducts.push(product);
          continue;
        }
        try {
          const body = new URLSearchParams();
          body.set("token", token);
          body.set("id_product", product.id);
          body.set("id_customization", "0");
          body.set("qty", PROBE_QUANTITY);
          body.set("add", "1");
          body.set("action", "update");
          const response = await fetch(`${BASE_URL}/koszyk`, {
            method: "POST",
            headers,
            body: body.toString(),
          });
          const text = await response.text();
          const quantity = parsePrestaCartQuantity(text);
          const price = parsePrestaCartPrice(text);
          if (quantity === null) {
            logger.warn("presta.reveal no quantity", { productId: product.id, error: text.slice(0, 120) });
            revealedProducts.push(product);
            continue;
          }
          revealedProducts.push({
            ...product,
            variants: [
              { ...baseVariant, quantity, available: quantity > 0, price: money(price ?? 0) },
            ],
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("presta.reveal failed", { productId: product.id, error: message });
          revealedProducts.push(product);
        }
      }
      return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products: revealedProducts };
    },
  );
}

export const laboratoriumpanidomuModule: ProviderModule = {
  config,
  build(deps) {
    return buildLaboratoriumPaniDomuProvider(config, deps.logger, deps.directFetch);
  },
};
