import { buildProvider } from '../../factory.ts';
import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import { measureFetch } from '../../network/manager.ts';
import { mapPool } from '../../network/pool.ts';
import { buildCatalog, money } from './cart-reveal.ts';
import type { CatalogFetch } from './cart-reveal.ts';
import type { DirectFetch, ProviderModule } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, ProviderConfig, Variant } from '../../types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONCURRENCY = 6;

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'deynncosmetics'),
  'config deynncosmetics'
);

// The shop embeds the exact stock in the page config. The HTML escapes
// the quotes. The raw "quantity":1 fields belong to the related product
// blocks. Never parse those.
export function parseEmbeddedQuantity(html: string): number | null {
  const match = /&quot;quantity&quot;:(\d+)/.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return Number(match[1]);
}

export function parseEmbeddedPrice(html: string): number | null {
  const match = /&quot;price_amount&quot;:([0-9.]+)/.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return Number(match[1]);
}

function applyEmbeddedStock(product: Product, html: string): Product {
  const base = product.variants[0];
  if (base === undefined) {
    return product;
  }
  const quantity = parseEmbeddedQuantity(html);
  if (quantity === null) {
    return product;
  }
  const price = parseEmbeddedPrice(html);
  const variants: Variant[] = [
    {
      ...base,
      quantity,
      available: quantity > 0,
      price: price === null ? base.price : money(price),
    },
  ];
  return { ...product, variants };
}

function buildDeynnCatalog(providerConfig: ProviderConfig, logger: Logger, directFetch?: DirectFetch): CatalogFetch {
  const rawFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  return measureFetch(rawFetch, logger, providerConfig.id, 'direct');
}

export const deynncosmeticsModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const fetchFn = buildDeynnCatalog(config, deps.logger, deps.directFetch);
      const catalog = await buildCatalog(config, deps.logger, fetchFn);
      const products = await mapPool(catalog.products, CONCURRENCY, async (product) => {
        try {
          const response = await fetchFn(product.url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pl-PL' },
          });
          const html = await response.text();
          return applyEmbeddedStock(product, html);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.logger.warn('deynn.product fetch failed', { url: product.url, error: message });
          return product;
        }
      });
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
