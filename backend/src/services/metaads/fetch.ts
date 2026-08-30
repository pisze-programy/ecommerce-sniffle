// Meta Ad Library API client. See docs/META-ADS.md.
// GET /ads_archive on graph.facebook.com, version v26.0.
// Batches up to ten page ids per call.
// Follows pagination until the data is empty.
// Retries rate limit errors (code 613) with backoff.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { MetaAd, MetaRunFailure, ReachLocation, ReachRow, TargetLocation, BeneficiaryPayer } from './types.ts';

const GRAPH_HOST = 'https://graph.facebook.com/v26.0/ads_archive';

// The verified field list. See docs/META-ADS.md.
const FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_creation_time',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_captions',
  'ad_creative_link_descriptions',
  'publisher_platforms',
  'languages',
  'eu_total_reach',
  'total_reach_by_location',
  'age_country_gender_reach_breakdown',
  'target_ages',
  'target_gender',
  'target_locations',
  'beneficiary_payers',
].join(',');

// A batch holds at most ten page ids. The API rejects more.
export const BATCH_SIZE = 10;
// One batch must not paginate forever. 40 pages at limit 250 means 10k ads.
const MAX_PAGES_PER_BATCH = 40;
// A short pause keeps the request rate gentle. It does not count as CPU.
const PAGE_DELAY_MS = 300;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

export interface MetaFetchDeps {
  readonly token: string;
  readonly logger: Logger;
  readonly maxPages?: number;
}

type Json = Record<string, unknown>;

function asStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asReachLocations(value: unknown): readonly ReachLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Json;
    const key = asString(row['key']);
    const num = asNumber(row['value']);
    if (key === null || num === null) {
      return [];
    }
    return [{ key, value: num }];
  });
}

function asReachBreakdown(value: unknown): readonly ReachRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Json;
    const country = asString(row['country']);
    const raw = row['age_gender_breakdowns'];
    if (country === null || !Array.isArray(raw)) {
      return [];
    }
    const breakdowns = raw.flatMap((band) => {
      if (typeof band !== 'object' || band === null) {
        return [];
      }
      const b = band as Json;
      const age = asString(b['age_range']);
      if (age === null) {
        return [];
      }
      return [
        {
          age_range: age,
          male: asNumber(b['male']) ?? 0,
          female: asNumber(b['female']) ?? 0,
          unknown: asNumber(b['unknown']) ?? 0,
        },
      ];
    });
    return [{ country, age_gender_breakdowns: breakdowns }];
  });
}

function asTargetLocations(value: unknown): readonly TargetLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Json;
    const name = asString(row['name']);
    const type = asString(row['type']);
    if (name === null || type === null) {
      return [];
    }
    return [
      {
        name,
        type,
        num_obfuscated: asNumber(row['num_obfuscated']) ?? 0,
        excluded: row['excluded'] === true,
      },
    ];
  });
}

function asBeneficiaries(value: unknown): readonly BeneficiaryPayer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Json;
    const payer = asString(row['payer']);
    const beneficiary = asString(row['beneficiary']);
    if (payer === null || beneficiary === null) {
      return [];
    }
    return [{ payer, beneficiary, current: row['current'] === true }];
  });
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function creativeHash(ad: Json): string {
  const body = asStringList(ad['ad_creative_bodies']).join(' ');
  const title = asStringList(ad['ad_creative_link_titles']).join(' ');
  return fnv1a(`${body} ${title}`.trim());
}

function parseAd(row: Json, pageId: string, entityId: string | null): MetaAd | null {
  const id = asString(row['id']);
  if (id === null) {
    return null;
  }
  return {
    adArchiveId: id,
    pageId,
    entityId,
    adCreationTime: asString(row['ad_creation_time']),
    startDate: asString(row['ad_delivery_start_time']),
    stopDate: asString(row['ad_delivery_stop_time']),
    creativeBody: asStringList(row['ad_creative_bodies']),
    linkTitle: asStringList(row['ad_creative_link_titles']),
    linkCaption: asStringList(row['ad_creative_link_captions']),
    linkDescription: asStringList(row['ad_creative_link_descriptions']),
    publisherPlatforms: asStringList(row['publisher_platforms']),
    languages: asStringList(row['languages']),
    euTotalReach: asNumber(row['eu_total_reach']),
    reachByLocation: asReachLocations(row['total_reach_by_location']),
    reachBreakdown: asReachBreakdown(row['age_country_gender_reach_breakdown']),
    targetAges: asStringList(row['target_ages']),
    targetGender: asString(row['target_gender']),
    targetLocations: asTargetLocations(row['target_locations']),
    beneficiaryPayers: asBeneficiaries(row['beneficiary_payers']),
    creativeHash: creativeHash(row),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPage(url: string, deps: MetaFetchDeps, attempt: number): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': 'ecommerce-sniffle/1.0' } });
  if (response.status === 429 || response.status === 400) {
    const body = await response.clone().text();
    let code = 0;
    try {
      const parsed = JSON.parse(body) as Json;
      const error = parsed['error'] as Json | undefined;
      code = typeof error?.['code'] === 'number' ? (error['code'] as number) : 0;
    } catch {
      code = 0;
    }
    if (code === 613 && attempt < MAX_ATTEMPTS) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      deps.logger.warn('metaads.rateLimited', { attempt, delay });
      await sleep(delay);
      return getPage(url, deps, attempt + 1);
    }
  }
  return response;
}

