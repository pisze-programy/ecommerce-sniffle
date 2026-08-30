import { Hono } from 'hono';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { isAuthorized } from './auth.ts';
import { aggregateDaily } from '@ecommerce-sniffle/analysis';
import { runSocialFetch } from '../services/social/run.ts';

interface UsageBody {
  readonly taskId: string;
  readonly providerId: string;
  readonly window: string;
  readonly day: string;
  readonly elapsedMs: number;
  readonly webshareBytes: number;
  readonly proxyBytes: number | null;
  readonly status: string;
  readonly masked: number;
  readonly variants: number;
}

function parseUsageBody(body: unknown): UsageBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const obj = body as Readonly<Record<string, unknown>>;
  if (
    typeof obj['taskId'] !== 'string' ||
    typeof obj['providerId'] !== 'string' ||
    typeof obj['window'] !== 'string' ||
    typeof obj['day'] !== 'string' ||
    typeof obj['elapsedMs'] !== 'number' ||
    typeof obj['webshareBytes'] !== 'number' ||
    typeof obj['status'] !== 'string' ||
    typeof obj['masked'] !== 'number' ||
    typeof obj['variants'] !== 'number'
  ) {
    return null;
  }
  const proxyBytes = obj['proxyBytes'];
  return {
    taskId: obj['taskId'],
    providerId: obj['providerId'],
    window: obj['window'],
    day: obj['day'],
    elapsedMs: obj['elapsedMs'],
    webshareBytes: obj['webshareBytes'],
    proxyBytes: typeof proxyBytes === 'number' ? proxyBytes : null,
    status: obj['status'],
    masked: obj['masked'],
    variants: obj['variants'],
  };
}

