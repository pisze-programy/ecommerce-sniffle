import { buildStockRevealer } from '../../factory.ts';
import { measureFetch } from '../../network/manager.ts';
import { createFreshFetch } from '../../network/fresh-fetch.ts';
import { mapPool } from '../../network/pool.ts';
import { buildCatalog, extractPrestaToken } from './cart-reveal.ts';
import type { CatalogFetch } from './cart-reveal.ts';
import type { DirectFetch } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, ProviderConfig, StockRevealTarget, StockRevealer, Variant } from '../../types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFRESH_CONCURRENCY = 8;

export interface DataStockOutcome {
  readonly quantity: number | null;
  readonly available: boolean;
}

export function parseDataStock(text: string): DataStockOutcome {
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const details = typeof data['product_details'] === 'string' ? data['product_details'] : '';
    const match = /data-stock="(\d+)"/.exec(details);
    if (match !== null) {
      return { quantity: Number(match[1]), available: true };
    }
    if (/Obecnie brak na stanie|out of stock|product-out-of-stock/i.test(text)) {
      return { quantity: 0, available: false };
    }
    return { quantity: null, available: false };
  } catch {
    return { quantity: null, available: false };
  }
}

export async function refreshDataStock(
  domain: string,
  token: string,
  productId: string,
  fetchFn: CatalogFetch
): Promise<DataStockOutcome> {
  const url =
    `https://${domain}/index.php?controller=product&token=${encodeURIComponent(token)}` +
    `&id_product=${productId}&id_customization=0&qty=1`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: `https://${domain}`,
    },
    body: 'quickview=0&ajax=1&action=refresh&quantity_wanted=1',
  });
  const text = await response.text();
  return parseDataStock(text);
}

function applyQuantity(product: Product, quantity: number, available: boolean): Product {
  const base = product.variants[0];
  if (base === undefined) {
    return product;
  }
  const variants: Variant[] = [{ ...base, quantity, available }];
  return { ...product, variants };
}

export function buildPrestaShopDataStockProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  directFetch?: DirectFetch
): StockRevealer {
  const rawCatalogFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const catalogFetch = measureFetch(rawCatalogFetch, logger, providerConfig.id, 'proxy');
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['WEBSHARE_URL'] ?? null;
  const probeFetch = measureFetch(createFreshFetch(proxyUrl), logger, providerConfig.id, 'proxy');
  return buildStockRevealer(
    providerConfig,
    logger,
    async (): Promise<Catalog> => buildCatalog(providerConfig, logger, catalogFetch),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await buildCatalog(providerConfig, logger, catalogFetch);
      const wanted = new Set<string>(target.productIds);
      const excluded = new Set<number>(providerConfig.excludedStockIds ?? []);
      const targets = catalog.products.filter((product) => {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          return false;
        }
        const first = product.variants[0];
        if (first === undefined) {
          return false;
        }
        return !excluded.has(Number(first.id));
      });
      let token: string | null = null;
      const first = targets[0];
      if (first !== undefined) {
        const sessionHtml = await probeFetch(first.url, {
          headers: { 'User-Agent': USER_AGENT },
        });
        const sessionText = await sessionHtml.text();
        token = extractPrestaToken(sessionText);
        if (token === null) {
          logger.warn('presta.datastock no token', { domain: providerConfig.domain });
        }
      }
      const revealed = await mapPool(targets, REFRESH_CONCURRENCY, async (product) => {
        if (token === null) {
          return product;
        }
        const base = product.variants[0];
        if (base === undefined) {
          return product;
        }
        if (!base.available) {
          return applyQuantity(product, 0, false);
        }
        const outcome = await refreshDataStock(providerConfig.domain, token, product.id, probeFetch);
        if (outcome.quantity === null) {
          logger.warn('presta.datastock no quantity', { productId: product.id });
          return product;
        }
        return applyQuantity(product, outcome.quantity, outcome.available);
      });
      return { domain: providerConfig.domain, fetchedAt: new Date().toISOString(), products: revealed };
    }
  );
}
