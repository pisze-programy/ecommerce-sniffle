import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';
import { createStorage } from '../../../../backend/src/services/storage.ts';
import {
  fetchGoogleAdsCore,
  fetchGoogleAdsStatic,
  fetchGoogleAdsSurfaces,
} from '../../../../backend/src/services/googleads/fetch.ts';
import { buildSql } from '../../../../backend/src/services/googleads/sql.ts';
import {
  runGoogleAdsCoreFetch,
  runGoogleAdsStaticFetch,
  runGoogleAdsSurfacesFetch,
} from '../../../../backend/src/services/googleads/run.ts';
import type { GoogleFetchDeps } from '../../../../backend/src/services/googleads/fetch.ts';

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

function makeKeyJson(): string {
  return makeKeyPair().keyJson;
}

function makeKeyPair(): { keyJson: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  return {
    publicPem,
    keyJson: JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: pem,
    }),
  };
}

function b64ToBytes(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const AR = 'AR10613569593844695041';
const CR = 'CR05850846188550488065';

function strField(name: string): Record<string, unknown> {
  return { name, type: 'STRING', mode: 'NULLABLE' };
}

function intField(name: string): Record<string, unknown> {
  return { name, type: 'INTEGER', mode: 'NULLABLE' };
}

function v(value: unknown): Record<string, unknown> {
  return { v: value };
}

// A repeated region record with the core fields.
function coreRegion(code: string, last: string, lo: string, hi: string): Record<string, unknown> {
  return { v: { f: [v(code), v(last), v(lo), v(hi)] } };
}

function coreSchema(): Record<string, unknown> {
  return {
    fields: [
      strField('advertiser_id'),
      strField('creative_id'),
      {
        name: 'region_stats',
        type: 'RECORD',
        mode: 'REPEATED',
        fields: [
          strField('region_code'),
          strField('last_shown'),
          intField('times_shown_lower_bound'),
          intField('times_shown_upper_bound'),
        ],
      },
    ],
  };
}

function coreRow(
  region: Record<string, unknown> = coreRegion('PL', '2026-09-02', '15000', '20000')
): Record<string, unknown> {
  return { f: [v(AR), v(CR), { v: [region] }] };
}

function staticRegion(code: string, first: string): Record<string, unknown> {
  return { v: { f: [v(code), v(first)] } };
}

function staticSchema(): Record<string, unknown> {
  return {
    fields: [
      strField('advertiser_id'),
      strField('creative_id'),
      strField('ad_format_type'),
      strField('topic'),
      {
        name: 'region_stats',
        type: 'RECORD',
        mode: 'REPEATED',
        fields: [strField('region_code'), strField('first_shown')],
      },
    ],
  };
}

function staticRow(region: Record<string, unknown> = staticRegion('PL', '2025-09-10')): Record<string, unknown> {
  return { f: [v(AR), v(CR), v('VIDEO'), v('Home & Garden'), { v: [region] }] };
}

// The surfaces query returns a record holding a repeated surface list.
function surfacesRegion(code: string, surface: string, lo: string, hi: string): Record<string, unknown> {
  return { v: { f: [v(code), { v: { f: [{ v: [{ v: { f: [v(surface), v(lo), v(hi), v(null)] } }] }] } }] } };
}

function surfacesSchema(): Record<string, unknown> {
  return {
    fields: [
      strField('advertiser_id'),
      strField('creative_id'),
      {
        name: 'region_stats',
        type: 'RECORD',
        mode: 'REPEATED',
        fields: [
          strField('region_code'),
          {
            name: 'surface_serving_stats',
            type: 'RECORD',
            mode: 'NULLABLE',
            fields: [
              {
                name: 'surface_serving_stats',
                type: 'RECORD',
                mode: 'REPEATED',
                fields: [
                  strField('surface'),
                  intField('times_shown_lower_bound'),
                  intField('times_shown_upper_bound'),
                  strField('times_shown_availability_date'),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function surfacesRow(
  region: Record<string, unknown> = surfacesRegion('PL', 'YOUTUBE', '1000', '2000')
): Record<string, unknown> {
  return { f: [v(AR), v(CR), { v: [region] }] };
}

function stubBigQuery(schema: Record<string, unknown>, rows: readonly Record<string, unknown>[]): void {
  const bodies: Record<string, unknown>[] = [
    { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
    { jobComplete: true, totalBytesProcessed: '22000', schema: { fields: [] } },
    { jobComplete: true, totalBytesProcessed: '22000', schema, rows },
  ];
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const entry = bodies[Math.min(index, bodies.length - 1)];
      index += 1;
      return new Response(JSON.stringify(entry), { status: 200 });
    })
  );
}

function entityRows(advertiserId: string | null = AR): unknown[] {
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
      google_advertiser_id: advertiserId,
      cpm_min: null,
      cpm_max: null,
      logo_key: null,
      bg_key: null,
    },
  ];
}

function entityStoreDb(): MockD1 {
  return new MockD1((query) => {
    if (query.startsWith('SELECT id, name, kind, krs')) {
      return { results: entityRows() };
    }
    return { results: [] };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGoogleAdsCore', () => {
  it('signs the token assertion with verifiable bytes', async () => {
    const { keyJson, publicPem } = makeKeyPair();
    let assertion = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: { body?: unknown }) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2')) {
          const params = new URLSearchParams(String(init?.body ?? ''));
          assertion = params.get('assertion') ?? '';
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        return new Response(JSON.stringify({ jobComplete: true, totalBytesProcessed: '10' }), { status: 200 });
      })
    );
    const { logger } = makeLogger();
    await fetchGoogleAdsCore([AR], new Map(), { keyJson, logger });
    const parts = assertion.split('.');
    expect(parts).toHaveLength(3);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    expect(verifier.verify(publicPem, b64ToBytes(parts[2] as string))).toBe(true);
  });

  it('parses a creative with the PL region entry', async () => {
    stubBigQuery(coreSchema(), [coreRow()]);
    const { logger, records } = makeLogger();
    const deps: GoogleFetchDeps = { keyJson: makeKeyJson(), logger };
    const result = await fetchGoogleAdsCore([AR], new Map([[AR, 'laboratoriumpanidomu']]), deps);
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    const ad = result.ads[0];
    expect(ad.creativeId).toBe(CR);
    expect(ad.advertiserId).toBe(AR);
    expect(ad.entityId).toBe('laboratoriumpanidomu');
    expect(ad.impLo).toBe(15000);
    expect(ad.impHi).toBe(20000);
    expect(ad.lastShown).toBe('2026-09-02');
    expect(records.some((record) => record.message === 'googleads.fetched')).toBe(true);
  });

  it('falls back to the EEA aggregate without a PL entry', async () => {
    stubBigQuery(coreSchema(), [coreRow(coreRegion('EEA', '2026-09-01', '1000', '2000'))]);
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].impLo).toBe(1000);
    expect(result.ads[0].lastShown).toBe('2026-09-01');
  });

  it('skips a creative with no PL or EEA entry and logs the count', async () => {
    stubBigQuery(coreSchema(), [coreRow(coreRegion('US', '2026-09-01', '1000', '2000'))]);
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(0);
    const fetched = records.find((record) => record.message === 'googleads.fetched');
    expect(fetched === undefined ? null : (fetched.context as { skipped?: number }).skipped).toBe(1);
  });

  it('reports bad key JSON with the log record', async () => {
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: 'not-json', logger });
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('BigQuery key');
    expect(records.some((record) => record.message === 'bigquery.badKey')).toBe(true);
  });

  it('reports a key without fields with the log record', async () => {
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: '{"type":"service_account"}', logger });
    expect(result.failed).toHaveLength(1);
    expect(records.some((record) => record.message === 'bigquery.badKey')).toBe(true);
  });

  it('reports a token failure with the log record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('denied', { status: 403 }))
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('token HTTP 403');
    expect(records.some((record) => record.message === 'bigquery.tokenFailed')).toBe(true);
  });

  it('reports a query failure with the log record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        return new Response('boom', { status: 500 });
      })
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('BigQuery HTTP 500');
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('polls an incomplete job and reads the result', async () => {
    const bodies: Record<string, unknown>[] = [
      { access_token: 'tok', expires_in: 3600 },
      { jobComplete: true, totalBytesProcessed: '10', schema: { fields: [] } },
      { jobComplete: false, jobReference: { jobId: 'job-1' } },
      { jobComplete: true, totalBytesProcessed: '22000', schema: coreSchema(), rows: [coreRow()] },
    ];
    let index = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const entry = bodies[Math.min(index, bodies.length - 1)];
        index += 1;
        return new Response(JSON.stringify(entry), { status: 200 });
      })
    );
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), {
      keyJson: makeKeyJson(),
      logger,
      maxPolls: 3,
      pollDelayMs: 0,
    });
    expect(result.ads).toHaveLength(1);
  });

  it('fails advertisers when the job never completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: { body?: unknown }) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        if (url.endsWith('/queries')) {
          const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { dryRun?: boolean }) : {};
          if (body.dryRun === true) {
            return new Response(JSON.stringify({ jobComplete: true, totalBytesProcessed: '10' }), { status: 200 });
          }
          return new Response(JSON.stringify({ jobComplete: false, jobReference: { jobId: 'job-1' } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ jobComplete: false }), { status: 200 });
      })
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), {
      keyJson: makeKeyJson(),
      logger,
      maxPolls: 2,
      pollDelayMs: 0,
    });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('still running');
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('caps a near-INT64_MAX sentinel bound and logs it', async () => {
    stubBigQuery(coreSchema(), [coreRow(coreRegion('PL', '2026-09-02', '10000000', '9223372036854776000'))]);
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].impLo).toBe(null);
    expect(result.ads[0].impHi).toBe(null);
    expect(result.capped).toBe(1);
    expect(records.some((record) => record.message === 'googleads.boundsCapped')).toBe(true);
  });

  it('logs the real bytes processed and caps the job', async () => {
    const bodies: Record<string, unknown>[] = [
      { access_token: 'tok', expires_in: 3600 },
      { jobComplete: true, totalBytesProcessed: '999', schema: { fields: [] } },
      { jobComplete: true, totalBytesProcessed: '22000', schema: coreSchema(), rows: [coreRow()] },
    ];
    let index = 0;
    let realBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: { body?: unknown }) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/queries') && typeof init?.body === 'string') {
          realBody = init.body;
        }
        const entry = bodies[Math.min(index, bodies.length - 1)];
        index += 1;
        return new Response(JSON.stringify(entry), { status: 200 });
      })
    );
    const { logger, records } = makeLogger();
    await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(realBody).toContain('maximumBytesBilled');
    const bytes = records.find((record) => record.message === 'googleads.bytesProcessed');
    expect(bytes === undefined ? null : (bytes.context as { bytes?: string }).bytes).toBe('22000');
    expect(records.some((record) => record.message === 'bigquery.queryPlanned')).toBe(true);
  });

  it('returns empty without advertisers and calls no fetch', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsCore([], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result).toEqual({ ads: [], failed: [], capped: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('fetchGoogleAdsStatic', () => {
  it('parses the format, the topic and the first shown date', async () => {
    stubBigQuery(staticSchema(), [staticRow()]);
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsStatic([AR], new Map([[AR, 'laboratoriumpanidomu']]), {
      keyJson: makeKeyJson(),
      logger,
    });
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].format).toBe('VIDEO');
    expect(result.ads[0].topic).toBe('Home & Garden');
    expect(result.ads[0].firstShown).toBe('2025-09-10');
    expect(result.ads[0].entityId).toBe('laboratoriumpanidomu');
  });
});

describe('fetchGoogleAdsSurfaces', () => {
  it('parses the per-platform split', async () => {
    stubBigQuery(surfacesSchema(), [surfacesRow()]);
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsSurfaces([AR], { keyJson: makeKeyJson(), logger });
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].surfaces[0].surface).toBe('YOUTUBE');
    expect(result.ads[0].surfaces[0].lo).toBe(1000);
  });
});

