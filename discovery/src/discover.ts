import { writeFile, mkdir } from 'node:fs/promises';
import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { normalizeHost } from './common.ts';
import { collectCcHosts } from './cc.ts';

// Discover candidate Shopify store hostnames.
// Sources: Common Crawl URL index and certificate transparency logs.

const logger = createLogger(consoleSink);

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

interface CrtEntry {
  readonly name_value: string;
}

// Fetch store hostnames from certificate transparency logs.
// The service is often unavailable. Return an empty list on failure.
async function fetchCrtHosts(retries: number): Promise<string[]> {
  const url = 'https://crt.sh/?q=%25.myshopify.com&output=json';
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ecommerce-discovery/0.1', Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`crt.sh http ${response.status}`);
      }
      const body = await response.text();
      const entries = JSON.parse(body) as CrtEntry[];
      const hosts = new Set<string>();
      for (const entry of entries) {
        for (const name of entry.name_value.split('\n')) {
          hosts.add(normalizeHost(name));
        }
      }
      logger.info('discover.crtsh ok', { entries: entries.length, hosts: hosts.size });
      return [...hosts];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('discover.crtsh failed', { attempt, error: message });
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
  }
  return [];
}

async function main(): Promise<void> {
  const pages = parseArgInt(process.argv, '--pages', 5);
  const outPath = parseArgString(process.argv, '--out', 'out/candidates.jsonl');
  const crtRetries = parseArgInt(process.argv, '--crt-retries', 3);

  const hosts = new Set<string>();
  const ccResult = await collectCcHosts(
    pages,
    fetch,
    (message: string, context: Record<string, string | number | boolean>): void => {
      logger.info(message, context);
    }
  );
  for (const host of ccResult.hosts) {
    hosts.add(host);
  }

  const crtHosts = await fetchCrtHosts(crtRetries);
  for (const host of crtHosts) {
    hosts.add(host);
  }

  await mkdir('out', { recursive: true });
  const sorted = [...hosts].sort();
  await writeFile(outPath, `${sorted.join('\n')}\n`);
  logger.info('discover.done', {
    ccHosts: ccResult.hosts.length,
    crtHosts: crtHosts.length,
    total: sorted.length,
    out: outPath,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('discover.fatal', { error: message });
  process.exitCode = 1;
});
