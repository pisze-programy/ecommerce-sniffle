import { buildProvider } from '../../factory.ts';
import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import { measureFetch } from '../../network/manager.ts';
import { mapPool } from '../../network/pool.ts';
import { money } from './cart-reveal.ts';
import { parseEmbeddedPrice, parseEmbeddedQuantity } from './deynncosmetics.ts';
import type { CatalogFetch } from './cart-reveal.ts';
import type { DirectFetch, ProviderModule } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, ProviderConfig, Variant } from '../../types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONCURRENCY = 6;
const MAX_PAGES = 10;

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'zerosklep'),
  'config zerosklep'
);

// The shop reports two quantities in the page config. The plain quantity
// is the default combination (a size). The all-versions quantity is the
// total across the sizes. Use the total. It is the real sellable stock.
export function parseQuantityAll(html: string): number | null {
  const match = /&quot;quantity_all_versions&quot;:(\d+)/.exec(html);
  if (match !== null && match[1] !== undefined) {
    return Number(match[1]);
  }
  return parseEmbeddedQuantity(html);
}

export function parseZeroProductId(html: string): string | null {
  const match = /&quot;id&quot;:(\d+),&quot;id_product&quot;/.exec(html);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1];
}

function slugTitle(url: string): string {
  const match = /\/([^/]+)\.html$/.exec(url);
  if (match === null || match[1] === undefined) {
    return url;
  }
  return match[1].replace(/-/g, ' ');
}

export function extractZeroProductUrls(html: string, base: string): readonly string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href="(https:\/\/[^"]+?\/[^"]+\.html)"/g)) {
    const href = match[1];
    if (href !== undefined && href.startsWith(base)) {
      urls.add(href);
    }
  }
  return [...urls];
}

function makeFetch(providerConfig: ProviderConfig, logger: Logger, directFetch?: DirectFetch): CatalogFetch {
  const rawFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  return measureFetch(rawFetch, logger, providerConfig.id, 'direct');
}

async function fetchText(url: string, fetchFn: CatalogFetch): Promise<string> {
  const response = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pl-PL' } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.text();
}

function applyZeroStock(product: Product, html: string): Product {
  const base = product.variants[0];
  if (base === undefined) {
    return product;
  }
  const quantity = parseQuantityAll(html);
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

export const zerosklepModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const fetchFn = makeFetch(config, deps.logger, deps.directFetch);
      const base = `https://${config.domain}`;
      const productUrls = new Set<string>();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = `${base}/wszystkie-produkty${page > 1 ? `?page=${page}` : ''}`;
        const html = await fetchText(url, fetchFn);
        const before = productUrls.size;
        for (const productUrl of extractZeroProductUrls(html, base)) {
          productUrls.add(productUrl);
        }
        if (productUrls.size === before) {
          break;
        }
      }
      const products = await mapPool([...productUrls], CONCURRENCY, async (url) => {
        try {
          const html = await fetchText(url, fetchFn);
          const id = parseZeroProductId(html);
          if (id === null) {
            deps.logger.warn('zerosklep.no product id', { url });
            return null;
          }
          const variants: Variant[] = [
            { id, title: 'default', sku: null, price: money(0), regularPrice: null, available: true, quantity: null },
          ];
          return applyZeroStock({ id, title: slugTitle(url), url, variants }, html);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.logger.warn('zerosklep.product fetch failed', { url, error: message });
          return null;
        }
      });
      const list = products.filter((product): product is Product => product !== null);
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products: list };
    });
  },
};
