import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { buildProvider, createLogger } from '@ecommerce-sniffle/providers';
import type { Provider, ProviderModule } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { createApi } from '../../../../backend/src/routes/api.ts';
import type { AppVariables } from '../../../../backend/src/routes/api.ts';
import type { Env } from '../../../../backend/src/env/types.ts';
import type { D1Like, D1Statement, Storage, SeriesPoint } from '../../../../backend/src/services/storage.ts';
import type { DailyStats, Snapshot, StockEvent } from '@ecommerce-sniffle/analysis';

class MemoryStorage implements Storage {
  snapshots: Snapshot[] = [];
  stats: DailyStats[] = [];
  events: StockEvent[] = [];
  seriesPoints: SeriesPoint[] = [];

  async writeSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async readLatestSnapshot(shop: string): Promise<Snapshot | null> {
    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      const snapshot = this.snapshots[i];
      if (snapshot !== undefined && snapshot.shop === shop) {
        return snapshot;
      }
    }
    return null;
  }

  async writeDailyStats(stats: DailyStats): Promise<void> {
    this.stats = this.stats.filter((entry) => !(entry.shop === stats.shop && entry.day === stats.day));
    this.stats.push(stats);
  }

  async readDailyStats(shop: string, day: string): Promise<DailyStats | null> {
    const found = this.stats.find((entry) => entry.shop === shop && entry.day === day);
    return found === undefined ? null : found;
  }

  async writeEvents(_shop: string, _day: string, _snapshotAt: string, events: readonly StockEvent[]): Promise<void> {
    this.events = [...this.events, ...events];
  }

  async readEvents(_shop: string, _day: string): Promise<readonly StockEvent[]> {
    return this.events;
  }

  async readSeries(_shop: string, _productId: string): Promise<readonly SeriesPoint[]> {
    return this.seriesPoints.filter((point) => point.quantity !== null);
  }
}

class EmptyD1 implements D1Like {
  prepare(_query: string): D1Statement {
    return {
      bind(): D1Statement {
        return this;
      },
      async all() {
        return { results: [] };
      },
      async first() {
        return null;
      },
    };
  }

  async batch(): Promise<unknown> {
    return null;
  }
}

function mockProviderModule(): ProviderModule {
  const config = {
    id: 'mock',
    domain: 'mock.pl',
    platform: 'custom' as const,
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'cf-get' as const,
    stockSource: 'html' as const,
    ratePerSecond: 1,
    durationSeconds: 60,
    requiresProxy: false,
    endpoint: 'https://mock.pl',
    enabled: true,
  };
  return {
    config,
    build({ logger }): Provider {
      return buildProvider(config, logger, async () => ({
        domain: config.domain,
        fetchedAt: '2026-08-24T06:00:00.000Z',
        products: [],
      }));
    },
  };
}

function silentLogger(): Logger {
  return createLogger(() => {
    // discard
  });
}

function buildApp(
  storage: Storage,
  modules: readonly ProviderModule[] = []
): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.use('*', async (c, next) => {
    c.set('logger', silentLogger());
    c.set('storage', storage);
    c.set('db', new EmptyD1());
    c.set('modules', modules);
    await next();
  });
  app.route('/', createApi());
  return app;
}

function testEnv(): Env {
  return {
    DB: undefined as never,
    STATE: undefined as never,
    INGEST_SECRET: 'test-secret',
  };
}

function snapshotBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shop: 'sklepskolim.pl',
    snapshotAt: '2026-08-24T06:00:00.000Z',
    window: 'morning',
    variants: [{ productId: 'p1', variantId: 'v1', quantity: 13, price: 45, regularPrice: null, available: true }],
    ...overrides,
  };
}

