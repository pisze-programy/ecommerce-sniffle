import { ALL_MODULES, createRegistry } from "@ecommerce-sniffle/providers";
import type { Logger, ProviderModule } from "@ecommerce-sniffle/providers";
import { checkMemory, MIN_AVAILABLE_MB } from "./guard.ts";
import { catalogToIngestSnapshot, readIngestConfig, sendSnapshot } from "./ingest.ts";
import { createDirectFetch } from "./direct-fetch.ts";
import { createQueueClient } from "./queue-client.ts";
import type { QueueClient } from "./queue-client.ts";
import { isStockRevealer } from "./runner.ts";

const MAX_TASKS = 20;

export interface ExecutorPassResult {
  readonly processed: number;
  readonly failed: number;
}

export interface ExecutorPassOptions {
  readonly queueClient?: QueueClient;
  readonly workerId?: string;
  readonly maxTasks?: number;
  readonly checkMemoryFn?: () => boolean;
  readonly modules?: readonly ProviderModule[];
}

export async function runExecutorPass(
  logger: Logger,
  options: ExecutorPassOptions = {},
): Promise<ExecutorPassResult> {
  const config = readIngestConfig();
  if (config === null) {
    logger.warn("executor disabled: BACKEND_URL or INGEST_SECRET not set");
    return { processed: 0, failed: 0 };
  }
  const client = options.queueClient ?? createQueueClient(config.backendUrl, config.secret, logger);
  const workerId = options.workerId ?? process.env["WORKER_ID"] ?? "vps-executor";
  const maxTasks = options.maxTasks ?? MAX_TASKS;
  const checkMemoryFn =
    options.checkMemoryFn === undefined ? () => checkMemory(logger, MIN_AVAILABLE_MB) : options.checkMemoryFn;
  const registry = createRegistry(options.modules ?? ALL_MODULES);
  const directFetch = createDirectFetch();
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxTasks; i += 1) {
    if (!checkMemoryFn()) {
      logger.warn("memory low, stop executor");
      break;
    }
    const task = await client.claim(["vps-get", "vps-mutation"], workerId);
    if (task === null) {
      break;
    }
    processed += 1;
    try {
      const module = registry.findModule(task.providerId);
      if (module === null) {
        throw new Error(`unknown provider ${task.providerId}`);
      }
      const needsDirect =
        task.mode === "vps-mutation" || (task.mode === "vps-get" && !module.config.requiresProxy);
      const provider = needsDirect
        ? module.build({ logger, directFetch })
        : module.build({ logger });
      const catalog =
        task.mode === "vps-mutation" && isStockRevealer(provider)
          ? await provider.revealStock({ productIds: [] })
          : await provider.fetchCatalog();
      const snapshot = catalogToIngestSnapshot(catalog);
      const masked = snapshot.variants.filter((variant) => variant.quantity === null).length;
      if (masked > 0) {
        logger.error("task masked", {
          taskId: task.taskId,
          providerId: task.providerId,
          masked,
        });
        await client.fail(task.taskId, `masked ${masked}`);
        failed += 1;
        continue;
      }
      const sent = await sendSnapshot(snapshot, config, logger);
      if (!sent) {
        throw new Error("ingest rejected");
      }
      const done = await client.complete(task.taskId, 0);
      if (!done) {
        throw new Error("queue complete rejected");
      }
      logger.info("task done", {
        taskId: task.taskId,
        providerId: task.providerId,
        variants: snapshot.variants.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("task failed", {
        taskId: task.taskId,
        providerId: task.providerId,
        error: message,
      });
      await client.fail(task.taskId, message);
      failed += 1;
    }
  }

  return { processed, failed };
}
