import { buildProvider } from "../../factory.ts";
import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { DirectFetch, ProviderModule } from "../../module.ts";
import type { Logger } from "../../logger.ts";
import type { Catalog, Product, Provider, ProviderConfig, Variant } from "../../types.ts";
import { fetchShopifyCatalog } from "./adapter.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "noo-ma"), "config noo-ma");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseNooMaVariantQuantity(html: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const pattern = /variant:\s*\{\s*id:\s*(\d+)[\s\S]*?inventory_quantity:\s*(-?\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const quantity = match[2];
    if (id !== undefined && quantity !== undefined) {
      map.set(id, Number(quantity));
    }
  }
  return map;
}

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
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

async function enrichVariants(
  products: readonly Product[],
  domain: string,
  logger: Logger,
  fetchFn: CatalogFetch,
  ratePerSecond: number,
): Promise<Product[]> {
  const result: Product[] = [];
  const waitMs = ratePerSecond > 0 ? Math.round(1000 / ratePerSecond) : 0;
  let first = true;
  for (const product of products) {
    const handle = product.url.split("/products/")[1] ?? "";
    const variants: Variant[] = [];
    for (const variant of product.variants) {
      if (waitMs > 0 && !first) {
        await delayMs(waitMs);
      }
      first = false;
      try {
        const url = `https://${domain}/products/${handle}?variant=${variant.id}`;
        const html = await fetchText(url, fetchFn);
        const inventory = parseNooMaVariantQuantity(html);
        const quantity = inventory.get(variant.id);
        if (quantity === undefined) {
          variants.push(variant);
          continue;
        }
        const normalized = quantity < 0 ? 1 : quantity;
        variants.push({ ...variant, quantity: normalized, available: normalized > 0 });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("noo.variant fetch failed", {
          productId: product.id,
          variantId: variant.id,
          error: message,
        });
        variants.push(variant);
      }
    }
    result.push({ ...product, variants });
  }
  return result;
}

export function buildNooMaProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch,
): Provider {
  const catalogFetch = (url: string, init?: RequestInit) => {
    if (directFetch !== undefined) {
      return directFetch(url, init);
    }
    return fetch(url, init);
  };
  return buildProvider(providerConfig, logger, async (): Promise<Catalog> => {
    const catalog = await fetchShopifyCatalog(providerConfig.endpoint, providerConfig.domain, logger, catalogFetch);
    const products = await enrichVariants(
      catalog.products,
      providerConfig.domain,
      logger,
      catalogFetch,
      providerConfig.ratePerSecond,
    );
    return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
  });
}

export const nooMaModule: ProviderModule = {
  config,
  build(deps) {
    return buildNooMaProvider(config, deps.logger, deps.directFetch);
  },
};
