import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';
import { createStorage } from '../../../../backend/src/services/storage.ts';
import { fetchActiveAds } from '../../../../backend/src/services/metaads/fetch.ts';
import { runMetaAdsFetch } from '../../../../backend/src/services/metaads/run.ts';
import type { MetaFetchDeps } from '../../../../backend/src/services/metaads/fetch.ts';

type Responder = (query: string, args: readonly unknown[]) => unknown;

class MockStatement implements D1Statement {
  args: unknown[] = [];
  constructor(
    readonly query: string,
    private readonly responder: Responder
  ) {}

  bind(...values: unknown[]): D1Statement {
    this.args = values;
    return this;
  }

  async all(): Promise<{ results: unknown[] }> {
    const result = this.responder(this.query, this.args) as { results: unknown[] };
    return result;
  }

  async first(): Promise<unknown> {
    const result = this.responder(this.query, this.args) as { results: unknown[] };
    return result.results[0] === undefined ? null : result.results[0];
  }

  async run(): Promise<unknown> {
    return this.responder(this.query, this.args);
  }
}

class MockD1 implements D1Like {
  readonly calls: { query: string; args: readonly unknown[] }[] = [];
  constructor(private readonly responder: Responder) {}

  prepare(query: string): D1Statement {
    return new MockStatement(query, (q, args) => {
      this.calls.push({ query: q, args });
      return this.responder(q, args);
    });
  }

  async batch(statements: D1Statement[]): Promise<unknown> {
    for (const statement of statements) {
      await statement.all();
    }
    return [];
  }
}

function makeLogger(): { logger: Logger; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

function adRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '635204772540093',
    page_id: '1527130717525496',
    page_name: 'Laboratorium Pani Domu',
    ad_creation_time: '2025-03-10',
    ad_delivery_start_time: '2025-03-10',
    ad_delivery_stop_time: null,
    ad_creative_bodies: ['Czyści kostkę brukową.'],
    ad_creative_link_titles: ['Czyści kostkę brukową. 33% rabatu'],
    ad_creative_link_captions: ['laboratoriumpanidomu.pl'],
    ad_creative_link_descriptions: [],
    publisher_platforms: ['FACEBOOK', 'INSTAGRAM'],
    languages: ['pl'],
    eu_total_reach: 4174096,
    total_reach_by_location: [{ key: 'EU', value: 4174096 }],
    age_country_gender_reach_breakdown: [
      {
        country: 'PL',
        age_gender_breakdowns: [{ age_range: '25-34', female: 526027, male: 321382 }],
      },
    ],
    target_ages: ['18', '65'],
    target_gender: 'All',
    target_locations: [{ name: 'Poland', type: 'countries', excluded: false }],
    beneficiary_payers: [{ payer: 'Laboratorium Pani Domu', beneficiary: 'Laboratorium Pani Domu', current: true }],
    ...overrides,
  };
}

function stubFetchSequential(bodies: readonly Record<string, unknown>[], status = 200): void {
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const entry = bodies[Math.min(index, bodies.length - 1)];
      index += 1;
      return new Response(JSON.stringify(entry), { status });
    })
  );
}

function stubFetchWithStatus(entries: readonly { body: Record<string, unknown>; status: number }[]): void {
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const entry = entries[Math.min(index, entries.length - 1)];
      index += 1;
      return new Response(JSON.stringify(entry.body), { status: entry.status });
    })
  );
}

