// Parsing of the decoded BigQuery rows into the Google ads model.
// See docs/GOOGLE-ADS.md for the column audit.

import type { GoogleAdCore, GoogleAdStatic, GoogleAdSurfaces, GoogleSurfaceStat } from './types.ts';
import { sanitizeBounds } from './estimate.ts';
import { asInt, asRecord, asString, toRecords } from '../bigquery/values.ts';
import type { JsonRecord } from '../bigquery/values.ts';

// Picks the PL entry of a creative, the EEA aggregate as fallback.
function pickRegion(regions: unknown): JsonRecord | null {
  const rows = toRecords(regions);
  const pl = rows.find((row) => row['region_code'] === 'PL');
  if (pl !== undefined) {
    return pl;
  }
  const eea = rows.find((row) => row['region_code'] === 'EEA');
  return eea === undefined ? null : eea;
}

function parseSurfaces(value: unknown): readonly GoogleSurfaceStat[] {
  const holder = asRecord(value);
  const stats = holder === null ? null : holder['surface_serving_stats'];
  if (!Array.isArray(stats)) {
    return [];
  }
  return stats.flatMap((entry) => {
    const row = asRecord(entry);
    const surface = row === null ? null : asString(row['surface']);
    if (row === null || surface === null) {
      return [];
    }
    return [{ surface, lo: asInt(row['times_shown_lower_bound']), hi: asInt(row['times_shown_upper_bound']) }];
  });
}

export interface ParsedCore {
  readonly ad: GoogleAdCore;
  readonly capped: boolean;
}

export function parseCoreAd(row: JsonRecord, entityId: string | null): ParsedCore | null {
  const creativeId = asString(row['creative_id']);
  const advertiserId = asString(row['advertiser_id']);
  if (creativeId === null || advertiserId === null) {
    return null;
  }
  const region = pickRegion(row['region_stats']);
  if (region === null) {
    return null;
  }
  const rawLo = asInt(region['times_shown_lower_bound']);
  const rawHi = asInt(region['times_shown_upper_bound']);
  const bounds = sanitizeBounds(rawLo, rawHi);
  const capped = bounds.lo === null && bounds.hi === null && (rawLo !== null || rawHi !== null);
  return {
    ad: {
      creativeId,
      advertiserId,
      entityId,
      lastShown: asString(region['last_shown']),
      impLo: bounds.lo,
      impHi: bounds.hi,
    },
    capped,
  };
}

export function parseStaticAd(row: JsonRecord, entityId: string | null): GoogleAdStatic | null {
  const creativeId = asString(row['creative_id']);
  const advertiserId = asString(row['advertiser_id']);
  if (creativeId === null || advertiserId === null) {
    return null;
  }
  const region = pickRegion(row['region_stats']);
  return {
    creativeId,
    advertiserId,
    entityId,
    firstShown: region === null ? null : asString(region['first_shown']),
    format: asString(row['ad_format_type']),
    topic: asString(row['topic']),
  };
}

export function parseSurfacesAd(row: JsonRecord): GoogleAdSurfaces | null {
  const creativeId = asString(row['creative_id']);
  const advertiserId = asString(row['advertiser_id']);
  if (creativeId === null || advertiserId === null) {
    return null;
  }
  const region = pickRegion(row['region_stats']);
  return {
    creativeId,
    advertiserId,
    surfaces: region === null ? [] : parseSurfaces(region['surface_serving_stats']),
  };
}
