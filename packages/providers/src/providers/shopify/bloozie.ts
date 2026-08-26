import { buildProvider } from '../../factory.ts';
import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import { BROWSER_HEADERS } from '../../browser-headers.ts';
import type { DirectFetch, DirectFetchOptions, ProviderModule } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../types.ts';
import { fetchShopifyCatalog } from './implementations/adapter.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'bloozie'),
  'config bloozie'
);

const BASE_URL = 'https://www.bloozie.pl';
const PAGE_ABORT_BYTES = 220_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export interface DataVariant {
  readonly id: string;
  readonly available: boolean;
  readonly quantity: number;
}

export function parseDataVariants(html: string): readonly DataVariant[] {
  const match = /data-variants="([^"]*)"/.exec(html);
  if (match === null) {
    return [];
  }
  const decoded = match[1] === undefined ? '' : match[1].replace(/&quot;/g, '"');
  let data: unknown;
  try {
    data = JSON.parse(decoded);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const result: DataVariant[] = [];
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const id = (entry as Readonly<Record<string, unknown>>)['id'];
    const available = (entry as Readonly<Record<string, unknown>>)['available'];
    const quantity = (entry as Readonly<Record<string, unknown>>)['inventory_quantity'];
    if (typeof id !== 'string') {
      continue;
    }
    const parsedQuantity = typeof quantity === 'number' ? quantity : Number(quantity);
    if (Number.isNaN(parsedQuantity)) {
      continue;
    }
    result.push({
      id,
      available: available === true || available === 'true',
      quantity: parsedQuantity,
    });
  }
  return result;
}

type CatalogFetch = (
  url: string,
  init?: RequestInit,
  options?: DirectFetchOptions
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

async function fetchProductPage(url: string, fetchFn: CatalogFetch): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetchFn(url, { headers: { ...BROWSER_HEADERS } }, { maxBytes: PAGE_ABORT_BYTES });
    if (response.ok) {
      return response.text();
    }
    if ((response.status === 429 || response.status === 403 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

export function buildBloozieProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch
): Provider {
  const fetchFn: CatalogFetch = (url, init, options) => {
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  return buildProvider(providerConfig, logger, async (): Promise<Catalog> => {
    const catalog = await fetchShopifyCatalog(providerConfig.endpoint, providerConfig.domain, logger, fetchFn);
    const products: Product[] = [];
    for (const product of catalog.products) {
      try {
        const handle = product.url.split('/products/')[1] ?? '';
        const html = await fetchProductPage(`${BASE_URL}/products/${handle}`, fetchFn);
        const parsed = parseDataVariants(html);
        const byId = new Map(parsed.map((entry) => [entry.id, entry]));
        const variants: Variant[] = product.variants.map((variant) => {
          const entry = byId.get(variant.id);
          if (entry === undefined) {
            return variant;
          }
          return {
            ...variant,
            quantity: entry.quantity,
            available: entry.available,
          };
        });
        products.push({ ...product, variants });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('bloozie.product fetch failed', { productId: product.id, error: message });
        products.push(product);
      }
    }
    logger.debug('bloozie catalog fetched', { domain: providerConfig.domain, products: products.length });
    return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products };
  });
}

export const bloozieModule: ProviderModule = {
  config,
  build(deps) {
    return buildBloozieProvider(config, deps.logger, deps.directFetch);
  },
};
