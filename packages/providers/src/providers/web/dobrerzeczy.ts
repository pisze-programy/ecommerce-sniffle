import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildProvider } from '../../factory.ts';
import type { Catalog, Money, Product, Variant } from '../../types.ts';
import type { Logger } from '../../logger.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'dobrerzeczy'),
  'config dobrerzeczy'
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_DEPTH = 60;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export function parseNuxtPayload(html: string, logger?: Logger): readonly unknown[] | null {
  const match = /<script[^>]*__NUXT_DATA__[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (match === null) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? '');
  } catch (error: unknown) {
    if (logger !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('dobrerzeczy.nuxt payload parse failed', { error: message });
    }
    return null;
  }
  if (!Array.isArray(data)) {
    return null;
  }
  return data;
}

function deref(payload: readonly unknown[], node: unknown): unknown {
  if (typeof node === 'number' && node >= 0 && node < payload.length) {
    return payload[node];
  }
  return node;
}

function isProductObject(obj: Readonly<Record<string, unknown>>): boolean {
  return '_id' in obj && 'price' in obj && 'sizes' in obj && 'slug' in obj;
}

export function findAllProducts(payload: readonly unknown[]): readonly Readonly<Record<string, unknown>>[] {
  const products: Readonly<Record<string, unknown>>[] = [];
  const visited = new Set<number>();
  const seenObjects = new Set<object>();
  function walk(node: unknown, depth: number): void {
    if (depth > MAX_DEPTH) {
      return;
    }
    if (typeof node === 'number') {
      if (node < 0 || node >= payload.length || visited.has(node)) {
        return;
      }
      visited.add(node);
      walk(payload[node], depth + 1);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }
    if (typeof node === 'object' && node !== null) {
      const obj = node as Readonly<Record<string, unknown>>;
      if (isProductObject(obj)) {
        if (!seenObjects.has(obj)) {
          seenObjects.add(obj);
          products.push(obj);
        }
        return;
      }
      for (const value of Object.values(obj)) {
        walk(value, depth + 1);
      }
    }
  }
  walk(payload, 0);
  return products;
}

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

export function parseProductFromPayload(
  payload: readonly unknown[],
  productObject: Readonly<Record<string, unknown>>,
  domain: string,
  logger: Logger
): Product | null {
  const rawId = deref(payload, productObject['_id']);
  const slug = deref(payload, productObject['slug']);
  const id = typeof rawId === 'string' ? rawId : typeof slug === 'string' ? slug : null;
  if (id === null) {
    logger.warn('dobrerzeczy.product no id', {});
    return null;
  }
  const url = typeof slug === 'string' ? `https://${domain}/produkt/${slug}` : `https://${domain}/`;
  const rawTitle = deref(payload, productObject['name']);
  const title = typeof rawTitle === 'string' ? rawTitle : id;
  const rawPrice = deref(payload, productObject['price']);
  const price = typeof rawPrice === 'number' ? rawPrice : 0;
  const rawPreorder = deref(payload, productObject['isPreorder']);
  const isPreorder = rawPreorder === true;
  const forSale = deref(payload, productObject['isCollection']) === true;
  const rawSizes = deref(payload, productObject['sizes']);
  const variants: Variant[] = [];
  if (Array.isArray(rawSizes)) {
    for (const ref of rawSizes) {
      const rawEntry = deref(payload, ref);
      if (typeof rawEntry !== 'object' || rawEntry === null) {
        continue;
      }
      const entry = rawEntry as Readonly<Record<string, unknown>>;
      const rawSize = deref(payload, entry['size']);
      const sizeName =
        typeof rawSize === 'object' && rawSize !== null
          ? deref(payload, (rawSize as Readonly<Record<string, unknown>>)['name'])
          : null;
      const rawSizeId = deref(payload, entry['_id']);
      const rawStock = deref(payload, entry['stock']);
      const stock = typeof rawStock === 'number' ? rawStock : null;
      // A product with isCollection false is not offered for sale. The shop
      // keeps stock on hand but disables the buy button. Treat it as sold out.
      const available = forSale ? (isPreorder ? true : stock !== null && stock > 0) : false;
      variants.push({
        id: typeof rawSizeId === 'string' ? rawSizeId : `${id}-${String(variants.length)}`,
        title: typeof sizeName === 'string' ? sizeName : 'default',
        sku: null,
        price: money(price),
        regularPrice: null,
        available,
        quantity: forSale ? (isPreorder ? 1 : stock) : 0,
      });
    }
  }
  if (variants.length === 0) {
    logger.warn('dobrerzeczy.product has no sizes', { url });
    return null;
  }
  return { id, title, url, variants };
}

async function fetchText(url: string, logger: Logger): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) {
      return response.text();
    }
    if (response.status === 429 || response.status === 403 || response.status >= 500) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
    }
    logger.warn('dobrerzeczy.fetch failed', { url, status: response.status });
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

export const dobrerzeczyModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const html = await fetchText(config.endpoint, deps.logger);
      const payload = parseNuxtPayload(html, deps.logger);
      if (payload === null) {
        throw new Error('dobrerzeczy payload missing');
      }
      const objects = findAllProducts(payload);
      if (objects.length === 0) {
        throw new Error('dobrerzeczy catalog empty');
      }
      const products: Product[] = [];
      for (const obj of objects) {
        const product = parseProductFromPayload(payload, obj, config.domain, deps.logger);
        if (product !== null) {
          products.push(product);
        }
      }
      if (products.length === 0) {
        throw new Error('dobrerzeczy catalog empty');
      }
      deps.logger.debug('dobrerzeczy catalog fetched', {
        domain: config.domain,
        products: products.length,
      });
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
