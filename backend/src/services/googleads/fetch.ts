// Google ads BigQuery fetch. See docs/GOOGLE-ADS.md.
// The data is split by change rate to keep the scan small:
//   core     - region code, last shown, impression bounds. Runs every day.
//   static   - format, topic, first shown. Runs once a week.
//   surfaces - per-platform split. Runs once a month.
// Auth and query execution live in services/bigquery.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { GoogleAdCore, GoogleAdStatic, GoogleAdSurfaces, GoogleRunFailure } from './types.ts';
import { prepareAuth } from '../bigquery/auth.ts';
import { decodeRow, runQueryAll } from '../bigquery/client.ts';
import type { BqPollOptions } from '../bigquery/client.ts';
import { asString } from '../bigquery/values.ts';
import type { JsonRecord } from '../bigquery/values.ts';
import { buildSql } from './sql.ts';
import type { GoogleFetchMode } from './sql.ts';
import { parseCoreAd, parseStaticAd, parseSurfacesAd } from './parse.ts';

export type { GoogleFetchMode } from './sql.ts';

export interface GoogleFetchDeps extends BqPollOptions {
  readonly keyJson: string;
  readonly projectId?: string;
  readonly logger: Logger;
}

export interface GoogleCoreResult {
  readonly ads: readonly GoogleAdCore[];
  readonly failed: readonly GoogleRunFailure[];
  readonly capped: number;
}

export interface GoogleStaticResult {
  readonly ads: readonly GoogleAdStatic[];
  readonly failed: readonly GoogleRunFailure[];
}

export interface GoogleSurfacesResult {
  readonly ads: readonly GoogleAdSurfaces[];
  readonly failed: readonly GoogleRunFailure[];
}

function failAll(advertiserIds: readonly string[], reason: string): readonly GoogleRunFailure[] {
  return advertiserIds.map((advertiserId) => ({ advertiserId, reason }));
}

async function fetchRows(
  mode: GoogleFetchMode,
  advertiserIds: readonly string[],
  deps: GoogleFetchDeps
): Promise<readonly JsonRecord[]> {
  const auth = await prepareAuth(deps.keyJson, deps.projectId, deps.logger);
  const job = await runQueryAll(auth.project, auth.token, buildSql(mode, advertiserIds), deps.logger, deps, mode);
  deps.logger.info('googleads.bytesProcessed', {
    mode,
    bytes: job.totalBytesProcessed === undefined ? '0' : job.totalBytesProcessed,
    rows: job.rows === undefined ? 0 : job.rows.length,
  });
  const fields = job.schema === undefined || job.schema.fields === undefined ? [] : job.schema.fields;
  const rows = job.rows === undefined ? [] : job.rows;
  return rows.map((line) => decodeRow(fields, line));
}

function resolveEntity(row: JsonRecord, entityIds: ReadonlyMap<string, string>): string | null {
  const advertiserId = asString(row['advertiser_id']);
  if (advertiserId === null) {
    return null;
  }
  const owner = entityIds.get(advertiserId);
  return owner === undefined ? null : owner;
}

export async function fetchGoogleAdsCore(
  advertiserIds: readonly string[],
  entityIds: ReadonlyMap<string, string>,
  deps: GoogleFetchDeps
): Promise<GoogleCoreResult> {
  if (advertiserIds.length === 0) {
    return { ads: [], failed: [], capped: 0 };
  }
  let rows: readonly JsonRecord[];
  try {
    rows = await fetchRows('core', advertiserIds, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.fetchFailed', { mode: 'core', error: message });
    return { ads: [], failed: failAll(advertiserIds, message), capped: 0 };
  }
  const ads: GoogleAdCore[] = [];
  let skipped = 0;
  let capped = 0;
  for (const row of rows) {
    const parsed = parseCoreAd(row, resolveEntity(row, entityIds));
    if (parsed === null) {
      skipped += 1;
      continue;
    }
    if (parsed.capped) {
      capped += 1;
    }
    ads.push(parsed.ad);
  }
  deps.logger.info('googleads.fetched', { mode: 'core', advertisers: advertiserIds.length, ads: ads.length, skipped });
  if (capped > 0) {
    deps.logger.warn('googleads.boundsCapped', { mode: 'core', creatives: capped });
  }
  return { ads, failed: [], capped };
}

export async function fetchGoogleAdsStatic(
  advertiserIds: readonly string[],
  entityIds: ReadonlyMap<string, string>,
  deps: GoogleFetchDeps
): Promise<GoogleStaticResult> {
  if (advertiserIds.length === 0) {
    return { ads: [], failed: [] };
  }
  let rows: readonly JsonRecord[];
  try {
    rows = await fetchRows('static', advertiserIds, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.fetchFailed', { mode: 'static', error: message });
    return { ads: [], failed: failAll(advertiserIds, message) };
  }
  const ads: GoogleAdStatic[] = [];
  for (const row of rows) {
    const parsed = parseStaticAd(row, resolveEntity(row, entityIds));
    if (parsed !== null) {
      ads.push(parsed);
    }
  }
  deps.logger.info('googleads.fetched', { mode: 'static', advertisers: advertiserIds.length, ads: ads.length });
  return { ads, failed: [] };
}

export async function fetchGoogleAdsSurfaces(
  advertiserIds: readonly string[],
  deps: GoogleFetchDeps
): Promise<GoogleSurfacesResult> {
  if (advertiserIds.length === 0) {
    return { ads: [], failed: [] };
  }
  let rows: readonly JsonRecord[];
  try {
    rows = await fetchRows('surfaces', advertiserIds, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('googleads.fetchFailed', { mode: 'surfaces', error: message });
    return { ads: [], failed: failAll(advertiserIds, message) };
  }
  const ads: GoogleAdSurfaces[] = [];
  for (const row of rows) {
    const parsed = parseSurfacesAd(row);
    if (parsed !== null) {
      ads.push(parsed);
    }
  }
  deps.logger.info('googleads.fetched', { mode: 'surfaces', advertisers: advertiserIds.length, ads: ads.length });
  return { ads, failed: [] };
}
