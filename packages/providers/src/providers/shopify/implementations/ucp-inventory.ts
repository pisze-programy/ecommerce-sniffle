import { buildStockRevealer } from '../../../factory.ts';
import { measureFetch } from '../../../network/manager.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, ProviderConfig, StockRevealTarget, StockRevealer, Variant } from '../../../types.ts';
import { fetchShopifyCatalog } from './adapter.ts';
import { createProbeFetch } from './cart-probe.ts';
import { buildBatches, mcpVariantTitle, toMcpGid } from './mcp-inventory.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// The shop clamps the quantity to the exact stock.
const PROBE_QUANTITY = 999999;
// A batch of 100 is verified clean. A batch of 1475 returns an
// invalid error on the shop. The server caps the cart line count.
const UCP_BATCH = 100;
const REVEAL_CONCURRENCY = 5;
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 1000;
const MAX_SPLIT_DEPTH = 4;

// The profile drives the UCP negotiation. It declares the cart
// capability only. A smaller profile returns a smaller payload.
// The gzip request cuts the proxy transfer by about 4 to 11 times.
const PROFILE_URL = 'https://ecommerce-sniffle-backend.dev-4cb.workers.dev/ucp/agent-profile.json';

export interface UcpEntry {
  readonly product: Product;
  readonly variant: Variant;
  readonly title: string;
}

export interface UcpSingleResult {
  readonly ok: boolean;
  readonly count: number | null;
}

export interface UcpCartResult {
  readonly failed: boolean;
  readonly quantities: ReadonlyMap<string, number>;
  readonly outOfStockMessages: number;
  readonly invalid: boolean;
}

export function parseUcpCart(text: string): UcpCartResult {
  const empty: UcpCartResult = {
    failed: true,
    quantities: new Map<string, number>(),
    outOfStockMessages: 0,
    invalid: false,
  };
  let outer: unknown;
  try {
    outer = JSON.parse(text);
  } catch {
    return empty;
  }
  if (typeof outer !== 'object' || outer === null) {
    return empty;
  }
  const record = outer as Readonly<Record<string, unknown>>;
  if ('error' in record) {
    return empty;
  }
  const result = record['result'];
  if (typeof result !== 'object' || result === null) {
    return empty;
  }
  const content = (result as Readonly<Record<string, unknown>>)['content'];
  if (!Array.isArray(content)) {
    return empty;
  }
  let innerText: string | null = null;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const blockRecord = block as Readonly<Record<string, unknown>>;
    if (blockRecord['type'] === 'text' && typeof blockRecord['text'] === 'string') {
      innerText = blockRecord['text'];
      break;
    }
  }
  if (innerText === null) {
    return empty;
  }
  let inner: unknown;
  try {
    inner = JSON.parse(innerText);
  } catch {
    return empty;
  }
  if (typeof inner !== 'object' || inner === null) {
    return empty;
  }
  const cart = inner as Readonly<Record<string, unknown>>;
  const quantities = new Map<string, number>();
  const lines = cart['line_items'];
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (typeof line !== 'object' || line === null) {
        continue;
      }
      const lineRecord = line as Readonly<Record<string, unknown>>;
      const item = lineRecord['item'];
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const id = (item as Readonly<Record<string, unknown>>)['id'];
      const quantity = lineRecord['quantity'];
      if (typeof id === 'string' && typeof quantity === 'number') {
        quantities.set(id, quantity);
      }
    }
  }
  let outOfStockMessages = 0;
  let invalid = false;
  const messages = cart['messages'];
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (typeof message !== 'object' || message === null) {
        continue;
      }
      const code = (message as Readonly<Record<string, unknown>>)['code'];
      if (code === 'merchandise_out_of_stock') {
        outOfStockMessages += 1;
      }
      if (code === 'invalid') {
        invalid = true;
      }
    }
  }
  return { failed: false, quantities, outOfStockMessages, invalid };
}

export interface BatchOutcome {
  readonly ok: boolean;
  readonly resolved: ReadonlyMap<string, number>;
  readonly noCap: readonly string[];
  readonly unresolved: readonly string[];
  readonly invalid: boolean;
}

