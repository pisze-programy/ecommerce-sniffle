import { PROVIDERS } from '../../config.js';
import { requireValue } from '../../helpers.js';
import type { ProviderModule } from '../../module.js';
import { buildProvider } from '../../factory.js';
import type { Catalog, Money, Product, Variant } from '../../types.js';
import type { Logger } from '../../logger.js';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'rever'),
  'config rever'
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface VariationJson {
  readonly attributes: Readonly<Record<string, string>>;
  readonly maxQty: number | null;
  readonly displayPrice: number | null;
  readonly displayRegularPrice: number | null;
  readonly isInStock: boolean | null;
  readonly variationId: number | null;
}

export function decodeHtml(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parsePrice(raw: string): number | null {
  const decoded = decodeHtml(raw)
    .replace(/[^\d,.]/g, '')
    .replace(',', '.');
  const value = Number.parseFloat(decoded);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const pattern = /<loc>([^<]+)<\/loc>/g;
  for (const match of xml.matchAll(pattern)) {
    const url = match[1];
    if (url !== undefined && url.includes('/produkt/')) {
      urls.push(url);
    }
  }
  return urls;
}

export function parseVariationJson(html: string, logger?: Logger): VariationJson[] {
  const match = /data-product_variations="([^"]+)"/.exec(html);
  if (match === null) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(decodeHtml(match[1] ?? ''));
  } catch (error: unknown) {
    if (logger !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('rever.variationJson parse failed', { error: message });
    }
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((entry: unknown): VariationJson[] => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const obj = entry as Readonly<Record<string, unknown>>;
    const rawAttributes = obj['attributes'];
    const attributes =
      typeof rawAttributes === 'object' && rawAttributes !== null
        ? (rawAttributes as Readonly<Record<string, unknown>>)
        : {};
    const attributeValues: string[] = [];
    for (const value of Object.values(attributes)) {
      if (typeof value === 'string') {
        attributeValues.push(value);
      }
    }
    return [
      {
        attributes: { size: attributeValues[0] ?? '' },
        maxQty: typeof obj['max_qty'] === 'number' ? obj['max_qty'] : null,
        displayPrice: typeof obj['display_price'] === 'number' ? obj['display_price'] : null,
        displayRegularPrice: typeof obj['display_regular_price'] === 'number' ? obj['display_regular_price'] : null,
        isInStock: typeof obj['is_in_stock'] === 'boolean' ? obj['is_in_stock'] : null,
        variationId: typeof obj['variation_id'] === 'number' ? obj['variation_id'] : null,
      },
    ];
  });
}

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

// The shop sends an empty max_qty when it does not track the exact stock.
// The stock is then the availability (is_in_stock).
// The result mirrors what the shop displays on the page.
export function resolveQuantity(maxQty: number | null, isInStock: boolean | null): number | null {
  if (maxQty !== null) {
    return maxQty;
  }
  if (isInStock === false) {
    return 0;
  }
  if (isInStock === true) {
    return 1;
  }
  return null;
}

export function parseProduct(html: string, url: string, logger?: Logger): Product {
  const idMatch = /name="product_id"[^>]*value="(\d+)"/.exec(html);
  const productId = idMatch === null ? url : (idMatch[1] ?? url);
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title =
    titleMatch === null
      ? url
      : decodeHtml(titleMatch[1] ?? '')
          .replace(' – rêver Sabina Hajdo - Piórek', '')
          .trim();
  const soldOut = html.includes('Wyprzedane');
  const priceRaw = /woocommerce-Price-amount[^>]*>(.*?)<\/span>/.exec(html)?.[1];
  const price = priceRaw === undefined ? null : parsePrice(priceRaw);

  const variations = parseVariationJson(html, logger);
  if (variations.length === 0) {
    const variants: Variant[] = [
      {
        id: productId,
        title: 'default',
        sku: null,
        price: money(price === null ? 0 : price),
        regularPrice: null,
        available: !soldOut,
        quantity: soldOut ? 0 : 1,
      },
    ];
    return { id: productId, title, url, variants };
  }

  const variants: Variant[] = variations.map((variation): Variant => {
    const size = variation.attributes['size'] ?? '';
    const variantId =
      variation.variationId === null ? `${productId}-${size === '' ? 'x' : size}` : String(variation.variationId);
    return {
      id: variantId,
      title: size === '' ? 'default' : size,
      sku: null,
      price: money(variation.displayPrice === null ? (price === null ? 0 : price) : variation.displayPrice),
      regularPrice: variation.displayRegularPrice === null ? null : money(variation.displayRegularPrice),
      available: variation.isInStock === null ? !soldOut : variation.isInStock,
      quantity: resolveQuantity(variation.maxQty, variation.isInStock),
    };
  });

  return { id: productId, title, url, variants };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.text();
}

export const reverModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const xml = await fetchText(config.endpoint);
      const urls = parseSitemapUrls(xml);
      const products: Product[] = [];
      for (const url of urls) {
        const html = await fetchText(url);
        products.push(parseProduct(html, url, deps.logger));
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
