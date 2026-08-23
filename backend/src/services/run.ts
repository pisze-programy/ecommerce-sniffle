import { ALL_MODULES, createRegistry } from "@ecommerce-sniffle/providers";
import type { Logger, ProviderModule } from "@ecommerce-sniffle/providers";
import { runShopPipeline } from "./pipeline.ts";
import type { PipelineResult } from "./pipeline.ts";
import type { D1Like } from "./storage.ts";
import { createStorage } from "./storage.ts";

export interface RunGetPipelineResult {
  readonly shop: string;
  readonly providerId: string;
  readonly ok: boolean;
  readonly error: string | null;
  readonly result: PipelineResult | null;
}

export async function runGetPipeline(
  db: D1Like,
  logger: Logger,
  modules: readonly ProviderModule[] = ALL_MODULES,
): Promise<readonly RunGetPipelineResult[]> {
  const storage = createStorage(db, logger);
  const registry = createRegistry(modules);
  const results: RunGetPipelineResult[] = [];

  for (const module of registry.modules) {
    if (module.config.mode !== "cf-get" || !module.config.enabled) {
      continue;
    }
    const provider = module.build({ logger });
    try {
      const result = await runShopPipeline(provider, storage, logger);
      results.push({
        shop: module.config.domain,
        providerId: module.config.id,
        ok: true,
        error: null,
        result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("runGetPipeline provider failed", {
        providerId: module.config.id,
        shop: module.config.domain,
        error: message,
      });
      results.push({
        shop: module.config.domain,
        providerId: module.config.id,
        ok: false,
        error: message,
        result: null,
      });
    }
  }

  return results;
}
