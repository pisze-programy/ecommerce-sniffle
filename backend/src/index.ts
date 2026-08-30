import { Hono } from 'hono';
import type { Env } from './env/types.ts';
import { ALL_MODULES, createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { createApi } from './routes/api.ts';
import type { AppVariables } from './routes/api.ts';
import { createStorage } from './services/storage.ts';
import { runGetPipeline } from './services/run.ts';
import { sendSnitchReport } from './services/snitch.ts';
import { createTaskStore, enqueueProviders } from './services/queue.ts';
import { runMetaAdsFetch } from './services/metaads/run.ts';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
app.use('*', async (c, next) => {
  const logger = createLogger(consoleSink);
  c.set('logger', logger);
  c.set('storage', createStorage(c.env.DB, logger));
  c.set('db', c.env.DB);
  c.set('modules', ALL_MODULES);
  await next();
});
// The UCP agent profile. Shopify fetches this URL for every UCP tool
// call. It declares the cart capability only. A smaller profile keeps
// the negotiated payload small. See docs/UCP-MIGRATION.md.
const UCP_AGENT_PROFILE: Readonly<Record<string, unknown>> = {
  ucp: {
    version: '2026-04-08',
    services: {
      'dev.ucp.shopping': [
        {
          version: '2026-04-08',
          spec: 'https://ucp.dev/2026-04-08/specification/overview',
          transport: 'mcp',
          schema: 'https://ucp.dev/2026-04-08/services/shopping/mcp.openrpc.json',
        },
      ],
    },
    capabilities: {
      'dev.ucp.shopping.cart': [{ version: '2026-04-08' }],
    },
    payment_handlers: {},
  },
};
app.get('/ucp/agent-profile.json', (c) => c.json(UCP_AGENT_PROFILE, 200, { 'Cache-Control': 'public, max-age=3600' }));
app.route('/', createApi());

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(consoleSink);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const window = new Date(now).getUTCHours() < 12 ? 'morning' : 'evening';
    if (controller.cron === '0 18 * * *' || controller.cron === '0 19 * * *') {
      const offset = warsawUtcOffsetHours(new Date(now));
      // The collection runs at 20:00 Warsaw time. Warsaw uses UTC+2 in
      // summer and UTC+1 in winter. Only the matching cron runs the job.
      const isEod =
        (controller.cron === '0 18 * * *' && offset === 2) || (controller.cron === '0 19 * * *' && offset === 1);
      if (!isEod) {
        logger.info('meta ads cron skipped for dst', { cron: controller.cron, offset });
        ctx.waitUntil(Promise.resolve());
        return;
      }
      logger.info('meta ads cron', { day, cron: controller.cron, offset });
      const token = env.META_AD_TOKEN;
      if (token === undefined || token.length === 0) {
        logger.warn('meta ads skipped: no token');
        await sendMetaAdsReport(env, day, 'failed', 'META_AD_TOKEN not set', {
          day,
          shops: 0,
          ads: 0,
          daysWritten: 0,
          ended: 0,
          failedPages: [],
        });
        ctx.waitUntil(Promise.resolve());
        return;
      }
      if (await metaTokenExpired(token)) {
        logger.warn('meta ads skipped: token expired');
        await sendMetaAdsReport(env, day, 'failed', 'META_AD_TOKEN expired - renew it to a 60 day token', {
          day,
          shops: 0,
          ads: 0,
          daysWritten: 0,
          ended: 0,
          failedPages: ['token'],
        });
        ctx.waitUntil(Promise.resolve());
        return;
      }
      const storage = createStorage(env.DB, logger);
      try {
        const result = await runMetaAdsFetch(storage, logger, token);
        logger.info('meta ads done', {
          shops: result.shops,
          ads: result.ads,
          daysWritten: result.daysWritten,
          ended: result.ended,
          errors: result.failures.length,
        });
        const messages: string[] = [`shops ${result.shops}`, `ads ${result.ads}`, `days ${result.daysWritten}`];
        if (result.ended > 0) {
          messages.push(`ended ${result.ended}`);
        }
        for (const failure of result.failures) {
          messages.push(`FAILED ${failure.pageId}: ${failure.reason}`);
        }
        if (messages.length === 0) {
          messages.push('no pages configured');
        }
        await sendMetaAdsReport(env, day, result.failures.length > 0 ? 'failed' : 'ok', messages.join(' | '), {
          day,
          shops: result.shops,
          ads: result.ads,
          daysWritten: result.daysWritten,
          ended: result.ended,
          failedPages: result.failures.map((failure) => failure.pageId),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('meta ads cron failed', { error: message });
        await sendMetaAdsReport(env, day, 'failed', `cron error: ${message}`, {
          day,
          shops: 0,
          ads: 0,
          daysWritten: 0,
          ended: 0,
          failedPages: [],
        });
      }
      ctx.waitUntil(Promise.resolve());
      return;
    }
    if (controller.cron === '10 10 * * *' || controller.cron === '10 22 * * *') {
      logger.info('cf summary cron', { window, day, cron: controller.cron });
      const store = createTaskStore(env.DB, logger);
      await store.reapExpired(now, 3);
      const sent = await sendCfSummary(env, window, day);
      logger.info('cf summary sent', { window, day, ok: sent });
      ctx.waitUntil(Promise.resolve());
      return;
    }
    const store = createTaskStore(env.DB, logger);
    await store.reapExpired(now, 3);
    const queueModules = ALL_MODULES.filter((module) => module.config.mode !== 'cf-get');
    const enqueued = await enqueueProviders(env.DB, logger, queueModules, window, day, now);
    logger.info('queue enqueued', { window, day, enqueued, cron: controller.cron });
    const results = await runGetPipeline(env.DB, env, logger);
    for (const result of results) {
      logger.info('scheduled provider result', {
        shop: result.shop,
        ok: result.ok,
        seeded: result.result === null ? null : result.result.seeded,
        events: result.result === null ? null : result.result.events,
      });
    }
    // The summary sends only from the dedicated summary crons (10:10/22:10).
    // Sending it here, right after the enqueue, flags the fresh tasks as
    // pending and sends a red mail.
    ctx.waitUntil(Promise.resolve());
  },
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

async function sendCfSummary(env: Env, window: string, day: string): Promise<boolean> {
  const dayStart = new Date(`${day}T00:00:00Z`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const db = env.DB;
  const doneRows = await db
    .prepare(
      "SELECT provider_id FROM tasks WHERE window = ? AND status = 'done' AND created_at >= ? AND created_at < ?"
    )
    .bind(window, dayStart, dayEnd)
    .all();
  const failedRows = await db
    .prepare(
      "SELECT provider_id FROM tasks WHERE window = ? AND status IN ('failed','dlq') AND created_at >= ? AND created_at < ?"
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
    .prepare('SELECT webshare_bytes, proxy_bytes FROM task_usage WHERE window = ? AND day = ?')
    .bind(window, day)
    .all();
  let transferBytes = 0;
  for (const row of usageRows.results as ReadonlyArray<Record<string, unknown>>) {
    // The proxy_bytes holds only the traffic that went through the
    // webshare proxy. The webshare_bytes also counts direct catalogs.
    const proxy = row['proxy_bytes'];
    const bytes = typeof proxy === 'number' ? proxy : row['webshare_bytes'];
    if (typeof bytes === 'number') {
      transferBytes += bytes;
    }
  }
  const done = (doneRows.results as ReadonlyArray<Record<string, unknown>>)
    .map((row) => row['provider_id'])
    .filter((value): value is string => typeof value === 'string');
  const failed = (failedRows.results as ReadonlyArray<Record<string, unknown>>)
    .map((row) => row['provider_id'])
    .filter((value): value is string => typeof value === 'string');
  const pending = (pendingRows.results as ReadonlyArray<Record<string, unknown>>)
    .map((row) => row['provider_id'])
    .filter((value): value is string => typeof value === 'string');
  const messages: string[] = [];
  for (const entry of failed) {
    messages.push(`FAILED ${entry}`);
  }
  if (pending.length > 0) {
    messages.push(`PENDING: ${pending.join(', ')}`);
  }
  if (messages.length === 0) {
    messages.push('all providers done, no errors, no pending');
  }
  const status = failed.length > 0 || pending.length > 0 ? 'failed' : 'ok';
  await sendSnitchReport(env, {
    source: 'ecommerce-pulse/cf',
    status,
    notify: 'always',
    data: {
      window,
      day,
      providers: done.length + failed.length,
      done: done.length,
      failed: failed.length,
      pending: pending.length,
      transferMb: Number((transferBytes / 1000000).toFixed(1)),
    },
    message: messages.join(' | '),
  });
  return true;
}

async function metaTokenExpired(token: string): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v26.0/me?fields=id&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as { error?: { code?: number } };
    return body.error?.code === 190;
  } catch {
    return false;
  }
}

function warsawUtcOffsetHours(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const warsawMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((warsawMs - now.getTime()) / 3600000);
}

async function sendMetaAdsReport(
  env: Env,
  day: string,
  status: 'ok' | 'failed',
  message: string,
  data: Readonly<Record<string, unknown>>
): Promise<void> {
  try {
    await sendSnitchReport(env, {
      source: 'ecommerce-pulse/meta-ads',
      status,
      notify: 'always',
      data,
      message,
    });
  } catch (error: unknown) {
    const reportError = error instanceof Error ? error.message : String(error);
    // The logger is the only reporter. A snitch failure must not crash the cron.
    consoleSink({
      level: 'error',
      message: 'meta ads snitch failed',
      context: { error: reportError, day },
      timestamp: new Date().toISOString(),
    });
  }
}
