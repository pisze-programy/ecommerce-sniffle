import { Hono } from 'hono';
import { createTaskStore } from '../services/queue.ts';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { isAuthorized } from './auth.ts';

const QUEUE_LEASE_MS = 30 * 60 * 1000;
const QUEUE_MAX_ATTEMPTS = 3;
const QUEUE_RETRY_BACKOFF_MS = 10 * 60 * 1000;

export function createQueueRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.post('/claim', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('queue.claim unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const workerId = c.req.header('X-Worker-Id') ?? 'anonymous';
    const modesParam = c.req.query('modes');
    const modes =
      modesParam === undefined || modesParam.length === 0
        ? ['cf-get', 'vps-get', 'vps-mutation']
        : modesParam
            .split(',')
            .map((mode) => mode.trim())
            .filter((mode) => mode.length > 0);
    const store = createTaskStore(c.env.DB, c.get('logger'));
    await store.reapExpired(Date.now(), QUEUE_MAX_ATTEMPTS);
    const task = await store.claimTask(workerId, QUEUE_LEASE_MS, Date.now(), QUEUE_MAX_ATTEMPTS, modes);
    return c.json({ task });
  });

  api.post('/complete', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('queue.complete unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    const taskId = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['taskId'] : null;
    const maskedCount =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['maskedCount'] : null;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return c.json({ error: 'invalid taskId' }, 400);
    }
    const store = createTaskStore(c.env.DB, c.get('logger'));
    const normalized = typeof maskedCount === 'number' ? maskedCount : null;
    await store.completeTask(taskId, normalized, Date.now());
    return c.json({ ok: true });
  });

  api.post('/fail', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('queue.fail unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    const taskId = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['taskId'] : null;
    const error = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['error'] : null;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return c.json({ error: 'invalid taskId' }, 400);
    }
    const store = createTaskStore(c.env.DB, c.get('logger'));
    await store.failTask(
      taskId,
      typeof error === 'string' ? error : 'unknown error',
      Date.now(),
      QUEUE_RETRY_BACKOFF_MS
    );
    return c.json({ ok: true });
  });

  api.get('/status', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('queue.status unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const store = createTaskStore(c.env.DB, c.get('logger'));
    const counts = await store.statusCounts();
    return c.json({ counts });
  });

  return api;
}
