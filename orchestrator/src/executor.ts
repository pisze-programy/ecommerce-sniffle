import { ALL_MODULES, createRegistry } from '@ecommerce-sniffle/providers';
import type { Logger, ProviderModule } from '@ecommerce-sniffle/providers';
import { checkMemory, MIN_AVAILABLE_MB, readProcessRss } from './guard.ts';
import { catalogToIngestSnapshot, readIngestConfig, sendSnapshot } from './ingest.ts';
import type { IngestConfig } from './ingest.ts';
import { createDirectFetch } from './direct-fetch.ts';
import { createQueueClient } from './queue-client.ts';
import type { QueueClient, Task } from './queue-client.ts';
import { isStockRevealer } from './runner.ts';
import { createUsageTracking } from './usage.ts';
import { sendReport, taskReport } from './snitch.ts';
import type { SnitchStatus } from './snitch.ts';
import { storeTaskUsage } from './usage-store.ts';

const MAX_TASKS = 20;
const TASK_TIMEOUT_MS = 25 * 60 * 1000;
const MAX_PROCESS_RSS_MB = 150;

export interface ExecutorPassResult {
  readonly processed: number;
  readonly failed: number;
}

export interface ExecutorPassOptions {
  readonly queueClient?: QueueClient;
  readonly workerId?: string;
  readonly maxTasks?: number;
  readonly checkMemoryFn?: () => boolean;
  readonly checkRssFn?: () => boolean;
  readonly modules?: readonly ProviderModule[];
  readonly taskTimeoutMs?: number;
}

