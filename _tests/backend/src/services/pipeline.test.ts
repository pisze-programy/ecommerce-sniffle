import { describe, expect, it } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, Provider, ProviderConfig, Catalog } from '@ecommerce-sniffle/providers';
import { runShopPipeline } from '../../../../backend/src/services/pipeline.ts';
import type { Storage, SeriesPoint } from '../../../../backend/src/services/storage.ts';
import type { DailyStats, Snapshot, StockEvent } from '@ecommerce-sniffle/analysis';

class MemoryStorage implements Storage {
  snapshots: Snapshot[] = [];
  stats: DailyStats[] = [];
  events: StockEvent[] = [];

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
    this.stats.push(stats);
  }

  async readDailyStats(shop: string, day: string): Promise<DailyStats | null> {
    const found = this.stats.find((entry) => entry.shop === shop && entry.day === day);
    return found === undefined ? null : found;
  }

  async writeEvents(_shop: string, _day: string, _snapshotAt: string, events: readonly StockEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async readEvents(_shop: string, _day: string): Promise<readonly StockEvent[]> {
    return this.events;
  }

  async readSeries(_shop: string, _productId: string): Promise<readonly SeriesPoint[]> {
    return [];
  }
}

function providerConfig(): ProviderConfig {
  return {
    id: 'mock',
    domain: 'mock.pl',
    platform: 'custom',
    schedule: '0 4 * * *',
    window: 'both' as const,
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 60,
    requiresProxy: false,
    endpoint: 'https://mock.pl',
    enabled: true,
  };
}

function provider(catalog: Catalog): Provider {
  return {
    config: providerConfig(),
    async fetchCatalog(): Promise<Catalog> {
      return catalog;
    },
  };
}

function catalog(quantity: number): Catalog {
  return {
    domain: 'mock.pl',
    fetchedAt: '2026-08-24T06:00:00.000Z',
    products: [
      {
        id: 'p1',
        title: 'Product One',
        url: 'https://mock.pl/p1',
        variants: [
          {
            id: 'v1',
            title: 'M',
            sku: null,
            price: { amount: 100, currency: 'PLN' },
            regularPrice: null,
            available: true,
            quantity,
          },
        ],
      },
    ],
  };
}

function silentLogger(): Logger {
  return createLogger(() => {
    // discard
  });
}

describe('runShopPipeline', () => {
  it('seeds when there is no previous snapshot', async () => {
    const storage = new MemoryStorage();
    const result = await runShopPipeline(provider(catalog(10)), storage, silentLogger());
    expect(result.seeded).toBe(true);
    expect(result.events).toBe(0);
    expect(storage.snapshots).toHaveLength(1);
    expect(storage.stats).toHaveLength(0);
  });

  it('diffs and writes stats on the second run', async () => {
    const storage = new MemoryStorage();
    await runShopPipeline(provider(catalog(12)), storage, silentLogger());
    const result = await runShopPipeline(provider(catalog(7)), storage, silentLogger());
    expect(result.seeded).toBe(false);
    expect(result.events).toBe(1);
    expect(storage.stats).toHaveLength(1);
    expect(storage.stats[0]?.unitsSold).toBe(5);
  });
});
