import { Hono } from 'hono';
import type { Env } from './env/types.ts';
import { ALL_MODULES, createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { createApi } from './routes/api.ts';
import type { AppVariables } from './routes/api.ts';
import { createStorage } from './services/storage.ts';
import { runGetPipeline } from './services/run.ts';
import { sendSnitchReport } from './services/snitch.ts';
import { createTaskStore, enqueueProviders } from './services/queue.ts';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
app.use('*', async (c, next) => {
  const logger = createLogger(consoleSink);
  c.set('logger', logger);
  c.set('storage', createStorage(c.env.DB, logger));
  c.set('db', c.env.DB);
  c.set('modules', ALL_MODULES);
  await next();
});
app.route('/', createApi());

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(consoleSink);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const window = new Date(now).getUTCHours() < 12 ? 'morning' : 'evening';
    if (controller.cron === '10 10 * * *' || controller.cron === '10 22 * * *') {
      logger.info('cf summary cron', { window, day, cron: controller.cron });
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