export function createUsageRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post('/task/usage', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('usage.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = parseUsageBody(await c.req.json().catch(() => null));
    if (body === null) {
      return c.json({ error: 'invalid body' }, 400);
    }
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO task_usage (task_id, provider_id, window, day, elapsed_ms, webshare_bytes, proxy_bytes, status, masked, variants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        body.taskId,
        body.providerId,
        body.window,
        body.day,
        body.elapsedMs,
        body.webshareBytes,
        body.proxyBytes,
        body.status,
        body.masked,
        body.variants,
        Date.now()
      )
      .run();
    return c.json({ ok: true });
  });

  api.get('/summary/:window/:day', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('summary.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const window = c.req.param('window');
    const day = c.req.param('day');
    const dayStart = new Date(`${day}T00:00:00Z`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const db = c.env.DB;
    const doneRows = await db
      .prepare(
        "SELECT provider_id FROM tasks WHERE window = ? AND status = 'done' AND created_at >= ? AND created_at < ?"
      )
      .bind(window, dayStart, dayEnd)
      .all();
    const failedRows = await db
      .prepare(
        "SELECT provider_id, error FROM tasks WHERE window = ? AND status IN ('failed','dlq') AND created_at >= ? AND created_at < ?"
      )
      .bind(window, dayStart, dayEnd)
      .all();
    const pendingRows = await db
      .prepare(
        "SELECT provider_id FROM tasks WHERE window = ? AND status = 'pending' AND created_at >= ? AND created_at < ?"
      )
      .bind(window, dayStart, dayEnd)
      .all();
    const usageRows = await db
      .prepare('SELECT provider_id, webshare_bytes, proxy_bytes FROM task_usage WHERE window = ? AND day = ?')
      .bind(window, day)
      .all();
    const perProvider = new Map<string, number>();
    let transferBytes = 0;
    let proxyBytes = 0;
    for (const row of usageRows.results as ReadonlyArray<Record<string, unknown>>) {
      const provider = row['provider_id'];
      const bytes = row['webshare_bytes'];
      if (typeof provider === 'string' && typeof bytes === 'number') {
        perProvider.set(provider, (perProvider.get(provider) ?? 0) + bytes);
        transferBytes += bytes;
      }
      const pBytes = row['proxy_bytes'];
      if (typeof pBytes === 'number') {
        proxyBytes += pBytes;
      }
    }
    const done = (doneRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => row['provider_id'])
      .filter((value): value is string => typeof value === 'string');
    const failed = (failedRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => ({ providerId: row['provider_id'], error: row['error'] ?? null }))
      .filter((entry): entry is { providerId: string; error: string | null } => typeof entry.providerId === 'string');
    const pending = (pendingRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => row['provider_id'])
      .filter((value): value is string => typeof value === 'string');
    return c.json({
      window,
      day,
      done,
      failed,
      pending,
      transferBytes,
      proxyBytes,
      perProvider: [...perProvider.entries()].map(([providerId, bytes]) => ({ providerId, bytes })),
    });
  });

  api.post('/backfill/product-url', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('backfill.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    const entries =
      typeof body === 'object' && body !== null ? (body as Readonly<Record<string, unknown>>)['entries'] : null;
    if (!Array.isArray(entries)) {
      return c.json({ error: 'invalid body' }, 400);
    }
    const statements: Array<ReturnType<typeof c.env.DB.prepare>> = [];
    let updated = 0;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const obj = entry as Readonly<Record<string, unknown>>;
      const shop = obj['shop'];
      const productId = obj['productId'];
      const url = obj['url'];
      if (typeof shop !== 'string' || typeof productId !== 'string' || typeof url !== 'string') {
        continue;
      }
      statements.push(
        c.env.DB.prepare('INSERT OR REPLACE INTO products (shop, product_id, url) VALUES (?, ?, ?)').bind(
          shop,
          productId,
          url
        )
      );
      updated += 1;
    }
    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }
    return c.json({ ok: true, updated });
  });

  api.post('/admin/recompute-daily-stats', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('recompute.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const storage = c.get('storage');
    const logger = c.get('logger');
    let shops: string[];
    const body = await c.req.json().catch(() => null);
    const raw = typeof body === 'object' && body !== null ? (body as Readonly<Record<string, unknown>>)['shops'] : null;
    if (Array.isArray(raw) && raw.every((entry) => typeof entry === 'string')) {
      shops = raw as string[];
    } else {
      shops = await storage.readShops();
    }
    let days = 0;
    try {
      for (const shop of shops) {
        const maxQuantity = await storage.readMaxObservedQuantity(shop);
        const availableDays = await storage.readAvailableDays(shop);
        for (const day of availableDays) {
          const events = await storage.readEvents(shop, day);
          const stats = aggregateDaily({ shop, day, events }, { maxQuantity });
          await storage.writeDailyStats(stats);
          days += 1;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('recompute failed', { error: message });
      return c.json({ ok: false, error: message }, 500);
    }
    logger.info('recompute done', { shops: shops.length, days });
    return c.json({ ok: true, shops: shops.length, days });
  });

  api.post('/admin/upsert-names', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('upsert-names.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const storage = c.get('storage');
    const logger = c.get('logger');
    const body = await c.req.json().catch(() => null);
    const record = typeof body === 'object' && body !== null ? (body as Readonly<Record<string, unknown>>) : null;
    const shop = record === null ? null : record['shop'];
    const rawProducts = record === null ? null : record['products'];
    const rawVariants = record === null ? null : record['variants'];
    if (typeof shop !== 'string' || shop.length === 0 || !Array.isArray(rawProducts) || !Array.isArray(rawVariants)) {
      return c.json({ error: 'invalid body' }, 400);
    }
    const products: Array<{ productId: string; url: string; title: string }> = [];
    for (const raw of rawProducts) {
      if (typeof raw !== 'object' || raw === null) {
        continue;
      }
      const entry = raw as Readonly<Record<string, unknown>>;
      if (typeof entry['productId'] !== 'string' || typeof entry['url'] !== 'string') {
        continue;
      }
      const title = typeof entry['title'] === 'string' ? entry['title'] : '';
      if (title.length === 0) {
        continue;
      }
      products.push({ productId: entry['productId'], url: entry['url'], title });
    }
    const variants: Array<{ productId: string; variantId: string; title: string }> = [];
    for (const raw of rawVariants) {
      if (typeof raw !== 'object' || raw === null) {
        continue;
      }
      const entry = raw as Readonly<Record<string, unknown>>;
      if (
        typeof entry['productId'] !== 'string' ||
        typeof entry['variantId'] !== 'string' ||
        typeof entry['title'] !== 'string'
      ) {
        continue;
      }
      const title = entry['title'];
      if (title.length === 0 || title === 'default' || title === 'Default Title') {
        continue;
      }
      variants.push({ productId: entry['productId'], variantId: entry['variantId'], title });
    }
    try {
      await storage.upsertNames(shop, products, variants);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('upsert-names failed', { shop, error: message });
      return c.json({ ok: false, error: message }, 500);
    }
    logger.info('upsert-names done', { shop, products: products.length, variants: variants.length });
    return c.json({ ok: true, products: products.length, variants: variants.length });
  });

  api.post('/admin/fetch-social', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('fetch-social.unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const apiKey = c.env.RAPIDAPI_KEY;
    if (apiKey === undefined || apiKey.length === 0) {
      c.get('logger').error('fetch-social.noApiKey');
      return c.json({ ok: false, error: 'RAPIDAPI_KEY not set' }, 500);
    }
    const storage = c.get('storage');
    const logger = c.get('logger');
    try {
      const result = await runSocialFetch(storage, logger, apiKey, c.env.MEDIA === undefined ? null : c.env.MEDIA);
      logger.info('fetch-social done', {
        targets: result.targets,
        profilesResolved: result.profilesResolved,
        posts: result.posts,
        stories: result.stories,
        mediaStored: result.mediaStored,
      });
      return c.json({ ok: true, ...result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('fetch-social failed', { error: message });
      return c.json({ ok: false, error: message }, 500);
    }
  });

  return api;
}
