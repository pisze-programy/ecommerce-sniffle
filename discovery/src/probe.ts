import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { classifyProbe, estimateTotal, parseProductsPage, MAX_PRODUCTS_PER_PAGE } from './common.ts';
import type { ProbeClass, ProbeResult } from './common.ts';

// Probe candidate stores. Confirm Shopify and count the products.

const logger = createLogger(consoleSink);

const RETRIES = 2;
const CONCURRENCY = 15;
const RATE_PER_SECOND = 15;
const RETRY_DELAY_MS = 1500;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MARKER = '__STATUS__:';

const execFile = promisify(execFileCb);

// Pace all requests. A burst trips the shop rate limiter.
function createRateLimiter(perSecond: number): () => Promise<void> {
  let last = 0;
  const minInterval = 1000 / perSecond;
  return async (): Promise<void> => {
    const now = Date.now();
    const nextSlot = last + minInterval;
    const wait = now < nextSlot ? nextSlot - now : 0;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    last = Math.max(now, nextSlot);
  };
}

const take = createRateLimiter(RATE_PER_SECOND);

interface ProbeRow {
  readonly host: string;
  readonly klass: ProbeClass;
  readonly products: number;
  readonly capped: boolean;
  readonly robots: boolean;
  readonly policies: boolean;
  readonly password: boolean;
}

function parseArgInt(argv: readonly string[], name: string, fallback: number): number {
  const index = argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = argv[index + 1];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
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

// Fetch via curl. The node fetch client is blocked by the shop bot guard.
async function fetchText(url: string): Promise<{ status: number; body: string }> {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    await take();
    try {
      const { stdout } = await execFile(
        'curl',
        [
          '-s',
          '-L',
          '--max-time',
          '15',
          '-A',
          USER_AGENT,
          '-H',
          'Accept: application/json, text/plain',
          '-w',
          `\n${MARKER}%{http_code}`,
          url,
        ],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const markerIndex = stdout.lastIndexOf(MARKER);
      const codeText = markerIndex >= 0 ? stdout.slice(markerIndex + MARKER.length).trim() : '0';
      const code = Number.parseInt(codeText, 10);
      const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
      if ((code === 429 || code >= 500) && attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      return { status: code, body };
    } catch (error: unknown) {
      if (attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      return { status: 0, body: message };
    }
  }
  return { status: 0, body: 'retries exhausted' };
}

async function probeHost(host: string, maxPages: number): Promise<ProbeRow> {
  const base = `https://${host}/products.json`;
  const first = await fetchText(`${base}?limit=${MAX_PRODUCTS_PER_PAGE}&page=1`);
  const classified: ProbeResult = classifyProbe(first.status, first.body);
  if (classified.klass !== 'shopify') {
    return {
      host,
      klass: classified.klass,
      products: classified.pageCount === null ? 0 : classified.pageCount,
      capped: false,
      robots: false,
      policies: false,
      password: classified.password,
    };
  }
  const pageCount = classified.pageCount;
  let products = pageCount === null ? 0 : pageCount;
  let capped = false;
  if (pageCount !== null) {
    const total = await estimateTotal(
      pageCount,
      async (page: number): Promise<number | null> => {
        const result = await fetchText(`${base}?limit=${MAX_PRODUCTS_PER_PAGE}&page=${page}`);
        return parseProductsPage(result.body);
      },
      maxPages
    );
    products = total.count;
    capped = total.capped;
  }
  const robots = await fetchText(`https://${host}/robots.txt`);
  const policies = await fetchText(`https://${host}/policies/terms-of-service`);
  return {
    host,
    klass: 'shopify',
    products,
    capped,
    robots: robots.status === 200,
    policies: policies.status === 200,
    password: classified.password,
  };
}

async function main(): Promise<void> {
  const inPath = parseArgString(process.argv, '--in', 'out/candidates.jsonl');
  const outPath = parseArgString(process.argv, '--out', 'out/probed.csv');
  const maxPages = parseArgInt(process.argv, '--max-pages', 20);

  const content = await readFile(inPath, 'utf8');
  const hosts = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  logger.info('probe.start', { hosts: hosts.length, maxPages });

  const rows: ProbeRow[] = [];
  let index = 0;
  const counts: Record<ProbeClass, number> = { shopify: 0, empty: 0, other: 0 };

  async function worker(): Promise<void> {
    while (index < hosts.length) {
      const host = hosts[index];
      index += 1;
      if (host === undefined) {
        continue;
      }
      let row: ProbeRow;
      try {
        row = await probeHost(host, maxPages);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('probe.host failed', { host, error: message });
        row = {
          host,
          klass: 'other',
          products: 0,
          capped: false,
          robots: false,
          policies: false,
          password: false,
        };
      }
      counts[row.klass] += 1;
      rows.push(row);
      logger.info('probe.row', {
        host,
        klass: row.klass,
        products: row.products,
        capped: row.capped,
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  rows.sort((a, b) => b.products - a.products);
  await mkdir('out', { recursive: true });
  const header = 'host,class,products,capped,robots,policies,password';
  const lines = [header];
  for (const row of rows) {
    lines.push(
      `${row.host},${row.klass},${row.products},${row.capped ? 1 : 0},${row.robots ? 1 : 0},${row.policies ? 1 : 0},${row.password ? 1 : 0}`
    );
  }
  await writeFile(outPath, `${lines.join('\n')}\n`);
  logger.info('probe.done', {
    total: rows.length,
    shopify: counts['shopify'],
    empty: counts['empty'],
    other: counts['other'],
    out: outPath,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('probe.fatal', { error: message });
  process.exitCode = 1;
});
