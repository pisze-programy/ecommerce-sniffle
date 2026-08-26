import { buildStockRevealer } from '../../../factory.ts';
import { measureFetch } from '../../../network/manager.ts';
import type { WrappedFetch } from '../../../network/manager.ts';
import type { DirectFetch } from '../../../module.ts';
import type { Logger } from '../../../logger.ts';
import type { Catalog, Product, ProviderConfig, StockRevealTarget, StockRevealer, Variant } from '../../../types.ts';
import { fetchShopifyCatalog } from './adapter.ts';
import { createProbeFetch } from './cart-probe.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// The shop clamps the quantity to the exact stock.
const PROBE_QUANTITY = 999999;
// Batch size 5 is broken on some shops. The server duplicates the last
// item and reports a lower count. Batch size 10 is verified clean.
const MCP_BATCH = 10;
const REVEAL_CONCURRENCY = 5;
const MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 1000;

export interface McpCount {
  readonly title: string;
  readonly count: number;
}

export interface McpEntry {
  readonly product: Product;
  readonly variant: Variant;
  readonly title: string;
}

export interface McpBatchResult {
  readonly ok: boolean;
  readonly counts: Map<string, number>;
}

export interface McpSingleResult {
  readonly ok: boolean;
  readonly count: number | null;
}

export function toMcpGid(variantId: string): string {
  return `gid://shopify/ProductVariant/${variantId}`;
}

// The MCP server reports the variant title. A variant without options
// uses the product title. A variant with options appends the option.
export function mcpVariantTitle(product: Product, variant: Variant): string {
  const suffix = variant.title === 'Default Title' ? '' : ` - ${variant.title}`;
  return `${product.title}${suffix}`;
}

export function extractCountAndTitle(message: string): McpCount | null {
  const english = /You can only add (\d+) (.+?) to the cart\./i.exec(message);
  if (english !== null) {
    return { count: Number(english[1]), title: english[2]?.trim() ?? '' };
  }
  const polish = /tylko\s+(\d+)\s+(.+)$/i.exec(message);
  if (polish !== null) {
    let title = polish[2]?.trim() ?? '';
    if (title.endsWith('.')) {
      title = title.slice(0, -1);
    }
    return { count: Number(polish[1]), title };
  }
  return null;
}

export function parseBodyJson(text: string): unknown {
  if (text.startsWith('data:')) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        if (payload.length > 0) {
          try {
            return JSON.parse(payload);
          } catch {
            continue;
          }
        }
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface McpParseResult {
  readonly parsed: boolean;
  readonly counts: readonly McpCount[];
}

export function parseMcpCounts(text: string, logger: Logger): McpParseResult {
  const outer = parseBodyJson(text);
  if (typeof outer !== 'object' || outer === null) {
    logger.warn('mcp-inventory.response parse failed', {});
    return { parsed: false, counts: [] };
  }
  const outerRecord = outer as Readonly<Record<string, unknown>>;
  const result = outerRecord['result'] as Readonly<Record<string, unknown>> | undefined;
  const content = result?.['content'];
  if (!Array.isArray(content)) {
    return { parsed: false, counts: [] };
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
    return { parsed: false, counts: [] };
  }
  const inner = parseBodyJson(innerText);
  if (typeof inner !== 'object' || inner === null) {
    logger.warn('mcp-inventory.inner parse failed', {});
    return { parsed: false, counts: [] };
  }
  const errors = (inner as Readonly<Record<string, unknown>>)['errors'];
  if (!Array.isArray(errors)) {
    return { parsed: true, counts: [] };
  }
  const counts: McpCount[] = [];
  for (const entry of errors) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    const field = record['field'];
    if (!Array.isArray(field) || field[0] !== 'add_items' || field[2] !== 'quantity') {
      continue;
    }
    const message = typeof record['message'] === 'string' ? record['message'] : '';
    const parsed = extractCountAndTitle(message);
    if (parsed !== null) {
      counts.push(parsed);
    }
  }
  return { parsed: true, counts };
}

export function buildBatches(entries: readonly McpEntry[], batchSize: number): readonly (readonly McpEntry[])[] {
  const batches: McpEntry[][] = [];
  const batchTitles: Set<string>[] = [];
  for (const entry of entries) {
    let placed = false;
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];
      const titles = batchTitles[i];
      if (batch === undefined || titles === undefined) {
        continue;
      }
      if (batch.length < batchSize && !titles.has(entry.title)) {
        batch.push(entry);
        titles.add(entry.title);
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push([entry]);
      batchTitles.push(new Set([entry.title]));
    }
  }
  return batches;
}

