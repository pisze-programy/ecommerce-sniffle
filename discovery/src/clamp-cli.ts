// Check a shop for a cart-cap leak. See docs/CLAMP-BYPASS.md.
// The probe runs on the developer machine only. The VPS is production.
// The probe never uses the proxy.

import { hostname } from 'node:os';
import { fetch } from 'undici';
import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { detectLeaks, extractShopDomain, extractStorefrontToken, parseClampMessage, pickVerifiable } from './clamp.ts';
import type { LeakHit } from './clamp.ts';
import { detectPlatform } from './platform.ts';
import { isChallengePage } from './recon.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PRODUCTION_HOST = 'frog';
const PACE_MS = 1500;
const MAX_PRODUCTS = 8;

const logger: Logger = createLogger(consoleSink);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCap(): number | null {
  for (const arg of process.argv) {
    if (arg.startsWith('--cap=')) {
      const value = Number(arg.slice('--cap='.length));
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

async function getText(url: string): Promise<{ readonly status: number; readonly body: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8' },
  });
  const body = await response.text();
  return { status: response.status, body };
}

interface CartAnswer {
  readonly body: string;
  readonly cookie: string | null;
}

async function postForm(url: string, body: string, cookie: string | null): Promise<CartAnswer> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie !== null) {
    headers['Cookie'] = cookie;
  }
  const response = await fetch(url, { method: 'POST', headers, body });
  const text = await response.text();
  const setCookies = response.headers.getSetCookie();
  const pairs: string[] = [];
  for (const entry of setCookies) {
    const pair = entry.split(';')[0];
    if (pair !== undefined && pair.length > 0) {
      pairs.push(pair);
    }
  }
  return { body: text, cookie: pairs.length === 0 ? null : pairs.join('; ') };
}

// Reads the true count from the cart for one variant below the cap.
async function verifyVariant(domain: string, variantId: string): Promise<number | null> {
  const add = await postForm(`https://${domain}/cart/add.js`, `id=${variantId}&quantity=1`, null);
  const change = await postForm(`https://${domain}/cart/change.js`, 'line=1&quantity=999999', add.cookie);
  return parseClampMessage(change.body);
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('clamp.catalog parse failed', { error: message });
    return null;
  }
}

function readHandles(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const products = (value as Readonly<Record<string, unknown>>)['products'];
  if (!Array.isArray(products)) {
    return [];
  }
  const out: string[] = [];
  for (const product of products) {
    if (typeof product !== 'object' || product === null) {
      continue;
    }
    const handle = (product as Readonly<Record<string, unknown>>)['handle'];
    if (typeof handle === 'string' && handle.length > 0) {
      out.push(handle);
    }
  }
  return out;
}

function sampleOf(hit: LeakHit): string {
  const parts: string[] = [];
  let count = 0;
  for (const [variantId, quantity] of hit.variants) {
    if (count >= 3) {
      break;
    }
    parts.push(`${variantId}:${quantity}`);
    count += 1;
  }
  return parts.join(', ');
}

function mergeHit(all: Map<string, LeakHit>, hit: LeakHit): void {
  const existing = all.get(hit.vector);
  if (existing === undefined) {
    all.set(hit.vector, hit);
    return;
  }
  const variants = new Map(existing.variants);
  for (const [variantId, quantity] of hit.variants) {
    variants.set(variantId, quantity);
  }
  all.set(hit.vector, { vector: hit.vector, scope: hit.scope, variants });
}

async function main(): Promise<void> {
  if (hostname() === PRODUCTION_HOST) {
    logger.error('clamp.production host', {
      host: hostname(),
      reason: 'the VPS is production, probe on the developer machine',
    });
    process.exitCode = 1;
    return;
  }
  const rawTarget = process.argv[2];
  if (rawTarget === undefined || rawTarget.length === 0) {
    logger.error('clamp.usage', { usage: 'node dist/clamp-cli.js <domain|product-url> [--cap=N]' });
    process.exitCode = 1;
    return;
  }
  const urlTarget = rawTarget.startsWith('http') ? new URL(rawTarget) : null;
  const domain = urlTarget === null ? rawTarget : urlTarget.hostname;
  const cap = readCap();
  let productUrls: readonly string[];
  if (urlTarget !== null) {
    productUrls = [urlTarget.toString()];
  } else {
    const home = await getText(`https://${domain}/`);
    const detected = detectPlatform(home.status, home.body);
    if (detected !== 'shopify' && detected !== 'other') {
      console.log(`leak ${domain} platform=${detected} shopify-vectors=skipped`);
      return;
    }
    const catalog = await getText(`https://${domain}/products.json?limit=${MAX_PRODUCTS}`);
    if (catalog.status !== 200) {
      if (detected === 'other') {
        console.log(`leak ${domain} platform=other shopify-vectors=skipped`);
        return;
      }
      logger.error('clamp.catalog failed', { domain, status: catalog.status });
      process.exitCode = 1;
      return;
    }
    const handles = readHandles(parseJson(catalog.body));
    if (handles.length === 0) {
      if (detected === 'other') {
        console.log(`leak ${domain} platform=other shopify-vectors=skipped`);
        return;
      }
      logger.warn('clamp.no products', { domain });
      process.exitCode = 1;
      return;
    }
    productUrls = handles.map((handle) => `https://${domain}/products/${handle}`);
  }
  const hits = new Map<string, LeakHit>();
  let token: string | null = null;
  let shopDomain: string | null = null;
  let challenged = false;
  let first = true;
  for (const productUrl of productUrls) {
    const page = await getText(productUrl);
    if (page.status !== 200) {
      logger.warn('clamp.page status', { domain, url: productUrl, status: page.status });
      continue;
    }
    if (isChallengePage(page.body)) {
      logger.warn('clamp.page challenged', { domain, url: productUrl });
      challenged = true;
      break;
    }
    if (first && urlTarget !== null) {
      const detected = detectPlatform(page.status, page.body);
      if (detected !== 'shopify' && detected !== 'other') {
        console.log(`leak ${domain} platform=${detected} shopify-vectors=skipped`);
        return;
      }
    }
    first = false;
    if (token === null) {
      token = extractStorefrontToken(page.body);
    }
    if (shopDomain === null) {
      shopDomain = extractShopDomain(page.body);
    }
    for (const hit of detectLeaks(page.body, logger, domain)) {
      mergeHit(hits, hit);
    }
    await sleep(PACE_MS);
  }
  for (const hit of hits.values()) {
    let verified = '-';
    let match = '-';
    if (cap !== null && hit.scope === 'catalog') {
      const candidate = pickVerifiable(hit, cap);
      if (candidate !== null) {
        const cart = await verifyVariant(domain, candidate.variantId);
        verified = cart === null ? '-' : String(cart);
        match = cart !== null && cart === candidate.quantity ? 'yes' : 'no';
        await sleep(PACE_MS);
      }
    }
    console.log(
      `leak ${domain} vector=${hit.vector} scope=${hit.scope} variants=${hit.variants.size} sample=${sampleOf(hit)} verified=${verified} match=${match}`
    );
  }
  if (hits.size === 0) {
    console.log(`leak ${domain} none challenged=${challenged ? 'yes' : 'no'}`);
  }
  if (token !== null) {
    console.log(`leak ${domain} storefrontToken=${token} shop=${shopDomain === null ? '-' : shopDomain}`);
  }
}

void main();
