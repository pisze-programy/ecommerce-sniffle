import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { buildMcpInventoryProvider } from '@ecommerce-sniffle/providers/mcp-inventory';
import type { LogRecord } from '@ecommerce-sniffle/providers';
import { buildCandidateConfig, sumProxyBytes } from './common.ts';

// Deep scan the top stores with the MCP inventory reveal.
// Measure the webshare transfer for every store.

const logger = createLogger(consoleSink);

const STORE_CONCURRENCY = 3;

interface ProbedRow {
  readonly host: string;
  readonly klass: string;
  readonly products: number;
}

interface RankedRow {
  readonly rank: number;
  readonly host: string;
  readonly products: number;
  readonly catalogVariants: number;
  readonly masked: number;
  readonly zero: number;
  readonly stock: number;
  readonly transferKB: number;
  readonly timeMs: number;
  readonly status: string;
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

function parseProbedCsv(text: string): ProbedRow[] {
  const rows: ProbedRow[] = [];
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (line === undefined || line.length === 0) {
      continue;
    }
    const parts = line.split(',');
    rows.push({
      host: parts[0] === undefined ? '' : parts[0],
      klass: parts[1] === undefined ? '' : parts[1],
      products: Number(parts[2] === undefined ? 0 : parts[2]),
    });
  }
  return rows;
}

function computeStats(catalog: {
  readonly products: readonly {
    readonly variants: readonly { readonly quantity: number | null }[];
  }[];
}): { total: number; masked: number; zero: number; stock: number } {
  let total = 0;
  let masked = 0;
  let zero = 0;
  let stock = 0;
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      total += 1;
      if (variant.quantity === null) {
        masked += 1;
        continue;
      }
      if (variant.quantity === 0) {
        zero += 1;
      }
      stock += variant.quantity;
    }
  }
  return { total, masked, zero, stock };
}

async function main(): Promise<void> {
  const inPath = parseArgString(process.argv, '--in', 'out/probed.csv');
  const outPath = parseArgString(process.argv, '--out', 'out/ranked.csv');
  const top = parseArgInt(process.argv, '--top', 50);

  const proxyUrl = process.env['WEBSHARE_URL'];
  if (proxyUrl === undefined || proxyUrl.length === 0) {
    logger.error('deep.no webshare', { error: 'WEBSHARE_URL is not set' });
    process.exitCode = 1;
    return;
  }

  const probedText = await readFile(inPath, 'utf8');
  const rows = parseProbedCsv(probedText)
    .filter((row) => row.klass === 'shopify')
    .sort((a, b) => b.products - a.products)
    .slice(0, top);

  logger.info('deep.start', { stores: rows.length, top });

  await mkdir('out', { recursive: true });
  await writeFile(outPath, 'rank,host,products,catalogVariants,masked,zero,stock,transferKB,timeMs,status\n');

  const ranked: RankedRow[] = [];
  let index = 0;
  let totalTransferBytes = 0;
  let totalTimeMs = 0;

  async function worker(): Promise<void> {
    while (index < rows.length) {
      const row = rows[index];
      index += 1;
      if (row === undefined) {
        continue;
      }
      const rank = index;
      const records: LogRecord[] = [];
      const storeLogger = createLogger((record: LogRecord): void => {
        records.push(record);
      });
      const config = buildCandidateConfig(row.host);
      const provider = buildMcpInventoryProvider(config, storeLogger);
      const start = Date.now();
      let catalogVariants = 0;
      let masked = 0;
      let zero = 0;
      let stock = 0;
      let status = 'ok';
      try {
        const catalog = await provider.revealStock({ productIds: [] });
        const stats = computeStats(catalog);
        catalogVariants = stats.total;
        masked = stats.masked;
        zero = stats.zero;
        stock = stats.stock;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('deep.reveal failed', { host: row.host, error: message });
        status = 'error';
      }
      const timeMs = Date.now() - start;
      const transferBytes = sumProxyBytes(records);
      totalTransferBytes += transferBytes;
      totalTimeMs += timeMs;
      const rankedRow: RankedRow = {
        rank,
        host: row.host,
        products: row.products,
        catalogVariants,
        masked,
        zero,
        stock,
        transferKB: Math.round((transferBytes / 1024) * 10) / 10,
        timeMs,
        status,
      };
      ranked.push(rankedRow);
      await writeFile(
        outPath,
        `${rank},${row.host},${row.products},${catalogVariants},${masked},${zero},${stock},${rankedRow.transferKB},${timeMs},${status}\n`,
        { flag: 'a' }
      );
      logger.info('deep.row', {
        rank,
        host: row.host,
        products: row.products,
        catalogVariants,
        masked,
        zero,
        transferKB: rankedRow.transferKB,
        timeMs,
        status,
      });
    }
  }

  await Promise.all(Array.from({ length: STORE_CONCURRENCY }, () => worker()));

  const totalTransferMB = totalTransferBytes / (1024 * 1024);
  logger.info('deep.done', {
    stores: ranked.length,
    totalTransferMB: Math.round(totalTransferMB * 100) / 100,
    totalTimeMs,
    out: outPath,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('deep.fatal', { error: message });
  process.exitCode = 1;
});
