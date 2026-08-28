import type { ProviderConfig } from '@ecommerce-sniffle/providers';
import type { LogRecord } from '@ecommerce-sniffle/providers';

// Common helpers for the discovery tool.

// One candidate store hostname per line in the candidates file.
export function hostFromUrl(url: string): string {
  const parts = url.split('://');
  const withoutProto = parts.length > 1 && parts[1] !== undefined ? parts[1] : url;
  const withoutProtoParts = withoutProto.split('/');
  const host = withoutProtoParts.length > 0 && withoutProtoParts[0] !== undefined ? withoutProtoParts[0] : '';
  return normalizeHost(host);
}

export function normalizeHost(input: string): string {
  const trimmed = input.trim().toLowerCase();
  let host = trimmed;
  if (host.startsWith('https://')) {
    host = host.slice(8);
  }
  if (host.startsWith('http://')) {
    host = host.slice(7);
  }
  const slash = host.indexOf('/');
  if (slash >= 0) {
    host = host.slice(0, slash);
  }
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  return host;
}

export interface CcRecord {
  readonly url: string;
  readonly status: string;
}

// Parse one Common Crawl index line. Return null when the line is invalid.
export function parseCcLine(line: string): CcRecord | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Readonly<Record<string, unknown>>;
    const url = parsed['url'];
    const status = parsed['status'];
    if (typeof url !== 'string' || typeof status !== 'string') {
      return null;
    }
    return { url, status };
  } catch {
    return null;
  }
}

export type ProbeClass = 'shopify' | 'empty' | 'other';

export interface ProbeResult {
  readonly klass: ProbeClass;
  readonly pageCount: number | null;
  readonly password: boolean;
}

// Classify the response of a products.json probe.
export function classifyProbe(status: number, body: string): ProbeResult {
  const lower = body.toLowerCase();
  const password = lower.includes('password');
  if (status !== 200) {
    return { klass: 'other', pageCount: null, password };
  }
  try {
    const parsed = JSON.parse(body) as Readonly<Record<string, unknown>>;
    const products = parsed['products'];
    if (!Array.isArray(products)) {
      return { klass: 'other', pageCount: null, password };
    }
    const count = products.length;
    if (count === 0) {
      return { klass: 'empty', pageCount: 0, password };
    }
    return { klass: 'shopify', pageCount: count, password };
  } catch {
    return { klass: 'other', pageCount: null, password };
  }
}

// Extract the product count from a products.json page body.
// Return null when the body is not a valid products page.
export function parseProductsPage(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as Readonly<Record<string, unknown>>;
    const products = parsed['products'];
    if (!Array.isArray(products)) {
      return null;
    }
    return products.length;
  } catch {
    return null;
  }
}

export const MAX_PRODUCTS_PER_PAGE = 250;

// Count the total products of a shop. The caller provides the first page.
// The cap prevents an endless loop on very large shops.
export function estimateTotal(
  firstPageCount: number,
  fetchPage: (page: number) => Promise<number | null>,
  maxPages: number
): Promise<{ count: number; capped: boolean }> {
  if (firstPageCount < MAX_PRODUCTS_PER_PAGE) {
    return Promise.resolve({ count: firstPageCount, capped: false });
  }
  return countRemainingPages(firstPageCount, fetchPage, maxPages);
}

async function countRemainingPages(
  firstPageCount: number,
  fetchPage: (page: number) => Promise<number | null>,
  maxPages: number
): Promise<{ count: number; capped: boolean }> {
  let total = firstPageCount;
  for (let page = 2; page <= maxPages; page += 1) {
    const count = await fetchPage(page);
    if (count === null) {
      break;
    }
    total += count;
    if (count < MAX_PRODUCTS_PER_PAGE) {
      return { count: total, capped: false };
    }
  }
  const capped = total >= MAX_PRODUCTS_PER_PAGE * maxPages;
  return { count: total, capped };
}

export function buildCandidateConfig(host: string): ProviderConfig {
  return {
    id: host,
    domain: host,
    platform: 'shopify',
    schedule: '0 2 * * *',
    mode: 'vps-mutation',
    window: 'both',
    stockSource: 'mcp-inventory',
    ratePerSecond: 1,
    durationSeconds: 30,
    requiresProxy: true,
    endpoint: `https://${host}/products.json`,
    enabled: true,
  };
}

// Sum the webshare transfer from the proxy request logs.
export function sumProxyBytes(records: readonly LogRecord[]): number {
  let total = 0;
  for (const record of records) {
    if (record.message !== 'proxy.request') {
      continue;
    }
    const via = record.context['via'];
    if (via !== 'proxy') {
      continue;
    }
    const requestBytes = record.context['requestBytes'];
    if (requestBytes !== undefined) {
      total += Number(requestBytes);
    }
    const responseBytes = record.context['responseBytes'];
    if (responseBytes !== undefined) {
      total += Number(responseBytes);
    }
  }
  return total;
}
