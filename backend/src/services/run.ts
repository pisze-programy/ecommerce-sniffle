import { ALL_MODULES, createRegistry } from '@ecommerce-sniffle/providers';
import type { Logger, ProviderModule } from '@ecommerce-sniffle/providers';
import { runShopPipeline } from './pipeline.ts';
import type { PipelineResult } from './pipeline.ts';
import type { D1Like } from './storage.ts';
import { createStorage } from './storage.ts';
import { createTaskStore } from './queue.ts';
import { sendSnitchReport } from './snitch.ts';
import type { Env } from '../env/types.ts';

// A cf-get run is one worker invocation. It claims queued cf-get tasks
// one by one and stops at a wall-clock budget. The tasks that stay
// pending wait for the next cron. This keeps a single provider from
// eating the whole invocation budget.
const CF_MODE = 'cf-get';
const CF_BUDGET_MS = 8 * 60 * 1000;
const CF_MAX_TASKS = 50;
const CF_MAX_ATTEMPTS = 3;
const CF_LEASE_MS = CF_BUDGET_MS + 60 * 1000;
// The task timeout is three times the configured run duration. A hung
// shop must not block the invocation for its full budget.
const TIMEOUT_FACTOR = 3;

export interface RunGetPipelineResult {
  readonly shop: string;
  readonly providerId: string;
  readonly ok: boolean;
  readonly error: string | null;
  readonly result: PipelineResult | null;
}

export function cfTaskTimeoutMs(durationSeconds: number): number {
  return Math.max(30_000, durationSeconds * TIMEOUT_FACTOR * 1000);
}

export function withTaskTimeout<T>(promise: Promise<T>, timeoutMs: number, taskId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`cf task timeout after ${timeoutMs}ms for ${taskId}`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function runOneTask(
  env: Env,
  logger: Logger,
  registry: ReturnType<typeof createRegistry>,
  store: ReturnType<typeof createTaskStore>,
  storage: ReturnType<typeof createStorage>,
  task: { taskId: string; providerId: string; durationSeconds: number }
): Promise<RunGetPipelineResult> {
  const module = registry.findModule(task.providerId);
  const failed: RunGetPipelineResult = {
    shop: '',
    providerId: task.providerId,
    ok: false,
    error: 'unknown provider',
    result: null,
  };
  if (module === null) {
    return failed;
  }
  if (!module.config.enabled) {
    logger.warn('cf task skipped disabled provider', { providerId: task.providerId });
    await store.completeTask(task.taskId, 0, Date.now());
    return { shop: module.config.domain, providerId: task.providerId, ok: true, error: null, result: null };
  }
  try {
    const provider = module.build({ logger });
    const result = await withTaskTimeout(
      runShopPipeline(provider, storage, logger),
      cfTaskTimeoutMs(task.durationSeconds),
      task.taskId
    );
    const latest = await storage.readLatestSnapshot(module.config.domain);
    const masked = latest === null ? 0 : latest.variants.filter((variant) => variant.quantity === null).length;
    await store.completeTask(task.taskId, masked, Date.now());
    logger.info('cf task done', {
      providerId: task.providerId,
      variants: latest === null ? 0 : latest.variants.length,
    });
    if (masked > 0) {
      logger.warn('cf.get masked', { providerId: module.config.id, masked });
      await sendSnitchReport(env, {
        source: 'ecommerce-pulse/cf',
        status: 'failed',
        notify: 'on-error',
        data: {
          providerId: module.config.id,
          shop: module.config.domain,
          variants: latest === null ? 0 : latest.variants.length,
          masked,
        },
      });
    }
    return { shop: module.config.domain, providerId: module.config.id, ok: true, error: null, result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('runGetPipeline provider failed', {
      providerId: module.config.id,
      shop: module.config.domain,
      error: message,
    });
    await store.failTask(task.taskId, message, Date.now(), 60 * 1000, CF_MAX_ATTEMPTS);
    await sendSnitchReport(env, {
      source: 'ecommerce-pulse/cf',
      status: 'failed',
      notify: 'on-error',
      data: {
        providerId: module.config.id,
        shop: module.config.domain,
        error: message,
      },
    });
    return { shop: module.config.domain, providerId: module.config.id, ok: false, error: message, result: null };
  }
}

export async function runGetPipeline(
  db: D1Like,
  env: Env,
  logger: Logger,
  modules: readonly ProviderModule[] = ALL_MODULES
): Promise<readonly RunGetPipelineResult[]> {
  const registry = createRegistry(modules);
  const store = createTaskStore(db, logger);
  const storage = createStorage(db, logger);
  const results: RunGetPipelineResult[] = [];
  const workerId = `cf-${Date.now()}`;
  const startedAt = Date.now();

  for (let i = 0; i < CF_MAX_TASKS; i += 1) {
    if (Date.now() - startedAt >= CF_BUDGET_MS) {
      logger.warn('cf budget exhausted', { elapsedMs: Date.now() - startedAt });
      break;
    }
    const task = await store.claimTask(workerId, CF_LEASE_MS, Date.now(), CF_MAX_ATTEMPTS, [CF_MODE]);
    if (task === null) {
      break;
    }
    const result = await runOneTask(env, logger, registry, store, storage, {
      taskId: task.taskId,
      providerId: task.providerId,
      durationSeconds: task.durationSeconds,
    });
    results.push(result);
  }
  logger.info('cf pipeline finished', { processed: results.length });
  return results;
}
