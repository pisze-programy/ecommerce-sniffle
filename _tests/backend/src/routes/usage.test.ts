import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createLogger } from '@ecommerce-sniffle/providers';
import { createApi } from '../../../../backend/src/routes/api.ts';
import type { AppVariables } from '../../../../backend/src/routes/api.ts';
import type { Env } from '../../../../backend/src/env/types.ts';
import { createStorage } from '../../../../backend/src/services/storage.ts';

interface StatementMock {
  readonly query: string;
  readonly binds: readonly unknown[];
  readonly all: (results: ReadonlyArray<Record<string, unknown>>) => void;
  readonly run: () => void;
}

function mockEnv(results: ReadonlyArray<Record<string, unknown>>): Env {
  const statements: StatementMock[] = [];
  const db = {
    prepare(query: string) {
      let binds: readonly unknown[] = [];
      let runResolve: (() => void) | null = null;
      let allResolve: ((r: ReadonlyArray<Record<string, unknown>>) => void) | null = null;
      const statement = {
        bind(...args: unknown[]) {
          binds = args;
          return statement;
        },
        async all() {
          if (allResolve !== null) {
            allResolve(results);
          }
          return { results };
        },
        async run() {
          if (runResolve !== null) {
            runResolve();
          }
          return { meta: { changes: 1 } };
        },
      };
      statements.push({
        query,
        binds,
        all: (r) => {
          allResolve = (v) => v;
          allResolve(r);
        },
        run: () => {
          runResolve = () => undefined;
          runResolve();
        },
      });
      return statement;
    },
    async batch() {
      return [];
    },
  };
  return {
    DB: db as never,
    STATE: null as never,
    INGEST_SECRET: 'test-secret',
  };
}

function makeApp(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.use('*', async (c, next) => {
    const logger = createLogger(() => {});
    c.set('logger', logger);
    c.set('storage', createStorage(c.env.DB, logger));
    c.set('modules', []);
    await next();
  });
  app.route('/', createApi());
  return app;
}

