// Runs the daily Meta ads fetch for every shop with a page id.
// Fetches active ads, stores them, writes the daily reach snapshot,
// and marks ads missing today as ended.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from '../storage.ts';
import type { MetaAd, MetaAdRunResult, MetaRunFailure } from './types.ts';
import { BATCH_SIZE, fetchActiveAds } from './fetch.ts';

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: (readonly T[])[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function runMetaAdsFetch(storage: Storage, logger: Logger, token: string): Promise<MetaAdRunResult> {
  const store = await storage.readEntityStore();
  const entityIds = new Map<string, string>();
  for (const entity of store.entities) {
    if (entity.metaPageId !== null) {
      entityIds.set(entity.metaPageId, entity.id);
    }
  }
  const pageIds = [...entityIds.keys()];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = dayBefore(today);
  const deps = { token, logger };

  const allAds: MetaAd[] = [];
  const failures: MetaRunFailure[] = [];
  for (const batch of chunk(pageIds, BATCH_SIZE)) {
    try {
      const fetched = await fetchActiveAds(batch, entityIds, deps);
      allAds.push(...fetched.ads);
      failures.push(...fetched.failed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('metaads.batchFailed', { pages: batch.length, error: message });
      for (const pageId of batch) {
        failures.push({ pageId, reason: `fetch threw: ${message}` });
      }
    }
  }

  const failedSet = new Set(failures.map((failure) => failure.pageId));
  const adsByPage = new Map<string, MetaAd[]>();
  for (const ad of allAds) {
    const list = adsByPage.get(ad.pageId);
    if (list === undefined) {
      adsByPage.set(ad.pageId, [ad]);
    } else {
      list.push(ad);
    }
  }

  let daysWritten = 0;
  let ended = 0;
  for (const [pageId, ads] of adsByPage) {
    if (failedSet.has(pageId)) {
      continue;
    }
    await storage.upsertMetaAds(ads);
    await storage.writeMetaAdDays(
      ads.map((ad) => ({
        day: today,
        adArchiveId: ad.adArchiveId,
        pageId,
        euTotalReach: ad.euTotalReach ?? 0,
      }))
    );
    daysWritten += ads.length;
    ended += await storage.endMetaAds(pageId, yesterday, today);
  }
  for (const pageId of pageIds) {
    if (adsByPage.has(pageId) || failedSet.has(pageId)) {
      continue;
    }
    ended += await storage.endMetaAds(pageId, yesterday, today);
  }

  logger.info('metaads.runDone', {
    shops: pageIds.length,
    ads: allAds.length,
    daysWritten,
    ended,
    errors: failures.length,
  });
  return { shops: pageIds.length, ads: allAds.length, daysWritten, ended, failures };
}
