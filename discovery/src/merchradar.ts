import { writeFile, mkdir } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { normalizeHost, estimateTotal, MAX_PRODUCTS_PER_PAGE } from './common.ts';
import { detectPlatform, detectPlatformFromCdn } from './platform.ts';
import type { Platform } from './platform.ts';

// Pull the merchradar catalog. Save the creators and the store survey.

const logger = createLogger(consoleSink);

const API_BASE = 'https://merchradar.pl/api/v1';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MARKER = '__STATUS__:';
const MAX_SOURCE_PAGES = 25;
const PER_PAGE = 24;
const STORE_CONCURRENCY = 4;
const DELAY_MS = 100;

function firstCdn(row: StoreAgg): string {
  for (const cdn of row.cdns) {
    return cdn;
  }
  return '';
}

// The page probe may be rate-limited. Fall back to the CDN hint.
function effectiveTech(row: StoreAgg): Platform {
  for (const cdn of row.cdns) {
    const hint = detectPlatformFromCdn(cdn);
    if (hint !== null) {
      return hint;
    }
  }
  return 'other';
}

const execFile = promisify(execFileCb);

async function curlText(url: string): Promise<{ status: number; body: string }> {
  const { stdout } = await execFile(
    'curl',
    ['-s', '-L', '--max-time', '20', '-A', USER_AGENT, '-w', `\n${MARKER}%{http_code}`, url],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const markerIndex = stdout.lastIndexOf(MARKER);
  const codeText = markerIndex >= 0 ? stdout.slice(markerIndex + MARKER.length).trim() : '0';
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  return { status: Number.parseInt(codeText, 10), body };
}

async function curlJson<T>(url: string, attempt = 1): Promise<T | null> {
  const { status, body } = await curlText(url);
  if (status !== 200 || body.length === 0) {
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      return curlJson<T>(url, attempt + 1);
    }
    return null;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      return curlJson<T>(url, attempt + 1);
    }
    return null;
  }
}

interface SourceRow {
  readonly source: string;
  readonly label: string;
  readonly category: string;
  readonly subscribers: number;
  readonly total: number;
  readonly available: number;
}

interface ProductsResponse {
  readonly data: {
    readonly products: readonly {
      readonly external_product_url: string | null;
      readonly external_image_url: string | null;
    }[];
    readonly pagination: {
      readonly has_more: boolean;
      readonly next_page: number | null;
    } | null;
  };
}

interface SourceAgg {
  readonly counts: Map<string, number>;
  readonly cdns: Map<string, Set<string>>;
}

interface StoreAgg {
  readonly domain: string;
  readonly creators: Set<string>;
  readonly cdns: Set<string>;
  productsMr: number;
}

function sourceDomain(url: string): string | null {
  const host = normalizeHost(url);
  if (host.length === 0) {
    return null;
  }
  if (host.startsWith('www.')) {
    return host.slice(4);
  }
  return host;
}

async function fetchSourceProducts(source: string): Promise<SourceAgg> {
  const counts = new Map<string, number>();
  const cdns = new Map<string, Set<string>>();
  let page = 1;
  while (page <= MAX_SOURCE_PAGES) {
    const url = `${API_BASE}/products?source=${encodeURIComponent(source)}&page=${page}&per_page=${PER_PAGE}`;
    const response = await curlJson<ProductsResponse>(url);
    if (response === null) {
      break;
    }
    for (const product of response.data.products) {
      const external = product.external_product_url;
      if (external === null) {
        continue;
      }
      const domain = sourceDomain(external);
      if (domain === null) {
        continue;
      }
      const current = counts.get(domain);
      counts.set(domain, current === undefined ? 1 : current + 1);
      const image = product.external_image_url;
      if (image !== null) {
        const imageHost = normalizeHost(image);
        if (imageHost.length > 0) {
          const set = cdns.get(domain);
          if (set === undefined) {
            cdns.set(domain, new Set([imageHost]));
          } else {
            set.add(imageHost);
          }
        }
      }
    }
    const pagination = response.data.pagination;
    if (pagination === null || !pagination.has_more || pagination.next_page === null) {
      break;
    }
    page = pagination.next_page;
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
  return { counts, cdns };
}

interface ProbedStore {
  readonly domain: string;
  readonly status: number;
  readonly tech: Platform;
  readonly shopifyProducts: number | null;
}

async function curlTextRetry(url: string): Promise<{ status: number; body: string }> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await curlText(url);
    if (result.status !== 429 && result.status !== 503) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
  }
  return curlText(url);
}

