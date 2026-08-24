import { Hono } from "hono";
import { parseSnapshotBody, ingestSnapshot } from "../services/ingest.ts";
import type { Env } from "../env/types.ts";
import type { AppVariables } from "./types.ts";
import { isAuthorized } from "./auth.ts";

export function createIngestRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post("/ingest", async (c) => {
    if (!isAuthorized(c)) {
      c.get("logger").warn("ingest unauthorized");
      return c.json({ error: "unauthorized" }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      c.get("logger").warn("ingest body parse failed", { error: message });
      return c.json({ error: "invalid json body" }, 400);
    }
    const snapshot = parseSnapshotBody(body);
    if (snapshot === null) {
      c.get("logger").warn("ingest invalid snapshot");
      return c.json({ error: "invalid snapshot body" }, 400);
    }
    const result = await ingestSnapshot(c.get("storage"), snapshot, c.get("logger"));
    return c.json({ ok: true, result });
  });

  return api;
}
