// Runs the daily social fetch for every tracked IG handle.
// Manual trigger for now. The cron will reuse it later.

import { socialTargets } from '../../entities.ts';
import type { Logger } from '@ecommerce-sniffle/providers';
import type { Storage } from '../storage.ts';
import type { InstagramDeps } from './instagram.ts';
import { fetchPosts, fetchProfile, fetchStories } from './instagram.ts';
import type { SocialPost, SocialStory } from './types.ts';

// The BASIC plan allows 3 requests per minute.
const MIN_INTERVAL_MS = 21000;

export interface SocialRunResult {
  readonly targets: number;
  readonly profilesResolved: number;
  readonly posts: number;
  readonly stories: number;
  readonly mediaStored: number;
}

export interface SocialMedia {
  put(key: string, value: ArrayBuffer): Promise<unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mediaKey(handle: string, kind: 'posts' | 'stories', id: string, url: string): Promise<string> {
  let extension = 'bin';
  try {
    const last = new URL(url).pathname.split('.').pop();
    if (last !== undefined && /^[a-z0-9]{1,8}$/.test(last)) {
      extension = last;
    }
  } catch {
    extension = 'bin';
  }
  return `social/instagram/${handle}/${kind}/${id}/media-0.${extension}`;
}

export async function runSocialFetch(
  storage: Storage,
  logger: Logger,
  apiKey: string,
  media: SocialMedia | null
): Promise<SocialRunResult> {
  const store = await storage.readEntityStore();
  const targets = socialTargets(store);
  const profiles = await storage.readSocialProfiles();
  const userIdByHandle = new Map(profiles.map((profile) => [profile.handle, profile.userId]));
  const deps: InstagramDeps = { apiKey, logger };
  let profilesResolved = 0;
  let postsCount = 0;
  let storiesCount = 0;
  let mediaStored = 0;
  let lastCall = 0;
  const throttled = async (task: () => Promise<void>): Promise<void> => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastCall = Date.now();
    await task();
  };

  for (const target of targets) {
    if (userIdByHandle.get(target.handle) === undefined) {
      await throttled(async () => {
        const profile = await fetchProfile(target.handle, deps);
        if (profile !== null) {
          await storage.upsertSocialProfile(profile);
          userIdByHandle.set(profile.handle, profile.userId);
          profilesResolved += 1;
        }
      });
    }
    const userId = userIdByHandle.get(target.handle);
    if (userId === undefined) {
      continue;
    }

    const posts: SocialPost[] = [];
    await throttled(async () => {
      posts.push(...(await fetchPosts(userId, deps)));
    });
    const stories: SocialStory[] = [];
    await throttled(async () => {
      stories.push(...(await fetchStories(userId, deps)));
    });
    postsCount += posts.length;
    storiesCount += stories.length;

    const postsWithMedia: SocialPost[] = [];
    for (const post of posts) {
      const url = post.mediaUrls[0];
      if (media !== null && url !== undefined) {
        const key = await mediaKey(target.handle, 'posts', post.id, url);
        const stored = await storeMedia(media, logger, key, url);
        if (stored) {
          mediaStored += 1;
          postsWithMedia.push({ ...post, r2Key: key });
          continue;
        }
      }
      postsWithMedia.push(post);
    }
    await storage.writeSocialPosts(postsWithMedia);

    const storiesWithMedia: SocialStory[] = [];
    for (const story of stories) {
      const url = story.mediaUrls[0];
      if (media !== null && url !== undefined) {
        const key = await mediaKey(target.handle, 'stories', story.id, url);
        const stored = await storeMedia(media, logger, key, url);
        if (stored) {
          mediaStored += 1;
          storiesWithMedia.push({ ...story, r2Key: key });
          continue;
        }
      }
      storiesWithMedia.push(story);
    }
    await storage.writeSocialStories(storiesWithMedia);
  }

  return { targets: targets.length, profilesResolved, posts: postsCount, stories: storiesCount, mediaStored };
}

async function storeMedia(media: SocialMedia, logger: Logger, key: string, url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('social.media.httpFailed', { key, status: response.status });
      return false;
    }
    await media.put(key, await response.arrayBuffer());
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('social.media.downloadFailed', { key, error: message });
    return false;
  }
}
