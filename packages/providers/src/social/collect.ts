// Collect the Instagram data for the tracked handles. See docs/INSTAGRAM.md.
// The VPS runs this. The worker stores the result.

import type { Logger } from '../logger.ts';
import {
  inflactAnalytics,
  inflactPosts,
  inflactReels,
  inflactStories,
  inflactStoriesCheck,
  initInflact,
} from './inflact.ts';
import type { InflactSession } from './inflact.ts';
import type {
  SocialPayload,
  SocialPost,
  SocialProfile,
  SocialProfileDay,
  SocialReel,
  SocialStory,
  SocialTarget,
} from './types.ts';

const DEFAULT_ROTATE_EVERY = 25;
const POST_PAGE_LIMIT = 40;

export interface CollectOptions {
  readonly logger: Logger;
  readonly secret?: string;
  readonly rotateEvery?: number;
}

interface HandleResult {
  readonly profile: SocialProfile | null;
  readonly profileDay: SocialProfileDay | null;
  readonly posts: readonly SocialPost[];
  readonly stories: readonly SocialStory[];
  readonly reels: readonly SocialReel[];
}

function isoFromEpoch(seconds: number): string {
  return new Date((seconds > 0 ? seconds : 0) * 1000).toISOString();
}

function dayFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function dayStartEpoch(day: string | null): number | null {
  if (day === null) {
    return null;
  }
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function postType(typename: string): 'photo' | 'video' | 'carousel' {
  if (typename === 'GraphVideo') {
    return 'video';
  }
  if (typename === 'GraphSidecar') {
    return 'carousel';
  }
  return 'photo';
}

function floorEpoch(target: SocialTarget): number | null {
  if (target.sinceEpoch !== null) {
    return target.sinceEpoch;
  }
  return dayStartEpoch(target.seedDay);
}

async function collectHandle(
  session: InflactSession,
  target: SocialTarget,
  options: CollectOptions
): Promise<HandleResult> {
  const { logger } = options;
  const fetchedAt = new Date().toISOString();

  const stories: SocialStory[] = [];
  if (await inflactStoriesCheck(session, target.handle, logger)) {
    for (const story of await inflactStories(session, target.handle, logger)) {
      stories.push({
        platform: 'instagram',
        id: story.id,
        userId: story.ownerId ?? '',
        mediaType: story.isVideo ? 'video' : 'photo',
        isVideo: story.isVideo,
        takenAt: isoFromEpoch(story.takenAt),
        expiringAt: isoFromEpoch(story.expiringAt),
        posterUrl: story.posterUrl,
        r2Key: null,
        fetchedAt,
      });
    }
  }

  const reels: SocialReel[] = [];
  for (const reel of await inflactReels(session, target.handle, logger)) {
    reels.push({
      platform: 'instagram',
      id: reel.id,
      userId: '',
      shortcode: reel.shortcode,
      permalink: reel.permalink,
      takenAt: isoFromEpoch(reel.takenAt),
      likeCount: reel.likeCount,
      commentCount: reel.commentCount,
      playCount: reel.playCount,
      videoViewCount: reel.videoViewCount,
      posterUrl: reel.posterUrl,
      r2Key: null,
      fetchedAt,
    });
  }

  const analytics = await inflactAnalytics(session, target.handle, logger);
  const userId = analytics === null ? (stories[0]?.userId ?? '') : analytics.id;
  if (userId.length === 0) {
    logger.warn('instagram.collect no user id', { handle: target.handle });
    return { profile: null, profileDay: null, posts: [], stories: [], reels: [] };
  }

  const floor = floorEpoch(target);
  const posts: SocialPost[] = [];
  let cursor = '';
  let page = 0;
  while (true) {
    const result = await inflactPosts(session, target.handle, cursor, logger);
    // A pinned post appears first. The order is not by time. Collect the
    // posts above the floor on every page. Stop when a whole page is at
    // or below the floor.
    let anyNewer = false;
    for (const post of result.posts) {
      if (floor !== null && post.takenAt <= floor) {
        continue;
      }
      anyNewer = true;
      posts.push({
        platform: 'instagram',
        id: post.id,
        userId,
        shortcode: post.shortcode,
        permalink: post.permalink,
        type: postType(post.typename),
        isReel: post.isReel,
        takenAt: isoFromEpoch(post.takenAt),
        caption: post.caption,
        likes: post.likes,
        comments: post.comments,
        videoViews: post.videoViews,
        posterUrl: post.posterUrl,
        r2Key: null,
        fetchedAt,
      });
    }
    page += 1;
    if (!result.hasNext || result.cursor === null || page >= POST_PAGE_LIMIT) {
      break;
    }
    if (floor !== null && !anyNewer) {
      break;
    }
    cursor = result.cursor;
  }

  const withUser = stories.map((story) => (story.userId.length === 0 ? { ...story, userId } : story));
  const reelsWithUser = reels.map((reel) => ({ ...reel, userId }));

  if (analytics === null) {
    return { profile: null, profileDay: null, posts, stories: withUser, reels: reelsWithUser };
  }

  const profile: SocialProfile = {
    platform: 'instagram',
    userId: analytics.id,
    handle: analytics.handle,
    fullName: analytics.fullName,
  };
  const profileDay: SocialProfileDay = {
    platform: 'instagram',
    userId: analytics.id,
    day: dayFromEpoch(Math.floor(Date.now() / 1000)),
    handle: analytics.handle,
    followers: analytics.followers,
    uploads: analytics.uploads,
    avgLikes: analytics.avgLikes,
    avgComments: analytics.avgComments,
    engagement: analytics.engagement,
    postsPerDay: analytics.postsPerDay,
    postsPerWeek: analytics.postsPerWeek,
    score: analytics.score,
    isVerified: analytics.isVerified,
    category: analytics.category,
    adReelPrice: analytics.adReelPrice,
    adPostPrice: analytics.adPostPrice,
    adStoryPrice: analytics.adStoryPrice,
    country: analytics.country,
    keywords: analytics.keywords,
    fetchedAt,
  };
  return { profile, profileDay, posts, stories: withUser, reels: reelsWithUser };
}

// Collect every target. The session rotates after a number of handles.
export async function collectSocial(targets: readonly SocialTarget[], options: CollectOptions): Promise<SocialPayload> {
  const rotateEvery = options.rotateEvery === undefined ? DEFAULT_ROTATE_EVERY : options.rotateEvery;
  let session = await initInflact(options.logger, options.secret);
  let callsSinceRotation = 0;

  const profiles: SocialProfile[] = [];
  const profileDays: SocialProfileDay[] = [];
  const posts: SocialPost[] = [];
  const stories: SocialStory[] = [];
  const reels: SocialReel[] = [];

  for (const target of targets) {
    if (callsSinceRotation >= rotateEvery) {
      session = await initInflact(options.logger, options.secret);
      callsSinceRotation = 0;
    }
    callsSinceRotation += 1;
    try {
      const result = await collectHandle(session, target, options);
      if (result.profile !== null) {
        profiles.push(result.profile);
      }
      if (result.profileDay !== null) {
        profileDays.push(result.profileDay);
      }
      posts.push(...result.posts);
      stories.push(...result.stories);
      reels.push(...result.reels);
      options.logger.info('instagram.handle done', {
        handle: target.handle,
        posts: result.posts.length,
        stories: result.stories.length,
        reels: result.reels.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.warn('instagram.handle failed', { handle: target.handle, error: message });
      session = await initInflact(options.logger, options.secret);
      callsSinceRotation = 0;
    }
  }

  return { profiles, profileDays, posts, stories, reels };
}
