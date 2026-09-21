import { Hono } from 'hono';
import { runGetPipeline } from '../services/run.ts';
import { createTaskStore } from '../services/queue.ts';
import { SEED_WINDOWS } from '../services/schedule.ts';
import type { ProviderModule } from '@ecommerce-sniffle/providers';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';

// A manual run uses the first seed window. The window name must match a
// SEED_WINDOWS entry. Any other value hides the events from the shop
// page, because the report groups the changes by seed window.
function manualWindow(): string {
  const first = SEED_WINDOWS[0];
  return first === undefined ? 'manual' : first.id;
}

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
      await seedCfTask(store, module, `manual-${now}-${module.config.id}`, now, manualWindow());
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
  now: number,
  window: string
): Promise<void> {
  await store.createTask({
    taskId,
    providerId: module.config.id,
    domain: module.config.domain,
    mode: 'cf-get',
    window,
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