describe('api', () => {
  it('returns ok on /health', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns daily stats for a shop', async () => {
    const storage = new MemoryStorage();
    const stats: DailyStats = {
      shop: 'forcer.pl',
      day: '2026-08-24',
      unitsSold: 85,
      revenue: 34200,
      restocked: 40,
      soldOutCount: 3,
      promotionCount: 12,
      maskedCount: 20,
    };
    await storage.writeDailyStats(stats);
    const app = buildApp(storage);
    const response = await app.request('/daily/forcer.pl?day=2026-08-24');
    const body = (await response.json()) as { stats: DailyStats };
    expect(response.status).toBe(200);
    expect(body.stats.unitsSold).toBe(85);
  });

  it('returns null stats when there is no data', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request('/daily/forcer.pl?day=2026-08-24');
    const body = (await response.json()) as { stats: DailyStats | null };
    expect(body.stats).toBeNull();
  });

  it('returns events for a shop and day', async () => {
    const storage = new MemoryStorage();
    const event: StockEvent = {
      type: 'sold',
      productId: 'p1',
      variantId: 'v1',
      from: null,
      to: null,
      units: 5,
      confidence: 'exact',
    };
    await storage.writeEvents('forcer.pl', '2026-08-24', '2026-08-24T06:00:00.000Z', [event]);
    const app = buildApp(storage);
    const response = await app.request('/changes/forcer.pl/2026-08-24');
    const body = (await response.json()) as { events: StockEvent[] };
    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
  });

  it('returns 400 for a series without a shop', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request('/series/p1');
    expect(response.status).toBe(400);
  });

  it('returns a series for a product', async () => {
    const storage = new MemoryStorage();
    storage.seriesPoints = [
      { snapshotAt: '2026-08-24T06:00:00.000Z', quantity: 7, price: 3500, available: true },
      { snapshotAt: '2026-08-25T06:00:00.000Z', quantity: 5, price: 3500, available: true },
    ];
    const app = buildApp(storage);
    const response = await app.request('/series/p1?shop=forcer.pl');
    const body = (await response.json()) as { series: SeriesPoint[] };
    expect(response.status).toBe(200);
    expect(body.series).toHaveLength(2);
  });

  it('returns the latest snapshot or null', async () => {
    const storage = new MemoryStorage();
    const app = buildApp(storage);
    const empty = await app.request('/latest/forcer.pl');
    expect(((await empty.json()) as { latest: Snapshot | null }).latest).toBeNull();

    const snapshot: Snapshot = {
      shop: 'forcer.pl',
      snapshotAt: '2026-08-24T06:00:00.000Z',
      window: 'morning',
      variants: [],
    };
    await storage.writeSnapshot(snapshot);
    const filled = await app.request('/latest/forcer.pl');
    expect(((await filled.json()) as { latest: Snapshot | null }).latest?.shop).toBe('forcer.pl');
  });
});

describe('api /run', () => {
  it('returns coverage for enabled shops with a snapshot', async () => {
    const storage = new MemoryStorage();
    storage.snapshots.push({
      shop: 'mock.pl',
      snapshotAt: '2026-08-24T06:00:00.000Z',
      window: 'morning',
      variants: [
        { productId: 'p1', variantId: 'v1', quantity: 7, price: 10, regularPrice: null, available: true },
        { productId: 'p2', variantId: 'v2', quantity: null, price: 10, regularPrice: null, available: true },
      ],
    });
    const app = buildApp(storage, [mockProviderModule()]);
    const response = await app.request('/coverage');
    const body = (await response.json()) as { shops: Array<Record<string, unknown>> };
    expect(body.shops).toHaveLength(1);
    expect(body.shops[0]?.['id']).toBe('mock');
    expect(body.shops[0]?.['variants']).toBe(2);
    expect(body.shops[0]?.['exact']).toBe(1);
    expect(body.shops[0]?.['masked']).toBe(1);
  });

  it('runs the get pipeline for the configured modules', async () => {
    const app = buildApp(new MemoryStorage(), [mockProviderModule()]);
    const response = await app.request('/run');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { ok: boolean; providerId: string }[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.ok).toBe(true);
  });

  it('returns 404 for an unknown shop', async () => {
    const app = buildApp(new MemoryStorage(), [mockProviderModule()]);
    const response = await app.request('/run?shop=unknown.pl');
    expect(response.status).toBe(404);
  });

  it('runs a single shop when requested', async () => {
    const app = buildApp(new MemoryStorage(), [mockProviderModule()]);
    const response = await app.request('/run?shop=mock.pl');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { ok: boolean }[] };
    expect(body.results).toHaveLength(1);
  });
});

describe('api /ingest', () => {
  it('rejects when no secret is configured', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request(
      '/ingest',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      { ...testEnv(), INGEST_SECRET: '' }
    );
    expect(response.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify(snapshotBody()),
      },
      testEnv()
    );
    expect(response.status).toBe(401);
  });

  it('seeds a snapshot via ingest', async () => {
    const storage = new MemoryStorage();
    const app = buildApp(storage);
    const response = await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: JSON.stringify(snapshotBody()),
      },
      testEnv()
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { seeded: boolean } };
    expect(body.result.seeded).toBe(true);
    expect(storage.snapshots).toHaveLength(1);
  });

  it('diffs and writes stats on the second ingest', async () => {
    const storage = new MemoryStorage();
    const app = buildApp(storage);
    const first = snapshotBody();
    const second = snapshotBody({
      variants: [{ productId: 'p1', variantId: 'v1', quantity: 10, price: 45, regularPrice: null, available: true }],
    });
    await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: JSON.stringify(first),
      },
      testEnv()
    );
    const response = await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: JSON.stringify(second),
      },
      testEnv()
    );
    const body = (await response.json()) as { result: { seeded: boolean; events: number; stats: DailyStats } };
    expect(body.result.seeded).toBe(false);
    expect(body.result.events).toBeGreaterThan(0);
    expect(body.result.stats.unitsSold).toBe(3);
    expect(storage.events.length).toBeGreaterThan(0);
  });

  it('rejects an invalid snapshot body', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: JSON.stringify({ shop: 123 }),
      },
      testEnv()
    );
    expect(response.status).toBe(400);
  });

  it('rejects a malformed json body', async () => {
    const app = buildApp(new MemoryStorage());
    const response = await app.request(
      '/ingest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: 'not-json',
      },
      testEnv()
    );
    expect(response.status).toBe(400);
  });
});