const failedOutcome: BatchOutcome = { ok: false, resolved: new Map(), noCap: [], unresolved: [], invalid: false };

function mergeOutcomes(left: BatchOutcome, right: BatchOutcome): BatchOutcome {
  const resolved = new Map<string, number>(left.resolved);
  for (const [id, count] of right.resolved) {
    resolved.set(id, count);
  }
  return {
    ok: left.ok && right.ok,
    resolved,
    noCap: [...left.noCap, ...right.noCap],
    unresolved: [...left.unresolved, ...right.unresolved],
    invalid: false,
  };
}

export async function probeBatch(
  domain: string,
  entries: readonly UcpEntry[],
  logger: Logger,
  probeFetch: WrappedFetch
): Promise<BatchOutcome> {
  const lineItems = entries.map((entry) => ({
    item: { id: toMcpGid(entry.variant.id) },
    quantity: PROBE_QUANTITY,
  }));
  let text: string;
  try {
    const response = await probeFetch(`https://${domain}/api/ucp/mcp`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_cart',
          arguments: {
            meta: { 'ucp-agent': { profile: PROFILE_URL } },
            cart: { line_items: lineItems },
          },
        },
      }),
    });
    if (!response.ok) {
      logger.warn('ucp-inventory.http error', { domain, status: response.status });
      return failedOutcome;
    }
    text = await response.text();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('ucp-inventory.probe failed', {
      domain,
      variants: entries.length,
      error: message,
    });
    return failedOutcome;
  }
  const parsed = parseUcpCart(text);
  if (parsed.failed) {
    logger.warn('ucp-inventory.response unreadable', { domain });
    return failedOutcome;
  }
  if (parsed.invalid) {
    // The shop rejects a cart with too many lines. Split the batch.
    logger.warn('ucp-inventory.invalid batch', { domain, variants: entries.length });
    return { ok: true, resolved: new Map(), noCap: [], unresolved: [], invalid: true };
  }
  const resolved = new Map<string, number>();
  const noCap: string[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    // Only read the variants we sent. A shop can add an auto-gift line.
    const quantity = parsed.quantities.get(toMcpGid(entry.variant.id));
    if (quantity === undefined) {
      unresolved.push(entry.variant.id);
      continue;
    }
    if (quantity === PROBE_QUANTITY) {
      // The shop accepted the huge quantity. The stock has no cap.
      noCap.push(entry.variant.id);
      continue;
    }
    resolved.set(entry.variant.id, quantity);
  }
  // A variant missing from the cart is sold out. The shop marks it with
  // a merchandise_out_of_stock message. The counts must match. A mismatch
  // means the probe is unreliable. Those variants stay unresolved.
  if (unresolved.length > 0 && unresolved.length === parsed.outOfStockMessages) {
    const missing = unresolved.slice();
    unresolved.length = 0;
    for (const id of missing) {
      resolved.set(id, 0);
    }
  }
  return { ok: true, resolved, noCap, unresolved, invalid: false };
}

export async function probeBatchResolved(
  domain: string,
  entries: readonly UcpEntry[],
  logger: Logger,
  probeFetch: WrappedFetch,
  depth = 0
): Promise<BatchOutcome> {
  const outcome = await probeBatch(domain, entries, logger, probeFetch);
  if (!outcome.ok) {
    return outcome;
  }
  if (outcome.invalid && entries.length > 1 && depth < MAX_SPLIT_DEPTH) {
    const mid = Math.ceil(entries.length / 2);
    const left = await probeBatchResolved(domain, entries.slice(0, mid), logger, probeFetch, depth + 1);
    const right = await probeBatchResolved(domain, entries.slice(mid), logger, probeFetch, depth + 1);
    return mergeOutcomes(left, right);
  }
  return outcome;
}

