import { ALL_MODULES, createRegistry } from '@ecommerce-sniffle/providers';
import type { Logger, ProviderModule } from '@ecommerce-sniffle/providers';
import { runShopPipeline } from './pipeline.ts';
import type { PipelineResult } from './pipeline.ts';
import type { D1Like } from './storage.ts';
import { createStorage } from './storage.ts';
import { sendSnitchReport } from './snitch.ts';
import type { Env } from '../env/types.ts';

export interface RunGetPipelineResult {
  readonly shop: string;
  readonly providerId: string;
  readonly ok: boolean;
  readonly error: string | null;
  readonly result: PipelineResult | null;
}

export async function runGetPipeline(
  db: D1Like,
  env: Env,
  logger: Logger,
  modules: readonly ProviderModule[] = ALL_MODULES
): Promise<readonly RunGetPipelineResult[]> {
  const storage = createStorage(db, logger);
  const registry = createRegistry(modules);
  const results: RunGetPipelineResult[] = [];

  for (const module of registry.modules) {
    if (module.config.mode !== 'cf-get' || !module.config.enabled) {
      continue;
    }
    const provider = module.build({ logger });
    try {
      const result = await runShopPipeline(provider, storage, logger);
      const latest = await storage.readLatestSnapshot(module.config.domain);
      const masked = latest === null ? 0 : latest.variants.filter((variant) => variant.quantity === null).length;
      results.push({
        shop: module.config.domain,
        providerId: module.config.id,
        ok: true,
        error: null,
        result,
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('runGetPipeline provider failed', {
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
    }
  }

  return results;
}
