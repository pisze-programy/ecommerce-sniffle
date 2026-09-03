// Google Ads Transparency Center BigQuery client. See docs/GOOGLE-ADS.md.
// Queries creative_stats for the tracked advertiser ids.
// Picks the PL region entry of each creative, EEA aggregate as fallback.
// Authenticates with the service account key from the GOOGLE_BQ_KEY secret.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { GoogleAd, GoogleAudience, GoogleRunFailure, GoogleSurfaceStat } from './types.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BQ_SCOPE = 'https://www.googleapis.com/auth/bigquery';
const BQ_DATASET = 'bigquery-public-data.google_ads_transparency_center.creative_stats';
const QUERY_TIMEOUT_MS = 60000;
const POLL_DELAY_MS = 5000;
const MAX_POLLS = 12;

export interface GoogleFetchDeps {
  readonly keyJson: string;
  readonly projectId?: string;
  readonly logger: Logger;
  readonly maxPolls?: number;
  readonly pollDelayMs?: number;
}

interface KeyFile {
  readonly client_email?: unknown;
  readonly private_key?: unknown;
  readonly project_id?: unknown;
}

interface BqField {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly mode?: unknown;
  readonly fields?: readonly BqField[];
}

interface BqJob {
  readonly jobReference?: { readonly jobId?: string };
  readonly jobComplete?: boolean;
  readonly schema?: { readonly fields?: readonly BqField[] };
  readonly rows?: readonly { readonly f?: readonly { readonly v?: unknown }[] }[];
  readonly totalBytesProcessed?: string;
  readonly error?: { readonly message?: string };
}

type Json = Record<string, unknown>;

function b64urlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64url(input: string): string {
  return b64urlBytes(new TextEncoder().encode(input));
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function mintToken(email: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: email, scope: BQ_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const data = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(pem).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  const signed = `${data}.${b64urlBytes(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
    }),
  });
  if (!response.ok) {
    throw new Error(`token HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as Json;
  const token = body['access_token'];
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('token response holds no access_token');
  }
  return token;
}

function decodeValue(field: BqField, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && value !== null && 'v' in value) {
    return decodeValue(field, (value as { v?: unknown }).v);
  }
  if (field.mode === 'REPEATED' && Array.isArray(value)) {
    return value.map((entry) => decodeValue({ ...field, mode: 'NULLABLE' }, entry));
  }
  if (field.type === 'RECORD' && typeof value === 'object' && value !== null && 'f' in value) {
    const cells = (value as { f?: readonly { v?: unknown }[] }).f ?? [];
    const out: Json = {};
    const sub = field.fields ?? [];
    for (let i = 0; i < sub.length; i += 1) {
      const name = typeof sub[i]?.name === 'string' ? (sub[i]?.name as string) : `${i}`;
      out[name] = decodeValue(sub[i] ?? {}, cells[i]?.v);
    }
    return out;
  }
  return value;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function parseAudience(value: unknown): GoogleAudience {
  const row = asRecord(value);
  return {
    demographic: asString(row?.['demographic_info']),
    geo: asString(row?.['geo_location']),
    contextual: asString(row?.['contextual_signals']),
    customerLists: asString(row?.['customer_lists']),
    topics: asString(row?.['topics_of_interest']),
  };
}

function parseSurfaces(value: unknown): readonly GoogleSurfaceStat[] {
  const holder = asRecord(value);
  const stats = holder?.['surface_serving_stats'];
  if (!Array.isArray(stats)) {
    return [];
  }
  return stats.flatMap((entry) => {
    const row = asRecord(entry);
    const surface = asString(row?.['surface']);
    if (surface === null) {
      return [];
    }
    return [{ surface, lo: asInt(row?.['times_shown_lower_bound']), hi: asInt(row?.['times_shown_upper_bound']) }];
  });
}

interface RegionPick {
  readonly firstShown: string | null;
  readonly lastShown: string | null;
  readonly lo: number | null;
  readonly hi: number | null;
  readonly surfaces: readonly GoogleSurfaceStat[];
}

function pickRegion(regions: unknown): RegionPick | null {
  if (!Array.isArray(regions)) {
    return null;
  }
  const rows = regions.flatMap((entry) => (asRecord(entry) === null ? [] : [asRecord(entry) as Json]));
  const pl =
    rows.find((row) => row['region_code'] === 'PL') ?? rows.find((row) => row['region_code'] === 'EEA') ?? null;
  if (pl === null) {
    return null;
  }
  return {
    firstShown: asString(pl['first_shown']),
    lastShown: asString(pl['last_shown']),
    lo: asInt(pl['times_shown_lower_bound']),
    hi: asInt(pl['times_shown_upper_bound']),
    surfaces: parseSurfaces(pl['surface_serving_stats']),
  };
}

