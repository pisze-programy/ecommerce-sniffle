import { Hono } from 'hono';
import { runGetPipeline } from '../services/run.ts';
import { createTaskStore } from '../services/queue.ts';
import type { ProviderModule } from '@ecommerce-sniffle/providers';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';

export function createRunRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/run', async (c) => {
    const shop = c.req.query('shop');
    const allModules = c.get('modules');
    let modules = allModules;
    if (shop !== undefined) {
      modules = allModules.filter((module) => module.config.domain === shop);
      if (modules.length === 0) {
        return c.json({ error: `Unknown shop ${shop}` }, 404);
      }
    }
    const logger = c.get('logger');
    const store = createTaskStore(c.get('db'), logger);
    const now = Date.now();
    let seeded = 0;
    for (const module of modules) {
      if (!module.config.enabled || module.config.mode !== 'cf-get') {
        continue;
      }
      await seedCfTask(store, module, `manual-${now}-${module.config.id}`, now);
      seeded += 1;
    }
    const results = await runGetPipeline(c.get('db'), c.env, logger, modules);
    return c.json({ results, seeded });
  });

  api.get('/health', (c) => {
    const logger = c.get('logger');
    logger.info('health check requested');
    return c.json({ status: 'ok' });
  });

  return api;
}

async function seedCfTask(
  store: ReturnType<typeof createTaskStore>,
  module: ProviderModule,
  taskId: string,
  now: number
): Promise<void> {
  await store.createTask({
    taskId,
    providerId: module.config.id,
    domain: module.config.domain,
    mode: 'cf-get',
    window: 'both',
    status: 'pending',
    attempts: 0,
    leaseUntil: null,
    workerId: null,
    maskedCount: null,
    error: null,
    createdAt: now,
    finishedAt: null,
    durationSeconds: module.config.durationSeconds,
  });
}
