import { Hono } from "hono";
import type { ProviderModule } from "@ecommerce-sniffle/providers";
import type { Logger } from "@ecommerce-sniffle/providers";
import type { D1Like, Storage } from "../services/storage.ts";
import { runGetPipeline } from "../services/run.ts";

export interface AppVariables {
  readonly storage: Storage;
  readonly db: D1Like;
  readonly logger: Logger;
  readonly modules: readonly ProviderModule[];
}

function utcDay(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export function createApi(): Hono<{ Variables: AppVariables }> {
  const api = new Hono<{ Variables: AppVariables }>();

  api.get("/run", async (c) => {
    const shop = c.req.query("shop");
    const allModules = c.get("modules");
    let modules = allModules;
    if (shop !== undefined) {
      modules = allModules.filter((module) => module.config.domain === shop);
      if (modules.length === 0) {
        return c.json({ error: `Unknown shop ${shop}` }, 404);
      }
    }
    const results = await runGetPipeline(c.get("db"), c.get("logger"), modules);
    return c.json({ results });
  });

  api.get("/health", (c) => {
    const logger = c.get("logger");
    logger.info("health check requested");
    return c.json({ status: "ok" });
  });

  api.get("/daily/:shop", async (c) => {
    const shop = c.req.param("shop");
    const dayParam = c.req.query("day");
    const day = dayParam === undefined ? utcDay(0) : dayParam;
    const storage = c.get("storage");

    const stats = await storage.readDailyStats(shop, day);
    const previous = await storage.readDailyStats(shop, utcDay(1));

    return c.json({
      shop,
      day,
      stats,
      previous,
    });
  });

  api.get("/changes/:shop/:day", async (c) => {
    const shop = c.req.param("shop");
    const day = c.req.param("day");
    const events = await c.get("storage").readEvents(shop, day);
    return c.json({ shop, day, events });
  });

  api.get("/series/:productId", async (c) => {
    const shop = c.req.query("shop");
    if (shop === undefined) {
      return c.json({ error: "Missing shop query parameter" }, 400);
    }
    const productId = c.req.param("productId");
    const series = await c.get("storage").readSeries(shop, productId);
    return c.json({ shop, productId, series });
  });

  api.get("/latest/:shop", async (c) => {
    const shop = c.req.param("shop");
    const latest = await c.get("storage").readLatestSnapshot(shop);
    if (latest === null) {
      return c.json({ shop, latest: null });
    }
    return c.json({ shop, latest });
  });

  return api;
}
