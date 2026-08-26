import { Hono } from 'hono';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';

function utcDay(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export function createReadsRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/daily/:shop', async (c) => {
    const shop = c.req.param('shop');
    const dayParam = c.req.query('day');
    const day = dayParam === undefined ? utcDay(0) : dayParam;
    const storage = c.get('storage');

    const stats = await storage.readDailyStats(shop, day);
    const previous = await storage.readDailyStats(shop, utcDay(1));

    return c.json({
      shop,
      day,
      stats,
      previous,
    });
  });

  api.get('/changes/:shop/:day', async (c) => {
    const shop = c.req.param('shop');
    const day = c.req.param('day');
    const events = await c.get('storage').readEvents(shop, day);
    return c.json({ shop, day, events });
  });

  api.get('/series/:productId', async (c) => {
    const shop = c.req.query('shop');
    if (shop === undefined) {
      return c.json({ error: 'Missing shop query parameter' }, 400);
    }
    const productId = c.req.param('productId');
    const series = await c.get('storage').readSeries(shop, productId);
    return c.json({ shop, productId, series });
  });

  api.get('/latest/:shop', async (c) => {
    const shop = c.req.param('shop');
    const latest = await c.get('storage').readLatestSnapshot(shop);
    if (latest === null) {
      return c.json({ shop, latest: null });
    }
    return c.json({ shop, latest });
  });

  api.get('/coverage', async (c) => {
    const modules = c.get('modules');
    const storage = c.get('storage');
    const rows: unknown[] = [];
    for (const module of modules) {
      if (!module.config.enabled) {
        continue;
      }
      const latest = await storage.readLatestSnapshot(module.config.domain);
      if (latest === null) {
        rows.push({
          id: module.config.id,
          domain: module.config.domain,
          mode: module.config.mode,
          status: 'no-snapshot',
        });
        continue;
      }
      const variants = latest.variants.length;
      const exact = latest.variants.filter((variant) => variant.quantity !== null).length;
      rows.push({
        id: module.config.id,
        domain: module.config.domain,
        mode: module.config.mode,
        snapshotAt: latest.snapshotAt,
        variants,
        exact,
        masked: variants - exact,
      });
    }
    return c.json({ shops: rows });
  });

  return api;
}
