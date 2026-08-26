import { buildProvider } from '../../factory.ts';
import { measureFetch } from '../../network/manager.ts';
import { createFreshFetch } from '../../network/fresh-fetch.ts';
import type { WrappedFetch } from '../../network/manager.ts';
import { BROWSER_HEADERS } from '../../browser-headers.ts';
import type { DirectFetch, DirectFetchOptions } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type { Catalog, Product, Provider, ProviderConfig, Variant } from '../../types.ts';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const MAX_COOKIE_ROTATIONS = 2;
const COOKIE_FETCH_PATH = '/';

export interface EmbeddedVariant {
  readonly id: string;
  readonly quantity: number;
  readonly sku: string;
}

export interface EmbeddedProduct {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly price: number;
  readonly currency: string;
  readonly variants: readonly EmbeddedVariant[];
}

export function parseCurrency(html: string): string {
  const match = /"currency_code"\s*:\s*"([A-Z]{3})"/.exec(html);
  return match === null || match[1] === undefined ? 'PLN' : match[1];
}

export function parseEmbeddedQty(html: string, base: string): readonly EmbeddedProduct[] {
  const blockRe =
    /"finalPrice":\{"amount":([\d.]+)\}[\s\S]{0,300}?"productId":"(\d+)"[\s\S]{0,500}?"index":(\{[\s\S]{0,4000}?\}),"salable"[\s\S]{0,600}?"sku":(\{[^}]*\})/g;
  const cardRe =
    /id="product-item-info_(\d+)"[\s\S]{0,200}?href="(https:\/\/[^"]+)"[\s\S]{0,2500}?class="product-item-link"[\s\S]{0,200}?>([^<]{2,200})<\/a>/g;
  const blocks = new Map<string, { price: number; variants: readonly EmbeddedVariant[] }>();
  for (const match of html.matchAll(blockRe)) {
    const id = match[2];
    if (id === undefined) {
      continue;
    }
    const skuById = new Map<string, string>();
    const skuMap = match[4] ?? '';
    for (const skuMatch of skuMap.matchAll(/"(\d+)":"([^"]+)"/g)) {
      if (skuMatch[1] !== undefined && skuMatch[2] !== undefined) {
        skuById.set(skuMatch[1], skuMatch[2]);
      }
    }
    const variants: EmbeddedVariant[] = [];
    const index = match[3] ?? '';
    for (const variantMatch of index.matchAll(/"(\d+)":\{"\d+":"(\d+)"\}/g)) {
      if (variantMatch[1] === undefined || variantMatch[2] === undefined) {
        continue;
      }
      variants.push({
        id: variantMatch[1],
        quantity: Number(variantMatch[2]),
        sku: skuById.get(variantMatch[1]) ?? '',
      });
    }
    blocks.set(id, { price: Number(match[1] ?? 0), variants });
  }
  const products: EmbeddedProduct[] = [];
  for (const match of html.matchAll(cardRe)) {
    const id = match[1];
    if (id === undefined) {
      continue;
    }
    const block = blocks.get(id);
    if (block === undefined) {
      continue;
    }
    products.push({
      id,
      title: (match[3] ?? id).trim(),
      url: match[2] ?? `${base}/`,
      price: block.price,
      currency: parseCurrency(html),
      variants: block.variants,
    });
  }
  return products;
}

type CatalogFetch = (
  url: string,
  init?: RequestInit,
  options?: DirectFetchOptions
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchMagentoCookie(
  domain: string,
  logger: Logger,
  fetchFn: WrappedFetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchFn(`https://${domain}${COOKIE_FETCH_PATH}`, {
      headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] as string },
    });
    const getSetCookie = (response.headers as { getSetCookie?: () => string[] } | undefined)?.getSetCookie;
    const values =
      typeof getSetCookie === 'function' && response.headers !== undefined ? getSetCookie.call(response.headers) : [];
    if (response.body !== undefined && response.body !== null) {
      await response.body.cancel().catch(() => {});
    }
    if (values.length === 0) {
      return null;
    }
    const pairs = values
      .map((value) => /^([^=;]+=[^;]+)/.exec(value)?.[1])
      .filter((value): value is string => typeof value === 'string');
    return pairs.length > 0 ? pairs.join('; ') : null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('magento.cookie failed', { domain, error: message });
    return null;
  }
}

interface FetchState {
  cookie: string | null;
  rotations: number;
}

