import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildProvider } from '../../factory.ts';
import type { Catalog, Money, Product, Variant } from '../../types.ts';
import type { Logger } from '../../logger.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'mushi'),
  'config mushi'
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function decodeHtml(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
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

export interface MushiProductInfo {
  readonly stock: number | null;
  readonly status: string | null;
  readonly sellingWhenOutOfStock: boolean;
  readonly price: number | null;
  readonly compareAt: number | null;
}

export function parseProductInfo(html: string): MushiProductInfo {
  const stockMatch = /stock:\{status:"([a-z-]+)",stock:(\d+),sellingWhenOutOfStock:(true|false)/.exec(html);
  const grossMatch = /gross:\{value:([\d.]+),currency:"PLN"\}/.exec(html);
  const compareMatch = /compareAt:\{value:([\d.]+),currency:"PLN"\}/.exec(html);
  let stock: number | null = null;
  let status: string | null = null;
  let sellingWhenOutOfStock = false;
  if (stockMatch !== null) {
    status = stockMatch[1] ?? null;
    stock = Number(stockMatch[2]);
    sellingWhenOutOfStock = (stockMatch[3] ?? 'false') === 'true';
  }
  let price: number | null = null;
  if (grossMatch !== null) {
    const value = Number.parseFloat(grossMatch[1] ?? '');
    price = Number.isNaN(value) ? null : value;
  }
  let compareAt: number | null = null;
  if (compareMatch !== null) {
    const value = Number.parseFloat(compareMatch[1] ?? '');
    compareAt = Number.isNaN(value) ? null : value;
  }
  return { stock, status, sellingWhenOutOfStock, price, compareAt };
}

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

export function parseProduct(html: string, url: string, logger: Logger): Product | null {
  const info = parseProductInfo(html);
  if (info.stock === null || info.price === null) {
    logger.warn('mushi.product parse failed', { url });
    return null;
  }
  const titleMatch = /<title>(.*?)<\/title>/.exec(html);
  const title = titleMatch === null ? url : decodeHtml(titleMatch[1] ?? '').trim();
  const available = info.stock > 0 || info.sellingWhenOutOfStock;
  const variants: Variant[] = [
    {
      id: url,
      title: 'default',
      sku: null,
      price: money(info.price),
      regularPrice: info.compareAt !== null && info.compareAt > info.price ? money(info.compareAt) : null,
      available,
      quantity: info.stock,
    },
  ];
  return { id: url, title, url, variants };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.text();
}

export const mushiModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, async (): Promise<Catalog> => {
      const xml = await fetchText(config.endpoint);
      const urls = parseSitemapUrls(xml);
      const products: Product[] = [];
      for (const url of urls) {
        const html = await fetchText(url);
        const product = parseProduct(html, url, deps.logger);
        if (product !== null) {
          products.push(product);
        }
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    });
  },
};
