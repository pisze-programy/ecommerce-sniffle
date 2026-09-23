// Apply a collected social payload to the storage. See docs/INSTAGRAM.md.
// The VPS collects. The worker stores the rows and the poster images.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { SocialPayload, SocialPost, SocialReel, SocialStory } from '@ecommerce-sniffle/providers/social';
import type { Storage } from '../storage.ts';

export interface SocialMedia {
  put(key: string, value: ArrayBuffer): Promise<unknown>;
}

export interface ApplyResult {
  readonly profiles: number;
  readonly profileDays: number;
  readonly posts: number;
  readonly stories: number;
  readonly reels: number;
  readonly mediaStored: number;
}

function mediaKey(userId: string, kind: 'posts' | 'stories' | 'reels', id: string): string {
  return `social/instagram/${userId}/${kind}/${id}/poster.jpg`;
}

async function storePoster(
  media: SocialMedia | null,
  logger: Logger,
  userId: string,
  kind: 'posts' | 'stories' | 'reels',
  id: string,
  url: string | null
): Promise<string | null> {
  if (media === null || url === null || url.length === 0) {
    return null;
  }
  const key = mediaKey(userId, kind, id);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('social.media.httpFailed', { key, status: response.status });
      return null;
    }
    await media.put(key, await response.arrayBuffer());
    return key;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('social.media.downloadFailed', { key, error: message });
    return null;
  }
}

export async function applySocialPayload(
  storage: Storage,
  logger: Logger,
  payload: SocialPayload,
  media: SocialMedia | null
): Promise<ApplyResult> {
  let mediaStored = 0;

  for (const profile of payload.profiles) {
    await storage.upsertSocialProfile(profile);
  }
  await storage.writeSocialProfileDays(payload.profileDays);

  const posts: SocialPost[] = [];
  for (const post of payload.posts) {
    const r2Key = await storePoster(media, logger, post.userId, 'posts', post.id, post.posterUrl);
    if (r2Key !== null) {
      mediaStored += 1;
    }
    posts.push({ ...post, r2Key });
  }
  await storage.writeSocialPosts(posts);

  const stories: SocialStory[] = [];
  for (const story of payload.stories) {
    const r2Key = await storePoster(media, logger, story.userId, 'stories', story.id, story.posterUrl);
    if (r2Key !== null) {
      mediaStored += 1;
    }
    stories.push({ ...story, r2Key });
  }
  await storage.writeSocialStories(stories);

  const reels: SocialReel[] = [];
  for (const reel of payload.reels) {
    const r2Key = await storePoster(media, logger, reel.userId, 'reels', reel.id, reel.posterUrl);
    if (r2Key !== null) {
      mediaStored += 1;
    }
    reels.push({ ...reel, r2Key });
  }
  await storage.writeSocialReels(reels);

  return {
    profiles: payload.profiles.length,
    profileDays: payload.profileDays.length,
    posts: posts.length,
    stories: stories.length,
    reels: reels.length,
    mediaStored,
  };
}
