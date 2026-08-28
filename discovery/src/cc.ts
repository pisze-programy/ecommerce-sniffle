import { parseCcLine, hostFromUrl } from './common.ts';
import type { CcRecord } from './common.ts';

// Common Crawl index helpers.

export const CC_INDEX_BASE = 'https://index.commoncrawl.org';

// Fetch the latest crawl id from the collinfo file.
export async function fetchLatestCrawlId(fetchFn: typeof fetch): Promise<string> {
  const response = await fetchFn(`${CC_INDEX_BASE}/collinfo.json`, {
    headers: { 'User-Agent': 'ecommerce-discovery/0.1' },
  });
  if (!response.ok) {
    throw new Error(`collinfo failed: ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('collinfo empty');
  }
  const first = body[0] as Readonly<Record<string, unknown>>;
  const id = first['id'];
  if (typeof id !== 'string') {
    throw new Error('collinfo no id');
  }
  return id;
}

// Fetch one page of the myshopify.com URL index.
export async function fetchMyshopifyPage(crawlId: string, page: number, fetchFn: typeof fetch): Promise<CcRecord[]> {
  const url = `${CC_INDEX_BASE}/${crawlId}-index?url=*.myshopify.com&output=json&page=${page}&limit=10000`;
  const response = await fetchFn(url, {
    headers: { 'User-Agent': 'ecommerce-discovery/0.1' },
  });
  if (!response.ok) {
    throw new Error(`index failed: ${response.status}`);
  }
  const text = await response.text();
  const records: CcRecord[] = [];
  for (const line of text.split('\n')) {
    const record = parseCcLine(line);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

// Collect unique hostnames from Common Crawl.
export async function collectCcHosts(
  pages: number,
  fetchFn: typeof fetch,
  log: (message: string, context: Record<string, string | number | boolean>) => void
): Promise<{ hosts: string[]; crawlId: string; records: number }> {
  const crawlId = await fetchLatestCrawlId(fetchFn);
  log('discover.crawl', { crawlId, pages });
  const hosts = new Set<string>();
  let records = 0;
  for (let page = 0; page < pages; page += 1) {
    let data: CcRecord[];
    try {
      data = await fetchMyshopifyPage(crawlId, page, fetchFn);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('discover.cc page failed', { page, error: message });
      continue;
    }
    for (const record of data) {
      records += 1;
      hosts.add(hostFromUrl(record.url));
    }
    log('discover.cc page', { page, lines: data.length, distinctHosts: hosts.size });
    if (data.length < 10000) {
      break;
    }
  }
  return { hosts: [...hosts], crawlId, records };
}
