import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { sendReport, cronReport } from './snitch.ts';
import type { SnitchStatus } from './snitch.ts';

interface SummaryEntry {
  readonly providerId: string;
  readonly bytes: number;
}

interface Summary {
  readonly window: string;
  readonly day: string;
  readonly done: readonly string[];
  readonly failed: readonly { providerId: string; error: string | null }[];
  readonly pending: readonly string[];
  readonly transferBytes: number;
  readonly perProvider: readonly SummaryEntry[];
}

const WARN_BYTES = 1024 * 1024;

export async function runCronSummary(window: string, logger: Logger): Promise<void> {
  const backendUrl = process.env['BACKEND_URL'];
  const secret = process.env['INGEST_SECRET'];
  if (backendUrl === undefined || backendUrl.length === 0 || secret === undefined || secret.length === 0) {
    logger.warn('summary disabled: BACKEND_URL or INGEST_SECRET not set');
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  let summary: Summary;
  try {
    const response = await fetch(`${backendUrl}/summary/${window}/${day}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) {
      logger.warn('summary query failed', { status: response.status });
      return;
    }
    summary = (await response.json()) as Summary;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('summary query error', { error: message });
    return;
  }
  const messages: string[] = [];
  for (const entry of summary.failed) {
    messages.push(`FAILED ${entry.providerId}: ${entry.error ?? 'no error'}`);
  }
  if (summary.pending.length > 0) {
    messages.push(`PENDING: ${summary.pending.join(', ')}`);
  }
  for (const entry of summary.perProvider) {
    if (entry.bytes > WARN_BYTES) {
      messages.push(`WARN ${entry.providerId}: ${(entry.bytes / 1000000).toFixed(1)}MB > 1MB`);
    }
  }
  if (messages.length === 0) {
    messages.push('all providers done, no errors, no pending');
  }
  const status: SnitchStatus = summary.failed.length > 0 || summary.pending.length > 0 ? 'failed' : 'ok';
  const transferMb = (summary.transferBytes / WARN_BYTES).toFixed(1);
  await sendReport(
    cronReport(
      window,
      status,
      {
        providers: summary.done.length + summary.failed.length,
        done: summary.done.length,
        failed: summary.failed.length,
        pending: summary.pending.length,
        transferBytes: summary.transferBytes,
        transferMb: Number(transferMb),
      },
      messages.join('\n')
    ),
    logger
  );
}

function main(): void {
  const logger = createLogger(consoleSink);
  const window = process.argv[2] ?? '';
  if (window !== 'morning' && window !== 'evening') {
    logger.error('usage: node dist/summary.js <morning|evening>');
    return;
  }
  runCronSummary(window, logger)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      logger.error('summary failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}

if (import.meta.url.endsWith('summary.js')) {
  main();
}
