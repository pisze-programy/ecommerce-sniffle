import { buildProvider } from "../../factory.ts";
import type { DirectFetch } from "../../module.ts";
import type { Logger } from "../../logger.ts";
import type { Catalog, Product, Provider, ProviderConfig, Variant } from "../../types.ts";
import { fetchShopifyCatalog } from "./adapter.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseEmbeddedInventory(
  html: string,
  scriptId: string,
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const pattern = new RegExp(`id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`);
  const match = pattern.exec(html);
  if (match === null) {
    return map;
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? "");
  } catch {
    return map;
  }
  if (!Array.isArray(data)) {
    return map;
  }
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const obj = entry as Readonly<Record<string, unknown>>;
    const id = obj["id"];
    const quantity = obj["inventory_quantity"];
    if ((typeof id === "number" || typeof id === "string") && typeof quantity === "number") {
      map.set(String(id), quantity);
    }
  }
  return map;
}

export function parseBisVariantData(html: string): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, "bis-variant-data");
}

export function parseVariantInventoryData(html: string): ReadonlyMap<string, number> {
  return parseEmbeddedInventory(html, "variantInventoryData");
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
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

async function fetchText(url: string, fetchFn: CatalogFetch): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) {
      return response.text();
    }
    if (
      (response.status === 429 || response.status === 403 || response.status >= 500) &&
      attempt < MAX_ATTEMPTS
    ) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
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
  if (typeof data !== "object" || data === null) {
    return map;
  }
  const variants = (data as Readonly<Record<string, unknown>>)["variants"];
  if (!Array.isArray(variants)) {
    return map;
  }
  for (const entry of variants) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const obj = entry as Readonly<Record<string, unknown>>;
    const id = obj["id"];
    const quantity = obj["inventory_quantity"];
    if ((typeof id === "number" || typeof id === "string") && typeof quantity === "number") {
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
): Promise<Product[]> {
  const result: Product[] = [];
  const waitMs = ratePerSecond > 0 ? Math.round(1000 / ratePerSecond) : 0;
  let first = true;
  for (const product of products) {
    if (waitMs > 0 && !first) {
      await delayMs(waitMs);
    }
    first = false;
    try {
      const html = await fetchText(
        `https://${domain}/products/${product.url.split("/products/")[1] ?? ""}${urlSuffix}`,
        fetchFn,
      );
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
      logger.warn("embedded.product fetch failed", { productId: product.id, error: message });
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
  urlSuffix = "",
): Provider {
  const catalogFetch = (url: string, init?: RequestInit) => {
    if (directFetch !== undefined) {
      return directFetch(url, init);
    }
    return fetch(url, init);
  };
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
    );
    return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
  });
}
