// Runs the daily Google ads fetch for every shop with an advertiser id.
// Fetches all creatives from BigQuery, stores them, writes the daily
// impression snapshot. An ad counts as ended when its last shown date
// falls more than seven days behind today.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from '../storage.ts';
import type { GoogleAd, GoogleAdRunResult, GoogleRunFailure } from './types.ts';
import { fetchGoogleAds } from './fetch.ts';

export const ACTIVE_WINDOW_DAYS = 7;

function dayBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function runGoogleAdsFetch(
  storage: Storage,
  logger: Logger,
  keyJson: string,
  projectId?: string
): Promise<GoogleAdRunResult> {
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
  const advertiserIds = [...entityIds.keys()];
  const today = new Date().toISOString().slice(0, 10);
  const activeSince = dayBefore(today, ACTIVE_WINDOW_DAYS);
  const failures: GoogleRunFailure[] = [];
  let allAds: readonly GoogleAd[] = [];
  try {
    const fetched =
      projectId === undefined
        ? await fetchGoogleAds(advertiserIds, entityIds, { keyJson, logger })
        : await fetchGoogleAds(advertiserIds, entityIds, { keyJson, projectId, logger });
    allAds = fetched.ads;
    failures.push(...fetched.failed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('googleads.runThrew', { error: message });
    for (const advertiserId of advertiserIds) {
      failures.push({ advertiserId, reason: `fetch threw: ${message}` });
    }
  }

  const failedSet = new Set(failures.map((failure) => failure.advertiserId));
  const adsByPage = new Map<string, GoogleAd[]>();
  for (const ad of allAds) {
    const list = adsByPage.get(ad.advertiserId);
    if (list === undefined) {
      adsByPage.set(ad.advertiserId, [ad]);
    } else {
      list.push(ad);
    }
  }

  let daysWritten = 0;
  let ended = 0;
  for (const [advertiserId, ads] of adsByPage) {
    if (failedSet.has(advertiserId)) {
      continue;
    }
    await storage.upsertGoogleAds(ads);
    await storage.writeGoogleAdDays(
      ads.map((ad) => ({
        day: today,
        creativeId: ad.creativeId,
        advertiserId,
        impLo: ad.impLo ?? 0,
        impHi: ad.impHi ?? 0,
      }))
    );
    daysWritten += ads.length;
    ended += ads.filter((ad) => ad.lastShown !== null && ad.lastShown < activeSince).length;
  }

  logger.info('googleads.runDone', {
    shops: advertiserIds.length,
    ads: allAds.length,
    daysWritten,
    ended,
    errors: failures.length,
  });
  return { shops: advertiserIds.length, ads: allAds.length, daysWritten, ended, failures };
}