describe('runGoogleAdsCoreFetch', () => {
  it('writes ads and days and returns counts', async () => {
    stubBigQuery(coreSchema(), [coreRow()]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(result.daysWritten).toBe(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(true);
    expect(db.calls.some((call) => call.query.startsWith('INSERT OR REPLACE INTO google_ad_days'))).toBe(true);
  });

  it('counts ads with an old last shown date as ended', async () => {
    stubBigQuery(coreSchema(), [coreRow(coreRegion('PL', '2024-02-01', '1000', '2000'))]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, makeKeyJson());
    expect(result.ads).toBe(1);
    expect(result.ended).toBe(1);
  });

  it('warns on a shared advertiser and keeps the first owner', async () => {
    stubBigQuery(coreSchema(), [coreRow()]);
    const { logger, records } = makeLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT id, name, kind, krs')) {
        const rows = entityRows();
        return {
          results: [...rows, { ...(rows[0] as Record<string, unknown>), id: 'other-shop' }],
        };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(records.some((record) => record.message === 'googleads.sharedAdvertiser')).toBe(true);
  });

  it('writes no day row for a capped creative', async () => {
    stubBigQuery(coreSchema(), [coreRow(coreRegion('PL', '2026-09-02', '10000000', '9223372036854776000'))]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(result.capped).toBe(1);
    expect(result.daysWritten).toBe(0);
    expect(db.calls.some((call) => call.query.startsWith('INSERT OR REPLACE INTO google_ad_days'))).toBe(false);
  });

  it('skips the fetch without advertisers', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const { logger } = makeLogger();
    const db = new MockD1((query) => {
      if (query.startsWith('SELECT id, name, kind, krs')) {
        return { results: entityRows(null) };
      }
      return { results: [] };
    });
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, makeKeyJson());
    expect(result).toEqual({ shops: 0, ads: 0, daysWritten: 0, ended: 0, capped: 0, failures: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports failures without writes on a bad key', async () => {
    const { logger, records } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsCoreFetch(storage, logger, 'not-json');
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(false);
    expect(records.some((record) => record.message === 'googleads.runDone')).toBe(true);
  });
});

describe('runGoogleAdsStaticFetch', () => {
  it('writes the static fields', async () => {
    stubBigQuery(staticSchema(), [staticRow()]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsStaticFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(true);
  });
});

describe('runGoogleAdsSurfacesFetch', () => {
  it('writes the surfaces split', async () => {
    stubBigQuery(surfacesSchema(), [surfacesRow()]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsSurfacesFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(true);
  });
});

describe('BigQuery failure handling', () => {
  it('fails the run when the job completes with errors', async () => {
    const bodies: Record<string, unknown>[] = [
      { access_token: 'tok', expires_in: 3600 },
      { jobComplete: true, totalBytesProcessed: '10', schema: { fields: [] } },
      { jobComplete: true, errors: [{ message: 'query failed hard' }] },
    ];
    let index = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const entry = bodies[Math.min(index, bodies.length - 1)];
        index += 1;
        return new Response(JSON.stringify(entry), { status: 200 });
      })
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('query failed hard');
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('fails the run when the token holds no access_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 }))
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('access_token');
    expect(records.some((record) => record.message === 'bigquery.tokenFailed')).toBe(true);
  });

  it('reads every result page through the cursor', async () => {
    const second = { f: [v(AR), v('CR2'), { v: [coreRegion('PL', '2026-09-02', '1', '2')] }] };
    const bodies: Record<string, unknown>[] = [
      { access_token: 'tok', expires_in: 3600 },
      { jobComplete: true, totalBytesProcessed: '10', schema: { fields: [] } },
      {
        jobComplete: true,
        totalBytesProcessed: '22000',
        jobReference: { jobId: 'job-1' },
        schema: coreSchema(),
        rows: [coreRow()],
        pageToken: 'p2',
      },
      { jobComplete: true, schema: coreSchema(), rows: [second] },
    ];
    let index = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const entry = bodies[Math.min(index, bodies.length - 1)];
        index += 1;
        return new Response(JSON.stringify(entry), { status: 200 });
      })
    );
    const { logger } = makeLogger();
    const result = await fetchGoogleAdsCore([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(2);
  });

  it('reports a static query failure with the log record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        return new Response('boom', { status: 500 });
      })
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsStatic([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('reports a surfaces query failure with the log record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('oauth2')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        return new Response('boom', { status: 500 });
      })
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAdsSurfaces([AR], { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });
});

describe('buildSql', () => {
  it('projects only the core leaves', () => {
    const sql = buildSql('core', [AR]);
    expect(sql).toContain('r.region_code, r.last_shown');
    expect(sql).toContain('times_shown_lower_bound');
    expect(sql).not.toContain('surface_serving_stats');
    expect(sql).not.toContain('audience_selection_approach_info');
    expect(sql).not.toContain('creative_page_url');
    expect(sql).not.toContain('disclosed_name');
    expect(sql).toContain(`IN ('${AR}')`);
  });

  it('static projects the format, the topic and the first shown date', () => {
    const sql = buildSql('static', [AR]);
    expect(sql).toContain('ad_format_type');
    expect(sql).toContain('topic');
    expect(sql).toContain('r.region_code, r.first_shown');
    expect(sql).not.toContain('surface_serving_stats');
  });

  it('surfaces projects the per-platform split only', () => {
    const sql = buildSql('surfaces', [AR]);
    expect(sql).toContain('r.surface_serving_stats');
    expect(sql).not.toContain('ad_format_type');
    expect(sql).not.toContain('last_shown');
    expect(sql).not.toContain('audience_selection_approach_info');
  });
});