async function withTaskTimeout<T>(promise: Promise<T>, timeoutMs: number, taskId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`task timeout after ${timeoutMs}ms for ${taskId}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

interface ExecutedTask {
  readonly taskId: string;
  readonly providerId: string;
  readonly variants: number;
  readonly masked: number;
  readonly window: string;
}

async function executeTask(
  logger: Logger,
  client: QueueClient,
  ingestConfig: IngestConfig,
  registry: ReturnType<typeof createRegistry>,
  directFetch: ReturnType<typeof createDirectFetch>,
  task: Task
): Promise<ExecutedTask> {
  const module = registry.findModule(task.providerId);
  if (module === null) {
    throw new Error(`unknown provider ${task.providerId}`);
  }
  const needsDirect = task.mode === 'vps-mutation' || (task.mode === 'vps-get' && !module.config.requiresProxy);
  const provider = needsDirect ? module.build({ logger, directFetch }) : module.build({ logger });
  const catalog =
    task.mode === 'vps-mutation' && isStockRevealer(provider)
      ? await provider.revealStock({ productIds: [] })
      : await provider.fetchCatalog();
  const snapshot = catalogToIngestSnapshot(catalog);
  const masked = snapshot.variants.filter((variant) => variant.quantity === null).length;
  if (masked > 0) {
    logger.error('task masked', {
      taskId: task.taskId,
      providerId: task.providerId,
      masked,
    });
  }
  const sent = await sendSnapshot(snapshot, ingestConfig, logger);
  if (!sent) {
    throw new Error('ingest rejected');
  }
  const done = await client.complete(task.taskId, masked);
  if (!done) {
    throw new Error('queue complete rejected');
  }
  return {
    taskId: task.taskId,
    providerId: task.providerId,
    variants: snapshot.variants.length,
    masked,
    window: task.window,
  };
}

export async function runExecutorPass(logger: Logger, options: ExecutorPassOptions = {}): Promise<ExecutorPassResult> {
  const config = readIngestConfig();
  if (config === null) {
    logger.warn('executor disabled: BACKEND_URL or INGEST_SECRET not set');
    return { processed: 0, failed: 0 };
  }
  const client = options.queueClient ?? createQueueClient(config.backendUrl, config.secret, logger);
  const workerId = options.workerId ?? process.env['WORKER_ID'] ?? 'vps-executor';
  const maxTasks = options.maxTasks ?? MAX_TASKS;
  const taskTimeoutMs = options.taskTimeoutMs ?? TASK_TIMEOUT_MS;
  const checkMemoryFn =
    options.checkMemoryFn === undefined ? () => checkMemory(logger, MIN_AVAILABLE_MB) : options.checkMemoryFn;
  const checkRssFn =
    options.checkRssFn === undefined
      ? () => readProcessRss(logger) < MAX_PROCESS_RSS_MB * 1024 * 1024
      : options.checkRssFn;
  const registry = createRegistry(options.modules ?? ALL_MODULES);
  const directFetch = createDirectFetch();
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxTasks; i += 1) {
    if (!checkMemoryFn()) {
      logger.warn('memory low, stop executor');
      break;
    }
    if (!checkRssFn()) {
      logger.error('process rss too high, stop executor');
      break;
    }
    const task = await client.claim(['vps-get', 'vps-mutation'], workerId);
    if (task === null) {
      break;
    }
    processed += 1;
    const tracking = createUsageTracking();
    const taskLogger = tracking.wrapLogger(logger);
    const startedAt = Date.now();
    try {
      const executed = await withTaskTimeout(
        executeTask(taskLogger, client, config, registry, directFetch, task),
        taskTimeoutMs,
        task.taskId
      );
      const elapsedMs = Date.now() - startedAt;
      const webshareBytes = tracking.stats.requestBytes + tracking.stats.responseBytes;
      const proxyBytes = tracking.stats.proxyRequestBytes + tracking.stats.proxyResponseBytes;
      logger.info('task usage', {
        taskId: executed.taskId,
        providerId: executed.providerId,
        elapsedMs,
        requests: tracking.stats.requests,
        requestBytes: tracking.stats.requestBytes,
        responseBytes: tracking.stats.responseBytes,
        proxyBytes,
      });
      logger.info('task done', {
        taskId: executed.taskId,
        providerId: executed.providerId,
        variants: executed.variants,
      });
      const status: SnitchStatus = executed.masked > 0 ? 'failed' : 'ok';
      await sendReport(
        taskReport(executed.providerId, status, {
          elapsedMs,
          webshareBytes,
          requests: tracking.stats.requests,
          variants: executed.variants,
          masked: executed.masked,
        }),
        logger
      );
      await storeTaskUsage(
        {
          taskId: executed.taskId,
          providerId: executed.providerId,
          window: executed.window,
          day: new Date().toISOString().slice(0, 10),
          elapsedMs,
          webshareBytes,
          proxyBytes,
          status,
          masked: executed.masked,
          variants: executed.variants,
        },
        logger
      );
    } catch (error: unknown) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      const webshareBytes = tracking.stats.requestBytes + tracking.stats.responseBytes;
      const proxyBytes = tracking.stats.proxyRequestBytes + tracking.stats.proxyResponseBytes;
      logger.error('task usage', {
        taskId: task.taskId,
        providerId: task.providerId,
        elapsedMs,
        requests: tracking.stats.requests,
        requestBytes: tracking.stats.requestBytes,
        responseBytes: tracking.stats.responseBytes,
        proxyBytes,
      });
      logger.error('task failed', {
        taskId: task.taskId,
        providerId: task.providerId,
        error: message,
      });
      await sendReport(
        taskReport(
          task.providerId,
          'failed',
          {
            elapsedMs,
            webshareBytes,
            requests: tracking.stats.requests,
          },
          message
        ),
        logger
      );
      await storeTaskUsage(
        {
          taskId: task.taskId,
          providerId: task.providerId,
          window: task.window,
          day: new Date().toISOString().slice(0, 10),
          elapsedMs,
          webshareBytes,
          proxyBytes,
          status: 'failed',
          masked: 0,
          variants: 0,
        },
        logger
      );
      await client.fail(task.taskId, message);
      failed += 1;
      if (message.includes('task timeout after')) {
        logger.error('task timeout, stop executor pass', { taskId: task.taskId });
        break;
      }
    }
  }

  return { processed, failed };
}