function parseAd(row: Json, entityId: string | null): GoogleAd | null {
  const creativeId = asString(row['creative_id']);
  const advertiserId = asString(row['advertiser_id']);
  if (creativeId === null || advertiserId === null) {
    return null;
  }
  const region = pickRegion(row['region_stats']);
  if (region === null) {
    return null;
  }
  return {
    creativeId,
    advertiserId,
    entityId,
    disclosedName: asString(row['advertiser_disclosed_name']),
    format: asString(row['ad_format_type']),
    topic: asString(row['topic']),
    pageUrl: asString(row['creative_page_url']),
    firstShown: region.firstShown,
    lastShown: region.lastShown,
    impLo: region.lo,
    impHi: region.hi,
    audience: parseAudience(row['audience_selection_approach_info']),
    surfaces: region.surfaces,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQuery(project: string, token: string, sql: string, dryRun: boolean): Promise<BqJob> {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, dryRun, maxResults: 20000, timeoutMs: QUERY_TIMEOUT_MS }),
  });
  if (!response.ok) {
    throw new Error(`BigQuery HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as BqJob;
}

async function awaitJob(
  project: string,
  token: string,
  jobId: string,
  logger: Logger,
  maxPolls: number,
  pollDelayMs: number
): Promise<BqJob> {
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    await sleep(pollDelayMs);
    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${jobId}?location=US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new Error(`BigQuery poll HTTP ${response.status}`);
    }
    const job = (await response.json()) as BqJob;
    if (job.jobComplete === true) {
      return job;
    }
    logger.info('googleads.pollWait', { attempt, jobId });
  }
  throw new Error(`query ${jobId} still running after ${maxPolls} polls`);
}

function buildSql(advertiserIds: readonly string[]): string {
  const list = advertiserIds.map((id) => `'${id.replace(/'/g, '')}'`).join(',');
  return `SELECT advertiser_id, creative_id, creative_page_url, ad_format_type, topic, advertiser_disclosed_name, audience_selection_approach_info, region_stats FROM \`${BQ_DATASET}\` WHERE advertiser_id IN (${list})`;
}

// Fetches all creatives of the tracked advertisers from creative_stats.
// Returns one row per creative with the PL region entry (EEA fallback).
export async function fetchGoogleAds(
  advertiserIds: readonly string[],
  entityIds: ReadonlyMap<string, string>,
  deps: GoogleFetchDeps
): Promise<{ readonly ads: readonly GoogleAd[]; readonly failed: readonly GoogleRunFailure[] }> {
  if (advertiserIds.length === 0) {
    return { ads: [], failed: [] };
  }
  let key: KeyFile;
  try {
    key = JSON.parse(deps.keyJson) as KeyFile;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.badKey', { error: message });
    return {
      ads: [],
      failed: advertiserIds.map((advertiserId) => ({ advertiserId, reason: 'GOOGLE_BQ_KEY is not JSON' })),
    };
  }
  const email = typeof key.client_email === 'string' ? key.client_email : '';
  const pem = typeof key.private_key === 'string' ? key.private_key : '';
  const project =
    deps.projectId ?? (typeof key.project_id === 'string' && key.project_id.length > 0 ? key.project_id : '');
  if (email.length === 0 || pem.length === 0 || project.length === 0) {
    deps.logger.error('googleads.badKey', { reason: 'key holds no client_email, private_key, or project_id' });
    return {
      ads: [],
      failed: advertiserIds.map((advertiserId) => ({ advertiserId, reason: 'GOOGLE_BQ_KEY misses fields' })),
    };
  }
  const failAll = (reason: string): readonly GoogleRunFailure[] =>
    advertiserIds.map((advertiserId) => ({ advertiserId, reason }));
  let token: string;
  try {
    token = await mintToken(email, pem);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.tokenFailed', { error: message });
    return { ads: [], failed: failAll(`token failed: ${message}`) };
  }
  const sql = buildSql(advertiserIds);
  try {
    const dry = await runQuery(project, token, sql, true);
    deps.logger.info('googleads.queryPlanned', {
      advertisers: advertiserIds.length,
      bytes: dry.totalBytesProcessed ?? '0',
    });
    let job = await runQuery(project, token, sql, false);
    if (job.jobComplete !== true) {
      const jobId = job.jobReference?.jobId ?? '';
      if (jobId.length === 0) {
        throw new Error('query returned no job id');
      }
      job = await awaitJob(
        project,
        token,
        jobId,
        deps.logger,
        deps.maxPolls ?? MAX_POLLS,
        deps.pollDelayMs ?? POLL_DELAY_MS
      );
    }
    if (job.error !== undefined) {
      throw new Error(job.error.message ?? 'query failed');
    }
    const fields = job.schema?.fields ?? [];
    const ads: GoogleAd[] = [];
    let skipped = 0;
    for (const line of job.rows ?? []) {
      const row: Json = {};
      const cells = line.f ?? [];
      for (let i = 0; i < fields.length; i += 1) {
        const name = typeof fields[i]?.name === 'string' ? (fields[i]?.name as string) : `${i}`;
        row[name] = decodeValue(fields[i] ?? {}, cells[i]?.v);
      }
      const advertiserId = asString(row['advertiser_id']);
      const ad = parseAd(row, advertiserId === null ? null : (entityIds.get(advertiserId) ?? null));
      if (ad === null) {
        skipped += 1;
        continue;
      }
      ads.push(ad);
    }
    deps.logger.info('googleads.fetched', { advertisers: advertiserIds.length, ads: ads.length, skipped });
    return { ads, failed: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.fetchFailed', { error: message });
    return { ads: [], failed: failAll(message) };
  }
}