async function probeBatch(
  domain: string,
  entries: readonly McpEntry[],
  logger: Logger,
  probeFetch: WrappedFetch
): Promise<McpBatchResult> {
  const items = entries.map((entry) => ({
    product_variant_id: toMcpGid(entry.variant.id),
    quantity: PROBE_QUANTITY,
  }));
  let text: string;
  try {
    const response = await probeFetch(`https://${domain}/api/mcp`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'update_cart', arguments: { add_items: items } },
      }),
    });
    if (!response.ok) {
      logger.warn('mcp-inventory.http error', { domain, status: response.status });
      return { ok: false, counts: new Map() };
    }
    text = await response.text();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('mcp-inventory.probe failed', {
      domain,
      variants: entries.length,
      error: message,
    });
    return { ok: false, counts: new Map() };
  }
  const parsed = parseMcpCounts(text, logger);
  if (!parsed.parsed) {
    logger.warn('mcp-inventory.response unreadable', { domain });
    return { ok: false, counts: new Map() };
  }
  const counts = parsed.counts;
  const byTitle = new Map<string, number[]>();
  for (const count of counts) {
    const values = byTitle.get(count.title) ?? [];
    values.push(count.count);
    byTitle.set(count.title, values);
  }
  const result = new Map<string, number>();
  for (const [title, values] of byTitle) {
    // A shop can split one clamp into several cart lines (for example a
    // buy-2-get-1 promotion). The lines sum to the exact stock.
    const total = values.reduce((sum, value) => sum + value, 0);
    result.set(title, total);
  }
  return { ok: true, counts: result };
}

async function probeSingle(
  domain: string,
  entry: McpEntry,
  logger: Logger,
  probeFetch: WrappedFetch
): Promise<McpSingleResult> {
  let sawOk = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await probeBatch(domain, [entry], logger, probeFetch);
    if (result.ok) {
      sawOk = true;
    }
    const count = result.counts.get(entry.title);
    if (count !== undefined) {
      return { ok: true, count };
    }
    if (attempt < MAX_ATTEMPTS) {
      logger.warn('mcp-inventory.retry', {
        domain,
        variantId: entry.variant.id,
        attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
    }
  }
  return { ok: sawOk, count: null };
}

function buildEntries(catalog: Catalog, wanted: Set<string>): McpEntry[] {
  const entries: McpEntry[] = [];
  for (const product of catalog.products) {
    if (wanted.size > 0 && !wanted.has(product.id)) {
      continue;
    }
    for (const variant of product.variants) {
      // An unavailable variant cannot be probed. The catalog marks it 0.
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
  const batches = buildBatches(entries, MCP_BATCH);
  const probes = new Map<string, McpSingleResult>();
  let requests = 0;
  let batchIndex = 0;
  async function worker(): Promise<void> {
    while (batchIndex < batches.length) {
      const batch = batches[batchIndex];
      batchIndex += 1;
      if (batch === undefined) {
        continue;
      }
      const result = await probeBatch(config.domain, batch, logger, probeFetch);
      requests += 1;
      for (const entry of batch) {
        const count = result.counts.get(entry.title);
        if (count !== undefined) {
          probes.set(entry.variant.id, { ok: true, count });
          continue;
        }
        if (result.ok) {
          // The shop accepted the huge quantity. The stock is not capped.
          // Resolve it now with the availability flag.
          probes.set(entry.variant.id, { ok: true, count: null });
        }
      }
    }
  }
  await Promise.all(Array.from({ length: REVEAL_CONCURRENCY }, () => worker()));
  for (const entry of entries) {
    if (probes.has(entry.variant.id)) {
      continue;
    }
    const result = await probeSingle(config.domain, entry, logger, probeFetch);
    requests += 1;
    probes.set(entry.variant.id, result);
  }
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
          // The shop accepted the huge quantity. The stock is not capped.
          logger.warn('mcp-inventory.no cap', { domain: config.domain, variantId: variant.id });
          return { ...variant, quantity: variant.available ? 1 : 0 };
        }
        logger.warn('mcp-inventory.unresolved', {
          domain: config.domain,
          variantId: variant.id,
        });
        return { ...variant, quantity: null };
      });
      return { ...product, variants };
    });
  logger.debug('mcp-inventory run done', {
    domain: config.domain,
    variants: entries.length,
    resolved: probes.size,
    requests,
  });
  return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
}

export function buildMcpInventoryProvider(
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