async function fetchText(
  url: string,
  domain: string,
  fetchFn: CatalogFetch,
  state: FetchState,
  logger: Logger,
  cookieFetch: WrappedFetch
): Promise<string> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (state.cookie !== null) {
      headers['Cookie'] = state.cookie;
    }
    const response = await fetchFn(url, { headers });
    if (response.ok) {
      return await response.text();
    }
    if (response.status === 429 && state.rotations < MAX_COOKIE_ROTATIONS) {
      logger.warn('magento.rate limited', { url, status: 429 });
      state.rotations += 1;
      state.cookie = await fetchMagentoCookie(domain, logger, cookieFetch);
      logger.info('magento.cookie rotated', { domain, present: state.cookie !== null });
      continue;
    }
    if ((response.status === 403 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await delayMs(RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
}

function isCatalogPath(url: string): boolean {
  const path = url.replace(/^https:\/\/[^/]+/, '');
  if (
    /^\/(customer|checkout|media|static|kontakt|regulamin|polityka|dostawa|reklamacje|zwroty|blog|wishlist|search|account|login|sales|o-nas|koszyk|sklep|p\/|produkt|product|konto|newsletter|faq|about|contact|marki)\/?$/.test(
      path
    )
  ) {
    return false;
  }
  if (path.slice(1).includes('/') && !/^\/(marki|en|kolekcje)\//.test(path)) {
    return false;
  }
  return true;
}

function expandPagination(html: string, base: string, seen: Set<string>, queue: string[]): void {
  for (const match of html.matchAll(/href="([^"]*\?p=(\d+))"/g)) {
    const page = match[2];
    if (page === undefined) {
      continue;
    }
    const href = match[1];
    if (href === undefined) {
      continue;
    }
    const full = href.startsWith('http') ? href : `${base}${href}`;
    if (!seen.has(full)) {
      seen.add(full);
      queue.push(full);
    }
  }
}

export function buildEmbeddedQtyProvider(
  providerConfig: ProviderConfig,
  logger: Logger,
  _directFetch?: DirectFetch
): Provider {
  const base = `https://${providerConfig.domain}`;
  const domain = providerConfig.domain;
  const waitMs = providerConfig.ratePerSecond > 0 ? Math.round(1000 / providerConfig.ratePerSecond) : 0;
  // The pages and the cookie go through the webshare. This keeps the VPS IP clean.
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['WEBSHARE_URL'] ?? null;
  const freshFetch = createFreshFetch(proxyUrl);
  const fetchFn: CatalogFetch = measureFetch(freshFetch, logger, providerConfig.id, 'proxy');
  const cookieFetch = measureFetch(freshFetch, logger, providerConfig.id, 'proxy');
  return buildProvider(providerConfig, logger, async (): Promise<Catalog> => {
    const state: FetchState = {
      cookie: await fetchMagentoCookie(domain, logger, cookieFetch),
      rotations: 0,
    };
    logger.info('magento.cookie', { domain, reason: 'session-start', present: state.cookie !== null });
    const home = await fetchText(`${base}/`, domain, fetchFn, state, logger, cookieFetch);
    const urls = new Set<string>();
    for (const match of home.matchAll(/href="(https:\/\/[^/]+\/[a-z0-9-]+)"/g)) {
      const url = match[1];
      if (url !== undefined && isCatalogPath(url)) {
        urls.add(url);
      }
    }
    if (urls.size > 0 && home.includes('/marki')) {
      try {
        const marki = await fetchText(`${base}/marki`, domain, fetchFn, state, logger, cookieFetch);
        for (const match of marki.matchAll(/href="(https:\/\/[^/]+\/marki\/[a-z0-9_-]+)"/g)) {
          const url = match[1];
          if (url !== undefined) {
            urls.add(url);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('magento.brands failed', { domain, error: message });
      }
    }
    const seen = new Set<string>(urls);
    const queue = [...urls];
    const products = new Map<string, Product>();
    let covered = 0;
    let pages = 0;
    while (queue.length > 0) {
      const url = queue.shift();
      if (url === undefined) {
        continue;
      }
      if (waitMs > 0) {
        await delayMs(waitMs);
      }
      const html = await fetchText(url, domain, fetchFn, state, logger, cookieFetch);
      pages += 1;
      expandPagination(html, base, seen, queue);
      for (const parsed of parseEmbeddedQty(html, base)) {
        covered += 1;
        const variants: readonly Variant[] = parsed.variants.map((variant) => ({
          id: variant.id,
          title: 'default',
          sku: variant.sku.length > 0 ? variant.sku : null,
          price: { amount: parsed.price, currency: parsed.currency },
          regularPrice: null,
          available: variant.quantity > 0,
          quantity: variant.quantity,
        }));
        products.set(parsed.id, {
          id: parsed.id,
          title: parsed.title,
          url: parsed.url,
          variants,
        });
      }
    }
    logger.info('magento.embedded catalog', {
      domain,
      pages,
      covered,
      products: products.size,
    });
    return { domain, fetchedAt: new Date().toISOString(), products: [...products.values()] };
  });
}