function failAll(pageIds: readonly string[], reason: string): readonly MetaRunFailure[] {
  return pageIds.map((pageId) => ({ pageId, reason }));
}

// Fetches all active ads for a batch of page ids.
// One call carries up to ten page ids.
// `failed` lists the page ids whose fetch did not complete and the reason.
export async function fetchActiveAds(
  pageIds: readonly string[],
  entityIds: ReadonlyMap<string, string>,
  deps: MetaFetchDeps
): Promise<{ readonly ads: readonly MetaAd[]; readonly failed: readonly MetaRunFailure[] }> {
  if (pageIds.length === 0) {
    return { ads: [], failed: [] };
  }
  const params = new URLSearchParams({
    access_token: deps.token,
    ad_reached_countries: "['PL']",
    ad_active_status: 'ACTIVE',
    limit: '250',
    fields: FIELDS,
  });
  params.set('search_page_ids', `[${pageIds.join(',')}]`);
  let url = `${GRAPH_HOST}?${params.toString()}`;
  const result: MetaAd[] = [];
  const maxPages = deps.maxPages ?? MAX_PAGES_PER_BATCH;
  let pages = 0;
  while (url.length > 0) {
    pages += 1;
    if (pages > maxPages) {
      const reason = `page cap exceeded (${maxPages})`;
      deps.logger.error('metaads.pageCap', { pages: maxPages, reason });
      return { ads: [], failed: failAll(pageIds, reason) };
    }
    if (pages > 1) {
      await sleep(PAGE_DELAY_MS);
    }
    let response: Response;
    try {
      response = await getPage(url, deps, 1);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = `fetch threw: ${message}`;
      deps.logger.error('metaads.fetchThrew', { reason });
      return { ads: [], failed: failAll(pageIds, reason) };
    }
    if (!response.ok) {
      const message = await response.text();
      const reason = `HTTP ${response.status}: ${message.slice(0, 200)}`;
      deps.logger.error('metaads.fetchFailed', { reason });
      return { ads: [], failed: failAll(pageIds, reason) };
    }
    let json: Json;
    try {
      json = (await response.json()) as Json;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = `invalid json: ${message}`;
      deps.logger.error('metaads.invalidJson', { reason });
      return { ads: [], failed: failAll(pageIds, reason) };
    }
    const error = json['error'] as Json | undefined;
    if (error !== undefined) {
      const message = asString(error['message']) ?? 'unknown';
      const code = asNumber(error['code']);
      const reason = code === null ? message : `code ${code}: ${message}`;
      deps.logger.error('metaads.apiError', { code, message });
      return { ads: [], failed: failAll(pageIds, reason) };
    }
    const data = json['data'];
    if (Array.isArray(data)) {
      for (const row of data) {
        if (typeof row !== 'object' || row === null) {
          continue;
        }
        const rowJson = row as Json;
        const pageId = asString(rowJson['page_id']);
        if (pageId === null) {
          continue;
        }
        const entityId = entityIds.get(pageId) ?? null;
        const ad = parseAd(rowJson, pageId, entityId);
        if (ad !== null) {
          result.push(ad);
        }
      }
    }
    const paging = json['paging'] as Json | undefined;
    url = asString(paging?.['next']) ?? '';
    if (Array.isArray(data) && data.length === 0) {
      break;
    }
  }
  deps.logger.info('metaads.batchFetched', { pageIds: pageIds.length, pages, ads: result.length });
  return { ads: result, failed: [] };
}