export async function probeSingle(
  domain: string,
  entry: UcpEntry,
  logger: Logger,
  probeFetch: WrappedFetch
): Promise<UcpSingleResult> {
  let sawOk = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await probeBatch(domain, [entry], logger, probeFetch);
    if (result.ok) {
      sawOk = true;
    }
    const count = result.resolved.get(entry.variant.id);
    if (count !== undefined) {
      return { ok: true, count };
    }
    if (result.noCap.includes(entry.variant.id)) {
      return { ok: true, count: entry.variant.available ? 1 : 0 };
    }
    if (attempt < MAX_ATTEMPTS) {
      logger.warn('ucp-inventory.retry', {
        domain,
        variantId: entry.variant.id,
        attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
    }
  }
  return { ok: sawOk, count: null };
}

function buildEntries(catalog: Catalog, wanted: Set<string>): UcpEntry[] {
  const entries: UcpEntry[] = [];
  for (const product of catalog.products) {
    if (wanted.size > 0 && !wanted.has(product.id)) {
      continue;
    }
    for (const variant of product.variants) {
      if (variant.available === false) {
        continue;
      }
      entries.push({ product, variant, title: mcpVariantTitle(product, variant) });
    }
  }
  return entries;
}

async function revealStockImpl(
  target: StockRevealTarget,
  config: ProviderConfig,
  logger: Logger,
  catalogFetch: WrappedFetch,
  probeFetch: WrappedFetch
): Promise<Catalog> {
  const catalog = await fetchShopifyCatalog(config.endpoint, config.domain, logger, catalogFetch);
  const wanted = new Set<string>(target.productIds);
  const entries = buildEntries(catalog, wanted);
  const batches = buildBatches(entries, UCP_BATCH);
  const probes = new Map<string, UcpSingleResult>();
  let batchIndex = 0;
  async function worker(): Promise<void> {
    while (batchIndex < batches.length) {
      const batch = batches[batchIndex];
      batchIndex += 1;
      if (batch === undefined) {
        continue;
      }
      const outcome = await probeBatchResolved(config.domain, batch, logger, probeFetch);
      for (const entry of batch) {
        const count = outcome.resolved.get(entry.variant.id);
        if (count !== undefined) {
          probes.set(entry.variant.id, { ok: true, count });
          continue;
        }
        if (outcome.noCap.includes(entry.variant.id)) {
          logger.warn('ucp-inventory.no cap', { domain: config.domain, variantId: entry.variant.id });
          probes.set(entry.variant.id, { ok: true, count: entry.variant.available ? 1 : 0 });
          continue;
        }
        if (!outcome.ok || outcome.unresolved.includes(entry.variant.id)) {
          const single = await probeSingle(config.domain, entry, logger, probeFetch);
          probes.set(entry.variant.id, single);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: REVEAL_CONCURRENCY }, () => worker()));
  const products: Product[] = catalog.products
    .filter((product) => wanted.size === 0 || wanted.has(product.id))
    .map((product) => {
      const variants: Variant[] = product.variants.map((variant) => {
        if (variant.available === false) {
          return variant;
        }
        const probe = probes.get(variant.id);
        if (probe === undefined) {
          return variant;
        }
        if (probe.count !== null) {
          return { ...variant, quantity: probe.count, available: probe.count > 0 };
        }
        if (probe.ok) {
          logger.warn('ucp-inventory.no cap', { domain: config.domain, variantId: variant.id });
          return { ...variant, quantity: variant.available ? 1 : 0 };
        }
        logger.warn('ucp-inventory.unresolved', {
          domain: config.domain,
          variantId: variant.id,
        });
        return { ...variant, quantity: null };
      });
      return { ...product, variants };
    });
  logger.debug('ucp-inventory run done', {
    domain: config.domain,
    variants: entries.length,
    resolved: probes.size,
    requests: batchIndex,
  });
  return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
}

export function buildUcpInventoryProvider(
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
  const catalogFetch = measureFetch(rawCatalogFetch, logger, config.id, 'direct');
  const probeFetch = measureFetch(createProbeFetch(), logger, config.id, 'proxy');
  return buildStockRevealer(
    config,
    logger,
    async (): Promise<Catalog> => fetchShopifyCatalog(config.endpoint, config.domain, logger, catalogFetch),
    async (target: StockRevealTarget): Promise<Catalog> =>
      revealStockImpl(target, config, logger, catalogFetch, probeFetch)
  );
}
