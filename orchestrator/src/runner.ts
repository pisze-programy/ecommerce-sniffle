import { ALL_MODULES, createRegistry, measureFetch } from '@ecommerce-sniffle/providers';
import type { Logger, Provider, ProviderModule, StockRevealer, DirectFetch } from '@ecommerce-sniffle/providers';
import { checkMemory, MIN_AVAILABLE_MB } from './guard.ts';
import { catalogToIngestSnapshot, readIngestConfig, sendSnapshot } from './ingest.ts';
import { createDirectFetch } from './direct-fetch.ts';

export interface VpsPassResult {
  readonly processed: number;
  readonly failed: readonly string[];
  readonly ingested: number;
}

export interface VpsPassOptions {
  readonly checkMemoryFn?: () => boolean;
  readonly modules?: readonly ProviderModule[];
  readonly directFetch?: DirectFetch;
}

export function isStockRevealer(provider: Provider): provider is StockRevealer {
  return 'revealStock' in provider;
}

function readShopIds(envName: string): Set<string> | null {
  const value = process.env[envName];
  if (value === undefined || value.length === 0) {
    return null;
  }
  const ids = new Set<string>();
  for (const part of value.split(',')) {
    const id = part.trim();
    if (id.length > 0) {
      ids.add(id);
    }
  }
  return ids;
}

export function readMutationShops(): Set<string> | null {
  return readShopIds('MUTATION_SHOPS');
}

export function readGetShops(): Set<string> | null {
  return readShopIds('VPS_GET_SHOPS');
}

function selectModules(
  modules: readonly ProviderModule[],
  mutationFilter: Set<string> | null,
  getFilter: Set<string> | null
): ProviderModule[] {
  const explicit = mutationFilter !== null || getFilter !== null;
  const selected: ProviderModule[] = [];
  for (const module of modules) {
    if (!module.config.enabled) {
      continue;
    }
    if (module.config.mode === 'vps-mutation') {
      const allowed = mutationFilter === null ? !explicit : mutationFilter.has(module.config.id);
      if (allowed) {
        selected.push(module);
      }
      continue;
    }
    if (module.config.mode === 'vps-get') {
      const allowed = getFilter === null ? !explicit : getFilter.has(module.config.id);
      if (allowed) {
        selected.push(module);
      }
    }
  }
  return selected;
}

export async function runVpsPass(logger: Logger, options: VpsPassOptions = {}): Promise<VpsPassResult> {
  const checkMemoryFn =
    options.checkMemoryFn === undefined ? () => checkMemory(logger, MIN_AVAILABLE_MB) : options.checkMemoryFn;
  const allModules = options.modules === undefined ? createRegistry(ALL_MODULES).modules : options.modules;
  const modules = selectModules(allModules, readMutationShops(), readGetShops());
  const ingestConfig = readIngestConfig();
  const directFetch = options.directFetch === undefined ? createDirectFetch() : options.directFetch;
  const failed: string[] = [];
  let processed = 0;
  let ingested = 0;

  for (const module of modules) {
    if (!checkMemoryFn()) {
      logger.warn('memory low, stop pass');
      break;
    }
    processed += 1;
    const isGet = module.config.mode === 'vps-get';
    const directFetchNeeded = module.config.mode === 'vps-mutation' || (isGet && !module.config.requiresProxy);
    const measuredDirectFetch = measureFetch(directFetch, logger, module.config.id, 'direct');
    const provider = directFetchNeeded
      ? module.build({ logger, directFetch: measuredDirectFetch })
      : module.build({ logger });
    if (!isGet && !isStockRevealer(provider)) {
      logger.warn('provider has no stock reveal', { providerId: module.config.id });
      continue;
    }
    try {
      logger.info('run provider', {
        providerId: provider.config.id,
        domain: provider.config.domain,
        mode: provider.config.mode,
      });
      const catalog = isGet
        ? await provider.fetchCatalog()
        : await (provider as StockRevealer).revealStock({ productIds: [] });
      if (ingestConfig === null) {
        logger.warn('ingest disabled: BACKEND_URL or INGEST_SECRET not set', {
          providerId: module.config.id,
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
      logger.error('run provider failed', {
        providerId: provider.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, failed, ingested };
}
