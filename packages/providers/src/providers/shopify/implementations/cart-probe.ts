import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { buildStockRevealer } from '../../../factory.ts';
import { isCloudflareChallenge } from '../../../captcha/detect.ts';
import { measureFetch } from '../../../network/manager.ts';
import { RateLimiter } from '../../../network/limiter.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, ProviderConfig, StockRevealTarget, StockRevealer, Variant } from '../../../types.ts';
import { fetchShopifyCatalog } from './adapter.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PROBE_QUANTITY = 9999;
// The pool allows about 10-12 requests per second. Above that the shop returns 429.
const PROBE_RATE_PER_SECOND = 10;
const REVEAL_CONCURRENCY = 10;
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 2000;

export interface ProbeOutcome {
  readonly quantity: number | null;
  readonly available: boolean | null;
}

interface ProbeResult {
  readonly blocked: boolean;
  readonly outcome: ProbeOutcome;
}

type ProbeFetch = WrappedFetch;

export function createProbeFetch(): ProbeFetch {
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['WEBSHARE_URL'] ?? null;
  if (proxyUrl === null) {
    return (url, init) => fetch(url, init);
  }
  return async (url, init) => {
    const agent = new ProxyAgent(proxyUrl);
    try {
      return await undiciFetch(String(url), {
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1]);
    } finally {
      await agent.close();
    }
  };
}

export function parseChangeResponse(text: string, logger: Logger): ProbeOutcome {
  const clamped = /Tylko\s+(\d+)\s+poz\.|Tylko\s+(\d+)\s+pozycj[aei]|Only\s+(\d+)\s+(?:items?|poz\.)/i.exec(text);
  if (clamped !== null) {
    const value = clamped[1] ?? clamped[2] ?? clamped[3];
    if (value !== undefined) {
      return { quantity: Number(value), available: true };
    }
  }
  if (/wyprzedan|sold out|out of stock|unavailable/i.test(text)) {
    return { quantity: 0, available: false };
  }
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const itemsRaw = data['items'];
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
      const first = itemsRaw[0] as Readonly<Record<string, unknown>>;
      const quantity = typeof first['quantity'] === 'number' ? first['quantity'] : null;
      if (quantity !== null) {
        return { quantity, available: true };
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('cartprobe.change response parse failed', { error: message });
  }
  return { quantity: null, available: null };
}

function extractCartCookie(setCookie: string | null): string | null {
  if (setCookie === null) {
    return null;
  }
  const cartMatch = /cart=[^;]+/.exec(setCookie);
  if (cartMatch === null) {
    return null;
  }
  return cartMatch[0];
}

async function probeVariantOnce(
  domain: string,
  variantId: string,
  logger: Logger,
  probeFetch: ProbeFetch,
  limiter: RateLimiter
): Promise<ProbeResult> {
  const baseHeaders: Readonly<Record<string, string>> = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  let cartCookie: string | null = null;
  try {
    await limiter.acquire();
    const addResponse = await probeFetch(`https://${domain}/cart/add.js`, {
      method: 'POST',
      headers: baseHeaders,
      body: `id=${variantId}&quantity=1`,
    });
    cartCookie = extractCartCookie(addResponse.headers?.get('set-cookie') ?? null);
    if (addResponse.body !== undefined && addResponse.body !== null) {
      await addResponse.body.cancel();
    }
    if (addResponse.status === 429 || addResponse.status === 403) {
      logger.warn('cartprobe.challenge blocked', { domain, variantId });
      return { blocked: true, outcome: { quantity: null, available: null } };
    }
    if (!addResponse.ok) {
      throw new Error(`cart add failed with status ${addResponse.status}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('cartprobe.add failed', { domain, variantId, error: message });
    return { blocked: false, outcome: { quantity: null, available: null } };
  }
  const changeHeaders: Readonly<Record<string, string>> =
    cartCookie === null ? { ...baseHeaders } : { ...baseHeaders, Cookie: cartCookie };
  try {
    await limiter.acquire();
    const changeResponse = await probeFetch(`https://${domain}/cart/change.js`, {
      method: 'POST',
      headers: changeHeaders,
      body: `line=1&quantity=${PROBE_QUANTITY}`,
    });
    const text = await changeResponse.text();
    if (isCloudflareChallenge(text)) {
      logger.warn('cartprobe.challenge blocked', { domain, variantId });
      return { blocked: true, outcome: { quantity: null, available: null } };
    }
    if (changeResponse.status === 429) {
      logger.warn('cartprobe.challenge blocked', { domain, variantId });
      return { blocked: true, outcome: { quantity: null, available: null } };
    }
    const outcome = parseChangeResponse(text, logger);
    if (changeResponse.status === 200 && outcome.quantity === null) {
      return { blocked: false, outcome: { quantity: PROBE_QUANTITY, available: true } };
    }
    return { blocked: false, outcome };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('cartprobe.change failed', { domain, variantId, error: message });
    return { blocked: false, outcome: { quantity: null, available: null } };
  }
}

