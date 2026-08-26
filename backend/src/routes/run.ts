import { Hono } from 'hono';
import { runGetPipeline } from '../services/run.ts';
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
    const results = await runGetPipeline(c.get('db'), c.env, c.get('logger'), modules);
    return c.json({ results });
  });

  api.get('/health', (c) => {
    const logger = c.get('logger');
    logger.info('health check requested');
    return c.json({ status: 'ok' });
  });

  return api;
}
