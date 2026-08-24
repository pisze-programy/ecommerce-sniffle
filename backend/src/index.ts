import { Hono } from "hono";
import type { Env } from "./env/types.ts";
import { ALL_MODULES, createLogger, consoleSink } from "@ecommerce-sniffle/providers";
import { createApi } from "./routes/api.ts";
import type { AppVariables } from "./routes/api.ts";
import { createStorage } from "./services/storage.ts";
import { runGetPipeline } from "./services/run.ts";
import { createTaskStore, enqueueProviders } from "./services/queue.ts";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
app.use("*", async (c, next) => {
  const logger = createLogger(consoleSink);
  c.set("logger", logger);
  c.set("storage", createStorage(c.env.DB, logger));
  c.set("db", c.env.DB);
  c.set("modules", ALL_MODULES);
  await next();
});
app.route("/", createApi());

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(consoleSink);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const window = new Date(now).getUTCHours() < 12 ? "morning" : "evening";
    const store = createTaskStore(env.DB, logger);
    await store.reapExpired(now, 3);
    const queueModules = ALL_MODULES.filter((module) => module.config.mode !== "cf-get");
    const enqueued = await enqueueProviders(env.DB, logger, queueModules, window, day, now);
    logger.info("queue enqueued", { window, day, enqueued, cron: controller.cron });
    const results = await runGetPipeline(env.DB, logger);
    for (const result of results) {
      logger.info("scheduled provider result", {
        shop: result.shop,
        ok: result.ok,
        seeded: result.result === null ? null : result.result.seeded,
        events: result.result === null ? null : result.result.events,
      });
    }
    ctx.waitUntil(Promise.resolve());
  },
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