async function probeStore(domain: string): Promise<ProbedStore> {
  const home = await curlTextRetry(`https://${domain}/`);
  const tech = detectPlatform(home.status, home.body);
  let shopifyProducts: number | null = null;
  if (tech === 'shopify' && home.status === 200) {
    const base = `https://${domain}/products.json`;
    const first = await curlTextRetry(`${base}?limit=${MAX_PRODUCTS_PER_PAGE}&page=1`);
    try {
      const parsed = JSON.parse(first.body) as Readonly<Record<string, unknown>>;
      const products = parsed['products'];
      if (Array.isArray(products) && products.length > 0) {
        const total = await estimateTotal(
          products.length,
          async (page: number): Promise<number | null> => {
            const result = await curlTextRetry(`${base}?limit=${MAX_PRODUCTS_PER_PAGE}&page=${page}`);
            try {
              const parsedPage = JSON.parse(result.body) as Readonly<Record<string, unknown>>;
              const items = parsedPage['products'];
              return Array.isArray(items) ? items.length : null;
            } catch {
              return null;
            }
          },
          20
        );
        shopifyProducts = total.count;
      }
    } catch {
      shopifyProducts = null;
    }
  }
  return { domain, status: home.status, tech, shopifyProducts };
}

async function main(): Promise<void> {
  const outDir = 'out';
  const creatorsPath = parseArgString(process.argv, '--creators-out', `${outDir}/merchradar-creators.csv`);
  const storesPath = parseArgString(process.argv, '--stores-out', `${outDir}/merchradar-stores.csv`);

  await mkdir(outDir, { recursive: true });

  const sourcesResponse = await curlJson<{ data: { sources: readonly SourceRow[] } }>(`${API_BASE}/sources`);
  if (sourcesResponse === null) {
    logger.error('merchradar.sources failed', { error: 'sources api unreadable' });
    process.exitCode = 1;
    return;
  }
  const sources = sourcesResponse.data.sources;
  logger.info('merchradar.sources', { sources: sources.length });

  const stores = new Map<string, StoreAgg>();
  for (const source of sources) {
    let agg: SourceAgg;
    try {
      agg = await fetchSourceProducts(source.source);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('merchradar.source failed', { source: source.source, error: message });
      continue;
    }
    for (const [domain, count] of agg.counts) {
      const existing = stores.get(domain);
      if (existing === undefined) {
        stores.set(domain, {
          domain,
          creators: new Set([source.label]),
          cdns: agg.cdns.get(domain) ?? new Set<string>(),
          productsMr: count,
        });
      } else {
        existing.creators.add(source.label);
        existing.productsMr += count;
        const sourceCdns = agg.cdns.get(domain);
        if (sourceCdns !== undefined) {
          for (const cdn of sourceCdns) {
            existing.cdns.add(cdn);
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  logger.info('merchradar.stores', { stores: stores.size });

  const rows = [...stores.values()];
  const probed = new Map<string, ProbedStore>();
  let index = 0;
  async function worker(): Promise<void> {
    while (index < rows.length) {
      const row = rows[index];
      index += 1;
      if (row === undefined) {
        continue;
      }
      let result: ProbedStore;
      try {
        result = await probeStore(row.domain);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('merchradar.probe failed', { domain: row.domain, error: message });
        result = { domain: row.domain, status: 0, tech: 'other', shopifyProducts: null };
      }
      probed.set(row.domain, result);
      const tech = result.tech === 'other' ? effectiveTech(row) : result.tech;
      logger.info('merchradar.store', {
        domain: row.domain,
        status: result.status,
        tech,
        productsMr: row.productsMr,
        shopifyProducts: result.shopifyProducts,
      });
    }
  }
  await Promise.all(Array.from({ length: STORE_CONCURRENCY }, () => worker()));

  await writeFile(creatorsPath, 'source,label,category,subscribers,total,available,stores\n');
  for (const source of sources) {
    const sourceStores = new Set<string>();
    for (const [domain, agg] of stores) {
      if (agg.creators.has(source.label)) {
        sourceStores.add(domain);
      }
    }
    await writeFile(
      creatorsPath,
      `${source.source},${csv(source.label)},${source.category},${source.subscribers},${source.total},${source.available},${csv([...sourceStores].join(';'))}\n`,
      { flag: 'a' }
    );
  }

  await writeFile(storesPath, 'domain,status,tech,products_mr,products_shopify,cdn,creators\n');
  const sortedStores = [...rows].sort((a, b) => b.productsMr - a.productsMr);
  for (const row of sortedStores) {
    const probe = probed.get(row.domain);
    const status = probe?.status ?? 0;
    const tech = probe !== undefined && probe.tech !== 'other' ? probe.tech : effectiveTech(row);
    const shopify = probe?.shopifyProducts;
    const cdn = firstCdn(row);
    await writeFile(
      storesPath,
      `${row.domain},${status},${tech},${row.productsMr},${shopify === null ? '' : shopify},${cdn},${csv([...row.creators].join(';'))}\n`,
      { flag: 'a' }
    );
  }

  logger.info('merchradar.done', {
    creators: sources.length,
    stores: rows.length,
    creatorsOut: creatorsPath,
    storesOut: storesPath,
  });
}

function csv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes(';')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function parseArgString(argv: readonly string[], name: string, fallback: string): string {
  const index = argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = argv[index + 1];
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('merchradar.fatal', { error: message });
  process.exitCode = 1;
});