export async function probeVariantStock(
  domain: string,
  variantId: string,
  logger: Logger,
  probeFetch?: ProbeFetch,
  limiter?: RateLimiter,
  retryBaseMs = RETRY_BASE_MS
): Promise<ProbeOutcome> {
  const fetchFn = probeFetch ?? createProbeFetch();
  const rateLimiter = limiter ?? new RateLimiter(PROBE_RATE_PER_SECOND);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await probeVariantOnce(domain, variantId, logger, fetchFn, rateLimiter);
    const missing = result.outcome.quantity === null && result.outcome.available === null;
    if ((result.blocked || missing) && attempt < MAX_ATTEMPTS) {
      logger.warn('cartprobe.retry', { domain, variantId, attempt, blocked: result.blocked });
      const waitMs = retryBaseMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    return result.outcome;
  }
  return { quantity: null, available: null };
}

export function applyOutcome(variant: Variant, outcome: ProbeOutcome): Variant {
  if (outcome.quantity === null) {
    return variant;
  }
  const available = outcome.available === null ? variant.available : outcome.available;
  return {
    ...variant,
    available,
    quantity: outcome.quantity,
  };
}

export function buildCartProbeProvider(
  config: ProviderConfig,
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
  const catalogFetch = measureFetch(rawCatalogFetch, logger, config.id, 'proxy');
  const probeFetch = measureFetch(createProbeFetch(), logger, config.id, 'proxy');
  const rateLimiter = new RateLimiter(PROBE_RATE_PER_SECOND);
  return buildStockRevealer(
    config,
    logger,
    async (): Promise<Catalog> => fetchShopifyCatalog(config.endpoint, config.domain, logger, catalogFetch),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await fetchShopifyCatalog(config.endpoint, config.domain, logger, catalogFetch);
      const wanted = new Set<string>(target.productIds);
      const variantTasks: Array<{ productId: string; variant: Variant }> = [];
      for (const product of catalog.products) {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          continue;
        }
        for (const variant of product.variants) {
          variantTasks.push({ productId: product.id, variant });
        }
      }
      const outcomes = new Map<string, ProbeOutcome>();
      let index = 0;
      async function worker(): Promise<void> {
        while (index < variantTasks.length) {
          const task = variantTasks[index];
          index += 1;
          if (task === undefined) {
            continue;
          }
          const outcome =
            task.variant.available === false
              ? { quantity: 0, available: false }
              : await probeVariantStock(config.domain, task.variant.id, logger, probeFetch, rateLimiter);
          outcomes.set(task.variant.id, outcome);
        }
      }
      await Promise.all(Array.from({ length: REVEAL_CONCURRENCY }, () => worker()));
      const products: Product[] = catalog.products
        .filter((product) => wanted.size === 0 || wanted.has(product.id))
        .map((product) => {
          const variants: Variant[] = product.variants.map((variant) => {
            const outcome = outcomes.get(variant.id) ?? null;
            return outcome === null ? variant : applyOutcome(variant, outcome);
          });
          return { ...product, variants };
        });
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    }
  );
}
