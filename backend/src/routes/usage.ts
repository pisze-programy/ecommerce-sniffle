import { Hono } from "hono";
import type { Env } from "../env/types.ts";
import type { AppVariables } from "./types.ts";
import { isAuthorized } from "./auth.ts";

interface UsageBody {
  readonly taskId: string;
  readonly providerId: string;
  readonly window: string;
  readonly day: string;
  readonly elapsedMs: number;
  readonly webshareBytes: number;
  readonly status: string;
  readonly masked: number;
  readonly variants: number;
}

function parseUsageBody(body: unknown): UsageBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const obj = body as Readonly<Record<string, unknown>>;
  if (
    typeof obj["taskId"] !== "string" ||
    typeof obj["providerId"] !== "string" ||
    typeof obj["window"] !== "string" ||
    typeof obj["day"] !== "string" ||
    typeof obj["elapsedMs"] !== "number" ||
    typeof obj["webshareBytes"] !== "number" ||
    typeof obj["status"] !== "string" ||
    typeof obj["masked"] !== "number" ||
    typeof obj["variants"] !== "number"
  ) {
    return null;
  }
  return {
    taskId: obj["taskId"],
    providerId: obj["providerId"],
    window: obj["window"],
    day: obj["day"],
    elapsedMs: obj["elapsedMs"],
    webshareBytes: obj["webshareBytes"],
    status: obj["status"],
    masked: obj["masked"],
    variants: obj["variants"],
  };
}

export function createUsageRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post("/task/usage", async (c) => {
    if (!isAuthorized(c)) {
      c.get("logger").warn("usage.unauthorized");
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = parseUsageBody(await c.req.json().catch(() => null));
    if (body === null) {
      return c.json({ error: "invalid body" }, 400);
    }
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO task_usage (task_id, provider_id, window, day, elapsed_ms, webshare_bytes, status, masked, variants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(body.taskId, body.providerId, body.window, body.day, body.elapsedMs, body.webshareBytes, body.status, body.masked, body.variants, Date.now())
      .run();
    return c.json({ ok: true });
  });

  api.get("/summary/:window/:day", async (c) => {
    if (!isAuthorized(c)) {
      c.get("logger").warn("summary.unauthorized");
      return c.json({ error: "unauthorized" }, 401);
    }
    const window = c.req.param("window");
    const day = c.req.param("day");
    const dayStart = new Date(`${day}T00:00:00Z`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const db = c.env.DB;
    const doneRows = await db
      .prepare("SELECT provider_id FROM tasks WHERE window = ? AND status = 'done' AND created_at >= ? AND created_at < ?")
      .bind(window, dayStart, dayEnd)
      .all();
    const failedRows = await db
      .prepare("SELECT provider_id, error FROM tasks WHERE window = ? AND status IN ('failed','dlq') AND created_at >= ? AND created_at < ?")
      .bind(window, dayStart, dayEnd)
      .all();
    const pendingRows = await db
      .prepare("SELECT provider_id FROM tasks WHERE window = ? AND status = 'pending' AND created_at >= ? AND created_at < ?")
      .bind(window, dayStart, dayEnd)
      .all();
    const usageRows = await db
      .prepare("SELECT provider_id, webshare_bytes FROM task_usage WHERE window = ? AND day = ?")
      .bind(window, day)
      .all();
    const perProvider = new Map<string, number>();
    let transferBytes = 0;
    for (const row of usageRows.results as ReadonlyArray<Record<string, unknown>>) {
      const provider = row["provider_id"];
      const bytes = row["webshare_bytes"];
      if (typeof provider === "string" && typeof bytes === "number") {
        perProvider.set(provider, (perProvider.get(provider) ?? 0) + bytes);
        transferBytes += bytes;
      }
    }
    const done = (doneRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => row["provider_id"])
      .filter((value): value is string => typeof value === "string");
    const failed = (failedRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => ({ providerId: row["provider_id"], error: row["error"] ?? null }))
      .filter((entry): entry is { providerId: string; error: string | null } => typeof entry.providerId === "string");
    const pending = (pendingRows.results as ReadonlyArray<Record<string, unknown>>)
      .map((row) => row["provider_id"])
      .filter((value): value is string => typeof value === "string");
    return c.json({
      window,
      day,
      done,
      failed,
      pending,
      transferBytes,
      perProvider: [...perProvider.entries()].map(([providerId, bytes]) => ({ providerId, bytes })),
    });
  });

  return api;
}
