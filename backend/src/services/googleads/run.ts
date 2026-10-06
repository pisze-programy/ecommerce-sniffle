// Runs the Google ads fetch in three jobs. See docs/GOOGLE-ADS.md.
// The core job runs every day and stores the impression bounds and the
// last shown date. The static job runs once a week and stores the format,
// the topic and the first shown date. The surfaces job runs once a month
// and stores the per-platform split. The column audit is in the docs.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from '../storage.ts';
import type {
  GoogleAdCore,
  GoogleAdStatic,
  GoogleAdSurfaces,
  GoogleAdRunResult,
  GoogleSyncRunResult,
  GoogleRunFailure,
} from './types.ts';
import { fetchGoogleAdsCore, fetchGoogleAdsStatic, fetchGoogleAdsSurfaces } from './fetch.ts';

export const ACTIVE_WINDOW_DAYS = 7;

function dayBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

interface AdvertiserMap {
  readonly entityIds: Map<string, string>;
  readonly advertiserIds: readonly string[];
}

async function readAdvertiserMap(storage: Storage, logger: Logger): Promise<AdvertiserMap> {
  const store = await storage.readEntityStore();
  const entityIds = new Map<string, string>();
  for (const entity of store.entities) {
    if (entity.googleAdvertiserId === null) {
      continue;
    }
    const owner = entityIds.get(entity.googleAdvertiserId);
    if (owner !== undefined && owner !== entity.id) {
      logger.warn('googleads.sharedAdvertiser', { advertiserId: entity.googleAdvertiserId, owner, other: entity.id });
      continue;
    }
    entityIds.set(entity.googleAdvertiserId, entity.id);
  }
  return { entityIds, advertiserIds: [...entityIds.keys()] };
}

function groupByAdvertiser<T extends { readonly advertiserId: string }>(rows: readonly T[]): Map<string, T[]> {
  const byAdvertiser = new Map<string, T[]>();
  for (const row of rows) {
    const list = byAdvertiser.get(row.advertiserId);
    if (list === undefined) {
      byAdvertiser.set(row.advertiserId, [row]);
    } else {
      list.push(row);
    }
  }
  return byAdvertiser;
}

// Daily job. Reads the changing fields only: region code, last shown, bounds.
export async function runGoogleAdsCoreFetch(
  storage: Storage,
  logger: Logger,
  keyJson: string,
  projectId?: string
): Promise<GoogleAdRunResult> {
  const { entityIds, advertiserIds } = await readAdvertiserMap(storage, logger);
  const today = new Date().toISOString().slice(0, 10);
  const activeSince = dayBefore(today, ACTIVE_WINDOW_DAYS);
  const failures: GoogleRunFailure[] = [];
  let allAds: readonly GoogleAdCore[] = [];
  let capped = 0;
  const fetched =
    projectId === undefined
      ? await fetchGoogleAdsCore(advertiserIds, entityIds, { keyJson, logger })
      : await fetchGoogleAdsCore(advertiserIds, entityIds, { keyJson, projectId, logger });
  allAds = fetched.ads;
  failures.push(...fetched.failed);
  capped = fetched.capped;

  const failedSet = new Set(failures.map((failure) => failure.advertiserId));
  const adsByPage = groupByAdvertiser(allAds);

  let daysWritten = 0;
  let ended = 0;
  for (const [advertiserId, ads] of adsByPage) {
    if (failedSet.has(advertiserId)) {
      continue;
    }
    await storage.upsertGoogleAdsCore(ads);
    const dayRows = ads.flatMap((ad) =>
      ad.impLo === null || ad.impHi === null
        ? []
        : [{ day: today, creativeId: ad.creativeId, advertiserId, impLo: ad.impLo, impHi: ad.impHi }]
    );
    await storage.writeGoogleAdDays(dayRows);
    daysWritten += dayRows.length;
    ended += ads.filter((ad) => ad.lastShown !== null && ad.lastShown < activeSince).length;
  }

  logger.info('googleads.runDone', {
    mode: 'core',
    shops: advertiserIds.length,
    ads: allAds.length,
    daysWritten,
    ended,
    capped,
    errors: failures.length,
  });
  return { shops: advertiserIds.length, ads: allAds.length, daysWritten, ended, capped, failures };
}

// Weekly job. Reads the fields that do not change: format, topic, first shown.
export async function runGoogleAdsStaticFetch(
  storage: Storage,
  logger: Logger,
  keyJson: string,
  projectId?: string
): Promise<GoogleSyncRunResult> {
  const { entityIds, advertiserIds } = await readAdvertiserMap(storage, logger);
  const failures: GoogleRunFailure[] = [];
  let allAds: readonly GoogleAdStatic[] = [];
  const fetched =
    projectId === undefined
      ? await fetchGoogleAdsStatic(advertiserIds, entityIds, { keyJson, logger })
      : await fetchGoogleAdsStatic(advertiserIds, entityIds, { keyJson, projectId, logger });
  allAds = fetched.ads;
  failures.push(...fetched.failed);

  const failedSet = new Set(failures.map((failure) => failure.advertiserId));
  const adsByPage = groupByAdvertiser(allAds);
  for (const [advertiserId, ads] of adsByPage) {
    if (failedSet.has(advertiserId)) {
      continue;
    }
    await storage.upsertGoogleAdsStatic(ads);
  }

  logger.info('googleads.runDone', {
    mode: 'static',
    shops: advertiserIds.length,
    ads: allAds.length,
    errors: failures.length,
  });
  return { shops: advertiserIds.length, ads: allAds.length, failures };
}

// Monthly job. Reads the per-platform split.
export async function runGoogleAdsSurfacesFetch(
  storage: Storage,
  logger: Logger,
  keyJson: string,
  projectId?: string
): Promise<GoogleSyncRunResult> {
  const { advertiserIds } = await readAdvertiserMap(storage, logger);
  const failures: GoogleRunFailure[] = [];
  let allAds: readonly GoogleAdSurfaces[] = [];
  const fetched =
    projectId === undefined
      ? await fetchGoogleAdsSurfaces(advertiserIds, { keyJson, logger })
      : await fetchGoogleAdsSurfaces(advertiserIds, { keyJson, projectId, logger });
  allAds = fetched.ads;
  failures.push(...fetched.failed);

  const failedSet = new Set(failures.map((failure) => failure.advertiserId));
  const adsByPage = groupByAdvertiser(allAds);
  for (const [advertiserId, ads] of adsByPage) {
    if (failedSet.has(advertiserId)) {
      continue;
    }
    await storage.updateGoogleAdsSurfaces(ads);
  }

  logger.info('googleads.runDone', {
    mode: 'surfaces',
    shops: advertiserIds.length,
    ads: allAds.length,
    errors: failures.length,
  });
  return { shops: advertiserIds.length, ads: allAds.length, failures };
}
