import {
  ALL_MODULES,
  createRegistry,
} from "@ecommerce-sniffle/providers";
import type { Logger, Provider, ProviderModule, StockRevealer } from "@ecommerce-sniffle/providers";
import { checkMemory, MIN_AVAILABLE_MB } from "./guard.ts";
import { catalogToIngestSnapshot, readIngestConfig, sendSnapshot } from "./ingest.ts";

export interface VpsPassResult {
  readonly processed: number;
  readonly failed: readonly string[];
  readonly ingested: number;
}

export interface VpsPassOptions {
  readonly checkMemoryFn?: () => boolean;
  readonly modules?: readonly ProviderModule[];
}

export function isStockRevealer(provider: Provider): provider is StockRevealer {
  return "revealStock" in provider;
}

export function readMutationShops(): Set<string> | null {
  const value = process.env["MUTATION_SHOPS"];
  if (value === undefined || value.length === 0) {
    return null;
  }
  const ids = new Set<string>();
  for (const part of value.split(",")) {
    const id = part.trim();
    if (id.length > 0) {
      ids.add(id);
    }
  }
  return ids;
}

export async function runVpsPass(
  logger: Logger,
  options: VpsPassOptions = {},
): Promise<VpsPassResult> {
  const checkMemoryFn =
    options.checkMemoryFn === undefined ? () => checkMemory(logger, MIN_AVAILABLE_MB) : options.checkMemoryFn;
  const allModules =
    options.modules === undefined
      ? createRegistry(ALL_MODULES).modules
      : options.modules;
  const shopFilter = readMutationShops();
  const modules = allModules.filter((module) => {
    if (module.config.mode !== "vps-mutation" || !module.config.enabled) {
      return false;
    }
    if (shopFilter !== null && !shopFilter.has(module.config.id)) {
      return false;
    }
    return true;
  });
  const ingestConfig = readIngestConfig();
  const failed: string[] = [];
  let processed = 0;
  let ingested = 0;

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
      const catalog = await provider.revealStock({ productIds: [] });
      if (ingestConfig === null) {
        logger.warn("ingest disabled: BACKEND_URL or INGEST_SECRET not set", {
          providerId: provider.config.id,
        });
        continue;
      }
      const snapshot = catalogToIngestSnapshot(catalog);
      const sent = await sendSnapshot(snapshot, ingestConfig, logger);
      if (sent) {
        ingested += 1;
      }
    } catch (error: unknown) {
      failed.push(provider.config.id);
      logger.error("reveal provider failed", {
        providerId: provider.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, failed, ingested };
}
