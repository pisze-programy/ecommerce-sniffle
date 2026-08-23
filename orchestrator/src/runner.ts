import {
  ALL_MODULES,
  createRegistry,
} from "@ecommerce-sniffle/providers";
import type { Logger, Provider, StockRevealer } from "@ecommerce-sniffle/providers";
import { checkMemory, MIN_AVAILABLE_MB } from "./guard.ts";

export interface VpsPassResult {
  readonly processed: number;
  readonly failed: readonly string[];
}

export interface VpsPassOptions {
  readonly checkMemoryFn?: () => boolean;
}

export function isStockRevealer(provider: Provider): provider is StockRevealer {
  return "revealStock" in provider;
}

export async function runVpsPass(
  logger: Logger,
  options: VpsPassOptions = {},
): Promise<VpsPassResult> {
  const checkMemoryFn =
    options.checkMemoryFn === undefined ? () => checkMemory(logger, MIN_AVAILABLE_MB) : options.checkMemoryFn;
  const registry = createRegistry(ALL_MODULES);
  const modules = registry.modules.filter(
    (module) => module.config.mode === "vps-mutation" && module.config.enabled,
  );
  const failed: string[] = [];
  let processed = 0;

  for (const module of modules) {
    if (!checkMemoryFn()) {
      logger.warn("memory low, stop pass");
      break;
    }
    processed += 1;
    const provider = module.build({ logger });
    if (!isStockRevealer(provider)) {
      logger.warn("provider has no stock reveal", { providerId: module.config.id });
      continue;
    }
    try {
      logger.info("reveal provider", { providerId: provider.config.id, domain: provider.config.domain });
      await provider.revealStock({ productIds: [] });
    } catch (error: unknown) {
      failed.push(provider.config.id);
      logger.error("reveal provider failed", {
        providerId: provider.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, failed };
}