describe('usage routes', () => {
  it('stores task usage', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/task/usage',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: 'morning-godsavequeens-2026-08-25',
          providerId: 'godsavequeens',
          window: 'morning',
          day: '2026-08-25',
          elapsedMs: 1000,
          webshareBytes: 2000,
          status: 'ok',
          masked: 0,
          variants: 10,
        }),
      },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('rejects an invalid usage body', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/task/usage',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'x' }),
      },
      env
    );
    expect(response.status).toBe(400);
  });

  it('returns the summary with done, failed, pending and transfer', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/summary/morning/2026-08-25',
      { headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      window: string;
      done: string[];
      failed: Array<{ providerId: string; error: string | null }>;
      pending: string[];
      transferBytes: number;
    };
    expect(body.window).toBe('morning');
    expect(Array.isArray(body.done)).toBe(true);
    expect(Array.isArray(body.failed)).toBe(true);
    expect(Array.isArray(body.pending)).toBe(true);
    expect(typeof body.transferBytes).toBe('number');
  });

  it('rejects an unauthorized request', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request('/summary/morning/2026-08-25', undefined, env);
    expect(response.status).toBe(401);
  });

  it('excludes cf-get tasks from the vps summary', async () => {
    const taskQueries: string[] = [];
    const db = {
      prepare(query: string) {
        if (query.includes(' FROM tasks ')) {
          taskQueries.push(query);
        }
        const statement = {
          bind() {
            return statement;
          },
          async all() {
            if (query.includes("status = 'done'") && query.includes("mode IN ('vps-get','vps-mutation')")) {
              return { results: [{ provider_id: 'forcer' }] };
            }
            return { results: [] };
          },
          async run() {
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
      async batch() {
        return [];
      },
    };
    const app = makeApp();
    const env = {
      DB: db,
      STATE: null as never,
      INGEST_SECRET: 'test-secret',
    };
    const response = await app.request(
      '/summary/morning/2026-08-25',
      { headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      done: string[];
      failed: Array<{ providerId: string }>;
      pending: string[];
    };
    expect(body.done).toEqual(['forcer']);
    expect(body.pending).toEqual([]);
    expect(taskQueries.length).toBe(3);
    for (const query of taskQueries) {
      expect(query).toContain("mode IN ('vps-get','vps-mutation')");
    }
  });

  it('recomputes daily stats with the sanity cap', async () => {
    let insertBinds: readonly unknown[] = [];
    const db = {
      prepare(query: string) {
        const statement = {
          bind(...args: unknown[]) {
            if (query.startsWith('INSERT OR REPLACE INTO daily_stats')) {
              insertBinds = args;
            }
            return statement;
          },
          async all() {
            if (query.startsWith('SELECT DISTINCT shop')) {
              return { results: [{ shop: 'forcer.pl' }] };
            }
            if (query.startsWith('SELECT DISTINCT date(snapshot_at)')) {
              return { results: [{ day: '2026-08-24' }] };
            }
            if (query.startsWith('SELECT * FROM events')) {
              return {
                results: [
                  {
                    type: 'sold',
                    product_id: 'p1',
                    variant_id: 'v1',
                    from_quantity: 10264,
                    to_quantity: 50,
                    from_price: 10,
                    to_price: 10,
                    units: 10214,
                    confidence: 'exact',
                  },
                  {
                    type: 'sold',
                    product_id: 'p2',
                    variant_id: 'v2',
                    from_quantity: 7,
                    to_quantity: 2,
                    from_price: 100,
                    to_price: 100,
                    units: 5,
                    confidence: 'exact',
                  },
                ],
              };
            }
            return { results: [] };
          },
          async first() {
            if (query.startsWith('SELECT MAX(ABS(quantity))')) {
              return { max_q: 50 };
            }
            return null;
          },
          async run() {
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
      async batch() {
        return [];
      },
    };
    const env = { DB: db as never, STATE: null as never, INGEST_SECRET: 'test-secret' };
    const app = makeApp();
    const response = await app.request(
      '/admin/recompute-daily-stats',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
        body: '{}',
      },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; shops: number; days: number };
    expect(body.ok).toBe(true);
    expect(body.shops).toBe(1);
    expect(body.days).toBe(1);
    expect(insertBinds[2]).toBe(5);
    expect(insertBinds[3]).toBe(500);
    expect(insertBinds[7]).toBe(0);
    expect(insertBinds[8]).toBe(1);
  });

  it('rejects an unauthorized recompute request', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request('/admin/recompute-daily-stats', { method: 'POST', body: '{}' }, env);
    expect(response.status).toBe(401);
  });

  it('upserts names via the admin endpoint', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/admin/upsert-names',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: 'forcer.pl',
          products: [{ productId: 'p1', url: 'https://forcer.pl/products/set-air', title: 'SET AIR' }],
          variants: [{ productId: 'p1', variantId: 'v1', title: 'Black / S' }],
        }),
      },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; products: number; variants: number };
    expect(body.ok).toBe(true);
    expect(body.products).toBe(1);
    expect(body.variants).toBe(1);
  });

  it('rejects an invalid upsert-names body', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/admin/upsert-names',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
        body: '{}',
      },
      env
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unauthorized upsert-names request', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request('/admin/upsert-names', { method: 'POST', body: '{}' }, env);
    expect(response.status).toBe(401);
  });

  it('uploads an entity logo and stores its key', async () => {
    let putKey = '';
    const bucket = {
      put: async (key: string) => {
        putKey = key;
      },
    };
    const env = { ...mockEnv([]), MEDIA: bucket as never };
    const app = makeApp();
    const response = await app.request(
      '/admin/upload-image?kind=entity&id=hdrey-group&role=logo',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; key: string };
    expect(body.ok).toBe(true);
    expect(body.key).toBe('entities/hdrey-group/logo.png');
    expect(putKey).toBe('entities/hdrey-group/logo.png');
  });

  it('uploads a person avatar and stores its key', async () => {
    const bucket = {
      put: async () => undefined,
    };
    const env = { ...mockEnv([]), MEDIA: bucket as never };
    const app = makeApp();
    const response = await app.request(
      '/admin/upload-image?kind=person&id=rafal&role=avatar',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'image/webp' },
        body: new Uint8Array([1]),
      },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; key: string };
    expect(body.key).toBe('persons/rafal/avatar.webp');
  });

  it('rejects an invalid role', async () => {
    const env = { ...mockEnv([]), MEDIA: { put: async () => undefined } as never };
    const app = makeApp();
    const response = await app.request(
      '/admin/upload-image?kind=entity&id=hdrey-group&role=poster',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'image/png' },
        body: new Uint8Array([1]),
      },
      env
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unauthorized upload', async () => {
    const env = { ...mockEnv([]), MEDIA: { put: async () => undefined } as never };
    const app = makeApp();
    const response = await app.request(
      '/admin/upload-image?kind=entity&id=hdrey-group&role=logo',
      { method: 'POST', body: new Uint8Array([1]) },
      env
    );
    expect(response.status).toBe(401);
  });

  it('rejects an unauthorized meta ads fetch', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request('/admin/fetch-meta-ads', { method: 'POST' }, env);
    expect(response.status).toBe(401);
  });

  it('fails when the meta token is missing', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/admin/fetch-meta-ads',
      { method: 'POST', headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(500);
  });

  it('runs the meta ads fetch with a token', async () => {
    const env = { ...mockEnv([]), META_AD_TOKEN: 'tok' };
    const app = makeApp();
    const response = await app.request(
      '/admin/fetch-meta-ads',
      { method: 'POST', headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; shops: number };
    expect(body.ok).toBe(true);
    expect(body.shops).toBe(0);
  });

  it('rejects an unauthorized google ads fetch', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request('/admin/fetch-google-ads', { method: 'POST' }, env);
    expect(response.status).toBe(401);
  });

  it('fails when the google key is missing', async () => {
    const env = mockEnv([]);
    const app = makeApp();
    const response = await app.request(
      '/admin/fetch-google-ads',
      { method: 'POST', headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(500);
  });

  it('runs the google ads fetch with a key and no advertisers', async () => {
    const env = { ...mockEnv([]), GOOGLE_BQ_KEY: '{"type":"service_account"}' };
    const app = makeApp();
    const response = await app.request(
      '/admin/fetch-google-ads',
      { method: 'POST', headers: { Authorization: 'Bearer test-secret' } },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; shops: number };
    expect(body.ok).toBe(true);
    expect(body.shops).toBe(0);
  });
});
