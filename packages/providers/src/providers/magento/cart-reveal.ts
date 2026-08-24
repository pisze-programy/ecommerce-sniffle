import { buildStockRevealer } from "../../factory.ts";
import type { DirectFetch } from "../../module.ts";
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

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PROBE_QUANTITY = "999999";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseUrl(providerConfig: ProviderConfig): string {
  return `https://${providerConfig.domain}`;
}

export function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseMagentoCartQty(text: string): number | null {
  const match = /name="cart\[\d+\]\[qty\]"[^>]*value="(\d+)"/.exec(text);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const parsed = Number(match[1]);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

export function extractMagentoFormKey(html: string): string | null {
  const match = /name="form_key"[^>]*value="([^"]+)"/.exec(html);
  return match === null ? null : (match[1] ?? null);
}

export function extractMagentoProductId(html: string): string | null {
  const match = /data-product-id="(\d+)"/.exec(html);
  return match === null ? null : (match[1] ?? null);
}

export function extractMagentoAddUrl(html: string, domain: string): string | null {
  const match = /action="([^"]*\/checkout\/cart\/add\/[^"]*)"/.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const url = match[1];
  return url.startsWith("http") ? url : `https://${domain}${url}`;
}

export function extractMagentoConfigurableOption(html: string): Record<string, string> | null {
  const index = /"index":\{(\d+):\{"(\d+)":"(\d+)"\}?\}/.exec(html);
  if (index === null || index[2] === undefined || index[3] === undefined) {
    return null;
  }
  return { [`super_attribute[${index[2]}]`]: index[3] };
}

export function extractMagentoHandle(url: string): string {
  const match = /https:\/\/[^/]+\/([a-z0-9-]+)$/.exec(url);
  if (match === null || match[1] === undefined) {
    return url;
  }
  return match[1];
}

type CatalogFetch = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

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

async function discoverCategories(
  base: string,
  fetchFn: CatalogFetch,
  logger: Logger,
): Promise<string[]> {
  const html = await fetchText(`${base}/`, fetchFn);
  const categories = new Set<string>();
  for (const match of html.matchAll(/href="https:\/\/[^/]+\/([a-z0-9-]+)"/g)) {
    const category = match[1];
    if (category !== undefined && /^(?:akcesoria|gora|dol|gadzety|kolekcje|rozmiar|sklep)/.test(category)) {
      categories.add(`/${category}`);
    }
  }
  const list = [...categories];
  if (list.length === 0) {
    logger.warn("magento.catalog no categories", { domain: base });
  }
  return list;
}

async function fetchProductUrls(
  base: string,
  category: string,
  fetchFn: CatalogFetch,
): Promise<string[]> {
  const html = await fetchText(`${base}${category}`, fetchFn);
  const urls: string[] = [];
  const seen = new Set<string>();
  const skip = /(akcesoria|dodatki|dol|gadzety|gora|kolekcje|dostawa|kontakt|polityka|regulamin|zwroty|reklamacje|nowosci|checkout|customer|media|sklep|o-nas|koszyk)/;
  for (const match of html.matchAll(/href="(https:\/\/[^/]+\/[a-z0-9-]+)"/g)) {
    const url = match[1];
    if (url === undefined) {
      continue;
    }
    const path = url.replace(/^https:\/\/[^/]+/, "").replace(/^\//, "");
    if (skip.test(path) || path.includes("/")) {
      continue;
    }
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

async function buildCatalog(
  providerConfig: ProviderConfig,
  logger: Logger,
  fetchFn: CatalogFetch,
): Promise<Catalog> {
  const base = baseUrl(providerConfig);
  const categories = await discoverCategories(base, fetchFn, logger);
  const products: Product[] = [];
  for (const category of categories) {
    const urls = await fetchProductUrls(base, category, fetchFn);
    for (const url of urls) {
      const variants: Variant[] = [
        {
          id: extractMagentoHandle(url),
          title: "default",
          sku: null,
          price: money(0),
          regularPrice: null,
          available: true,
          quantity: null,
        },
      ];
      products.push({ id: extractMagentoHandle(url), title: extractMagentoHandle(url), url, variants });
    }
  }
  logger.debug("magento catalog fetched", { domain: providerConfig.domain, products: products.length });
  return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
}

export function buildMagentoCartRevealProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch,
): StockRevealer {
  const base = baseUrl(providerConfig);
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
      const sessionHtml = await fetch(`${catalog.products[0]?.url ?? base}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      await sessionHtml.text();
      const setCookie = sessionHtml.headers.get("set-cookie");
      const cookie = setCookie === null ? null : /(?:PHPSESSID|X-Magento-Vary)=[^;]+/.exec(setCookie)?.[0] ?? null;
      const revealed: Product[] = [];
      for (const product of catalog.products) {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          revealed.push(product);
          continue;
        }
        try {
          const page = await fetchText(product.url, catalogFetch);
          const pid = extractMagentoProductId(page);
          const formKey = extractMagentoFormKey(page);
          const addUrl = extractMagentoAddUrl(page, providerConfig.domain);
          if (pid === null || formKey === null || addUrl === null) {
            logger.warn("magento.reveal missing form data", { productId: product.id });
            revealed.push(product);
            continue;
          }
          const option = extractMagentoConfigurableOption(page);
          const body = new URLSearchParams();
          body.set("product", pid);
          body.set("qty", PROBE_QUANTITY);
          body.set("form_key", formKey);
          if (option !== null) {
            for (const [key, value] of Object.entries(option)) {
              body.set(key, value);
            }
          }
          const response = await fetch(addUrl, {
            method: "POST",
            headers: {
              "User-Agent": USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
              ...(cookie !== null ? { Cookie: cookie } : {}),
            },
            body: body.toString(),
            redirect: "follow",
          });
          const text = await response.text();
          const quantity = parseMagentoCartQty(text);
          const baseVariant = product.variants[0];
          if (baseVariant === undefined || quantity === null) {
            logger.warn("magento.reveal no quantity", { productId: product.id });
            revealed.push(product);
            continue;
          }
          revealed.push({
            ...product,
            variants: [{ ...baseVariant, id: pid, quantity, available: quantity > 0 }],
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("magento.reveal failed", { productId: product.id, error: message });
          revealed.push(product);
        }
      }
      return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products: revealed };
    },
  );
}