function entityRows(): unknown[] {
  return [
    {
      id: 'laboratoriumpanidomu',
      name: 'Laboratorium Pani Domu',
      kind: 'company',
      krs: '0000645460',
      regon: null,
      nip: null,
      bizraport_url: null,
      meta_page_id: '1527130717525496',
      cpm_min: null,
      cpm_max: null,
      logo_key: null,
      bg_key: null,
    },
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchActiveAds', () => {
  it('parses a full ad row', async () => {
    stubFetchSequential([{ data: [adRow()], paging: {} }]);
    const { logger } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger };
    const result = await fetchActiveAds(
      ['1527130717525496'],
      new Map([['1527130717525496', 'laboratoriumpanidomu']]),
      deps
    );
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    const ad = result.ads[0];
    expect(ad.adArchiveId).toBe('635204772540093');
    expect(ad.entityId).toBe('laboratoriumpanidomu');
    expect(ad.euTotalReach).toBe(4174096);
    expect(ad.reachBreakdown[0].country).toBe('PL');
    expect(ad.reachBreakdown[0].age_gender_breakdowns[0].female).toBe(526027);
    expect(ad.targetAges).toEqual(['18', '65']);
    expect(ad.targetGender).toBe('All');
    expect(ad.beneficiaryPayers[0].payer).toBe('Laboratorium Pani Domu');
    expect(ad.creativeHash.length).toBeGreaterThan(0);
  });

  it('follows pagination until the data is empty', async () => {
    stubFetchSequential([
      { data: [adRow({ id: '1' })], paging: { next: 'https://graph.facebook.com/page2' } },
      { data: [adRow({ id: '2' })], paging: { next: 'https://graph.facebook.com/page3' } },
      { data: [], paging: {} },
    ]);
    const { logger } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger };
    const result = await fetchActiveAds(['1527130717525496'], new Map(), deps);
    expect(result.ads.map((ad) => ad.adArchiveId)).toEqual(['1', '2']);
  });

  it('retries a rate limit error and returns the ad', async () => {
    stubFetchWithStatus([
      { body: { error: { code: 613, message: 'rate limit' } }, status: 400 },
      { body: { data: [adRow()], paging: {} }, status: 200 },
    ]);
    const { logger, records } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger };
    const result = await fetchActiveAds(['1527130717525496'], new Map(), deps);
    expect(result.ads).toHaveLength(1);
    expect(records.some((record) => record.message === 'metaads.rateLimited')).toBe(true);
  });

  it('reports a failed page with the reason on an api error', async () => {
    stubFetchSequential([{ error: { code: 190, message: 'token expired' } }]);
    const { logger } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger };
    const result = await fetchActiveAds(['1527130717525496'], new Map(), deps);
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].pageId).toBe('1527130717525496');
    expect(result.failed[0].reason).toContain('code 190');
  });

  it('attributes each ad to its own page id in a batch', async () => {
    stubFetchSequential([
      {
        data: [adRow({ id: '1', page_id: 'page-a' }), adRow({ id: '2', page_id: 'page-b' })],
        paging: {},
      },
    ]);
    const { logger } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger };
    const result = await fetchActiveAds(
      ['page-a', 'page-b'],
      new Map([
        ['page-a', 'shop-a'],
        ['page-b', 'shop-b'],
      ]),
      deps
    );
    expect(result.failed).toEqual([]);
    expect(result.ads.map((ad) => ad.adArchiveId)).toEqual(['1', '2']);
    expect(result.ads.map((ad) => ad.entityId)).toEqual(['shop-a', 'shop-b']);
  });

  it('reports a page cap as a failure', async () => {
    stubFetchSequential([{ data: [adRow()], paging: { next: 'https://graph.facebook.com/loop' } }]);
    const { logger } = makeLogger();
    const deps: MetaFetchDeps = { token: 'tok', logger, maxPages: 3 };
    const result = await fetchActiveAds(['1527130717525496'], new Map(), deps);
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('page cap');
  });
});

describe('runMetaAdsFetch', () => {
  it('writes ads and days and returns counts', async () => {
    stubFetchSequential([{ data: [adRow()], paging: {} }]);
    const { logger } = makeLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT id, name, kind, krs')) {
        return { results: entityRows() };
      }
      if (
        query.startsWith('SELECT id, name, linkedin_url') ||
        query.startsWith('SELECT owner_kind') ||
        query.startsWith('SELECT person_id') ||
        query.startsWith('SELECT from_entity_id')
      ) {
        return { results: [] };
      }
      if (query.startsWith('INSERT INTO meta_ads')) {
        return { results: [] };
      }
      if (query.startsWith('INSERT OR REPLACE INTO meta_ad_days')) {
        return { results: [] };
      }
      if (query.startsWith('UPDATE meta_ads SET stop_date')) {
        return { results: [], meta: { changes: 0 } };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const result = await runMetaAdsFetch(storage, logger, 'tok');
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(result.daysWritten).toBe(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO meta_ads'))).toBe(true);
    expect(db.calls.some((call) => call.query.startsWith('INSERT OR REPLACE INTO meta_ad_days'))).toBe(true);
  });

  it('ends ads of a page that now has no active ads', async () => {
    stubFetchSequential([{ data: [], paging: {} }]);
    const { logger } = makeLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT id, name, kind, krs')) {
        return { results: entityRows() };
      }
      if (
        query.startsWith('SELECT id, name, linkedin_url') ||
        query.startsWith('SELECT owner_kind') ||
        query.startsWith('SELECT person_id') ||
        query.startsWith('SELECT from_entity_id')
      ) {
        return { results: [] };
      }
      if (query.startsWith('UPDATE meta_ads SET stop_date')) {
        return { results: [], meta: { changes: 2 } };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const result = await runMetaAdsFetch(storage, logger, 'tok');
    expect(result.ads).toBe(0);
    expect(result.ended).toBe(2);
  });

  it('does not end ads of a failed page', async () => {
    stubFetchSequential([{ error: { code: 190, message: 'token expired' } }]);
    const { logger } = makeLogger();
    let updateCalls = 0;
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT id, name, kind, krs')) {
        return { results: entityRows() };
      }
      if (
        query.startsWith('SELECT id, name, linkedin_url') ||
        query.startsWith('SELECT owner_kind') ||
        query.startsWith('SELECT person_id') ||
        query.startsWith('SELECT from_entity_id')
      ) {
        return { results: [] };
      }
      if (query.startsWith('UPDATE meta_ads SET stop_date')) {
        updateCalls += 1;
        return { results: [], meta: { changes: 0 } };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const result = await runMetaAdsFetch(storage, logger, 'tok');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].pageId).toBe('1527130717525496');
    expect(result.failures[0].reason).toContain('code 190');
    expect(updateCalls).toBe(0);
  });
});
