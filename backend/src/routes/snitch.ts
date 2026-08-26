import { Hono } from 'hono';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { isAuthorized } from './auth.ts';
import { sendSnitchReport } from '../services/snitch.ts';

export { sendSnitchReport };

export function createSnitchRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post('/snitch/test', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('snitch.test unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const token = c.env.SNITCH_TOKEN ?? '';
    const response = await sendSnitchReport(c.env, {
      source: 'ecommerce-pulse/cf/test',
      status: 'ok',
      data: { from: 'cloudflare', elapsedMs: 0 },
      notify: 'always',
    });
    const upstreamBody = await response.text().catch(() => '');
    c.get('logger').info('snitch.test sent', {
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
