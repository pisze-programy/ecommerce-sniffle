import type { Logger } from '@ecommerce-sniffle/providers';
import { readIngestConfig } from './ingest.ts';

export interface TaskUsage {
  readonly taskId: string;
  readonly providerId: string;
  readonly window: string;
  readonly day: string;
  readonly elapsedMs: number;
  readonly webshareBytes: number;
  readonly proxyBytes: number;
  readonly status: string;
  readonly masked: number;
  readonly variants: number;
}

export async function storeTaskUsage(usage: TaskUsage, logger: Logger): Promise<void> {
  const config = readIngestConfig();
  if (config === null) {
    return;
  }
  try {
    const response = await fetch(`${config.backendUrl}/task/usage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(usage),
    });
    if (!response.ok) {
      logger.warn('usage store rejected', { providerId: usage.providerId, status: response.status });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('usage store failed', { providerId: usage.providerId, error: message });
  }
}
