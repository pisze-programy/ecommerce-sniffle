import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';
import { createStorage } from '../../../../backend/src/services/storage.ts';
import { fetchGoogleAds } from '../../../../backend/src/services/googleads/fetch.ts';
import { runGoogleAdsFetch } from '../../../../backend/src/services/googleads/run.ts';
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

function strField(name: string): Record<string, unknown> {
  return { name, type: 'STRING', mode: 'NULLABLE' };
}

function querySchema(): Record<string, unknown> {
  const sub = (name: string): Record<string, unknown> => ({ name, type: 'STRING', mode: 'NULLABLE' });
  const bound = (name: string): Record<string, unknown> => ({ name, type: 'INTEGER', mode: 'NULLABLE' });
  return {
    fields: [
      strField('advertiser_id'),
      strField('creative_id'),
      strField('creative_page_url'),
      strField('ad_format_type'),
      strField('topic'),
      strField('advertiser_disclosed_name'),
      {
        name: 'audience_selection_approach_info',
        type: 'RECORD',
        mode: 'NULLABLE',
        fields: [
          sub('demographic_info'),
          sub('geo_location'),
          sub('contextual_signals'),
          sub('customer_lists'),
          sub('topics_of_interest'),
        ],
      },
      {
        name: 'region_stats',
        type: 'RECORD',
        mode: 'REPEATED',
        fields: [
          sub('region_code'),
          sub('first_shown'),
          sub('last_shown'),
          bound('times_shown_lower_bound'),
          bound('times_shown_upper_bound'),
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
                  sub('surface'),
                  bound('times_shown_lower_bound'),
                  bound('times_shown_upper_bound'),
                  sub('times_shown_availability_date'),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function v(value: unknown): Record<string, unknown> {
  return { v: value };
}

function regionCell(code: string, first: string, last: string, lo: string, hi: string): Record<string, unknown> {
  return {
    v: {
      f: [
        v(code),
        v(first),
        v(last),
        v(lo),
        v(hi),
        {
          v: {
            f: [
              {
                v: [{ v: { f: [v('YOUTUBE'), v(lo), v(hi), v(null)] } }],
              },
            ],
          },
        },
      ],
    },
  };
}

function creativeRow(
  overrides: { region?: Record<string, unknown>; creativeId?: string } = {}
): Record<string, unknown> {
  const region = overrides.region ?? regionCell('PL', '2025-09-10', '2026-09-02', '15000', '20000');
  return {
    f: [
      v(AR),
      v(overrides.creativeId ?? 'CR05850846188550488065'),
      v('https://adstransparency.google.com/advertiser/AR/creative/CR?region=anywhere'),
      v('VIDEO'),
      v('Home & Garden'),
      v('Laboratorium Pani Domu Sp. z o.o.'),
      {
        v: {
          f: [
            v('CRITERIA_INCLUDED'),
            v('CRITERIA_INCLUDED'),
            v('CRITERIA_UNUSED'),
            v('CRITERIA_UNUSED'),
            v('CRITERIA_UNUSED'),
          ],
        },
      },
      { v: [region] },
    ],
  };
}

function stubBigQuery(rows: readonly Record<string, unknown>[]): void {
  const bodies: Record<string, unknown>[] = [
    { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
    { jobComplete: true, totalBytesProcessed: '1234', schema: { fields: [] } },
    { jobComplete: true, schema: querySchema(), rows },
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
    if (
      query.startsWith('SELECT id, name, linkedin_url') ||
      query.startsWith('SELECT owner_kind') ||
      query.startsWith('SELECT person_id') ||
      query.startsWith('SELECT from_entity_id')
    ) {
      return { results: [] };
    }
    if (query.startsWith('INSERT INTO google_ads')) {
      return { results: [] };
    }
    if (query.startsWith('INSERT OR REPLACE INTO google_ad_days')) {
      return { results: [] };
    }
    return { results: [] };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGoogleAds', () => {
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
    await fetchGoogleAds([AR], new Map(), { keyJson, logger });
    const parts = assertion.split('.');
    expect(parts).toHaveLength(3);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    expect(verifier.verify(publicPem, b64ToBytes(parts[2] as string))).toBe(true);
  });

  it('parses a creative with the PL region entry', async () => {
    stubBigQuery([creativeRow()]);
    const { logger, records } = makeLogger();
    const deps: GoogleFetchDeps = { keyJson: makeKeyJson(), logger };
    const result = await fetchGoogleAds([AR], new Map([[AR, 'laboratoriumpanidomu']]), deps);
    expect(result.failed).toEqual([]);
    expect(result.ads).toHaveLength(1);
    const ad = result.ads[0];
    expect(ad.creativeId).toBe('CR05850846188550488065');
    expect(ad.advertiserId).toBe(AR);
    expect(ad.entityId).toBe('laboratoriumpanidomu');
    expect(ad.disclosedName).toBe('Laboratorium Pani Domu Sp. z o.o.');
    expect(ad.format).toBe('VIDEO');
    expect(ad.impLo).toBe(15000);
    expect(ad.impHi).toBe(20000);
    expect(ad.firstShown).toBe('2025-09-10');
    expect(ad.lastShown).toBe('2026-09-02');
    expect(ad.audience.geo).toBe('CRITERIA_INCLUDED');
    expect(ad.surfaces).toHaveLength(1);
    expect(ad.surfaces[0].surface).toBe('YOUTUBE');
    expect(records.some((record) => record.message === 'googleads.fetched')).toBe(true);
  });

  it('falls back to the EEA aggregate without a PL entry', async () => {
    stubBigQuery([creativeRow({ region: regionCell('EEA', '2025-09-10', '2026-09-01', '1000', '2000') })]);
    const { logger } = makeLogger();
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].impLo).toBe(1000);
    expect(result.ads[0].lastShown).toBe('2026-09-01');
  });

  it('skips a creative with no PL or EEA entry and logs the count', async () => {
    stubBigQuery([creativeRow({ region: regionCell('US', '2025-09-10', '2026-09-01', '1000', '2000') })]);
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(0);
    const fetched = records.find((record) => record.message === 'googleads.fetched');
    expect(fetched === undefined ? null : (fetched.context as { skipped?: number }).skipped).toBe(1);
  });

  it('reports bad key JSON with the log record', async () => {
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: 'not-json', logger });
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].advertiserId).toBe(AR);
    expect(result.failed[0].reason).toContain('GOOGLE_BQ_KEY');
    expect(records.some((record) => record.message === 'googleads.badKey')).toBe(true);
  });

  it('reports a key without fields with the log record', async () => {
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: '{"type":"service_account"}', logger });
    expect(result.failed).toHaveLength(1);
    expect(records.some((record) => record.message === 'googleads.badKey')).toBe(true);
  });

  it('reports a token failure with the log record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('denied', { status: 403 }))
    );
    const { logger, records } = makeLogger();
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.ads).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('token failed');
    expect(records.some((record) => record.message === 'googleads.tokenFailed')).toBe(true);
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
    const result = await fetchGoogleAds([AR], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('BigQuery HTTP 500');
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('polls an incomplete job and reads the result', async () => {
    const bodies: Record<string, unknown>[] = [
      { access_token: 'tok', expires_in: 3600 },
      { jobComplete: true, totalBytesProcessed: '10', schema: { fields: [] } },
      { jobComplete: false, jobReference: { jobId: 'job-1' } },
      { jobComplete: true, schema: querySchema(), rows: [creativeRow()] },
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
    const result = await fetchGoogleAds([AR], new Map(), {
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
    const result = await fetchGoogleAds([AR], new Map(), {
      keyJson: makeKeyJson(),
      logger,
      maxPolls: 2,
      pollDelayMs: 0,
    });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('still running');
    expect(records.some((record) => record.message === 'googleads.fetchFailed')).toBe(true);
  });

  it('returns empty without advertisers and calls no fetch', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const { logger } = makeLogger();
    const result = await fetchGoogleAds([], new Map(), { keyJson: makeKeyJson(), logger });
    expect(result).toEqual({ ads: [], failed: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('runGoogleAdsFetch', () => {
  it('writes ads and days and returns counts', async () => {
    stubBigQuery([creativeRow()]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(1);
    expect(result.daysWritten).toBe(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(true);
    expect(db.calls.some((call) => call.query.startsWith('INSERT OR REPLACE INTO google_ad_days'))).toBe(true);
  });

  it('counts ads with an old last shown date as ended', async () => {
    stubBigQuery([creativeRow({ region: regionCell('PL', '2024-01-01', '2024-02-01', '1000', '2000') })]);
    const { logger } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsFetch(storage, logger, makeKeyJson());
    expect(result.ads).toBe(1);
    expect(result.ended).toBe(1);
  });

  it('warns on a shared advertiser and keeps the first owner', async () => {
    stubBigQuery([creativeRow()]);
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
    const result = await runGoogleAdsFetch(storage, logger, makeKeyJson());
    expect(result.shops).toBe(1);
    expect(records.some((record) => record.message === 'googleads.sharedAdvertiser')).toBe(true);
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
    const result = await runGoogleAdsFetch(storage, logger, makeKeyJson());
    expect(result).toEqual({ shops: 0, ads: 0, daysWritten: 0, ended: 0, failures: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports failures without writes on a bad key', async () => {
    const { logger, records } = makeLogger();
    const db = entityStoreDb();
    const storage = createStorage(db, logger);
    const result = await runGoogleAdsFetch(storage, logger, 'not-json');
    expect(result.shops).toBe(1);
    expect(result.ads).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(db.calls.some((call) => call.query.startsWith('INSERT INTO google_ads'))).toBe(false);
    expect(records.some((record) => record.message === 'googleads.runDone')).toBe(true);
  });
});
