import { Hono } from "hono";
import type { Env } from "../env/types.ts";
import type { AppVariables } from "./types.ts";
import { isAuthorized } from "./auth.ts";

export async function sendSnitchReport(
  env: Env,
  body: Readonly<Record<string, unknown>>,
): Promise<Response> {
  const url = env.SNITCH_URL ?? "";
  const token = env.SNITCH_TOKEN ?? "";
  if (url.length === 0 || token.length === 0) {
    return new Response(JSON.stringify({ error: "snitch not configured" }), { status: 500 });
  }
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
  if (env.SNITCH !== undefined) {
    return env.SNITCH.fetch(`${url}/v1/report`, init);
  }
  return fetch(`${url}/v1/report`, init);
}

export function createSnitchRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post("/snitch/test", async (c) => {
    if (!isAuthorized(c)) {
      c.get("logger").warn("snitch.test unauthorized");
      return c.json({ error: "unauthorized" }, 401);
    }
    const token = c.env.SNITCH_TOKEN ?? "";
    const response = await sendSnitchReport(c.env, {
      source: "ecommerce-pulse/cf/test",
      status: "ok",
      data: { from: "cloudflare", elapsedMs: 0 },
      notify: "always",
    });
    const upstreamBody = await response.text().catch(() => "");
    c.get("logger").info("snitch.test sent", {
      status: response.status,
      body: upstreamBody.slice(0, 200),
    });
    return c.json({
      ok: true,
      upstream: response.status,
      body: upstreamBody.slice(0, 200),
      snitchTokenLen: token.length,
      binding: c.env.SNITCH !== undefined,
    });
  });

  return api;
}
