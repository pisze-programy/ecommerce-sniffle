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
import type { InflactPost, InflactSession } from './inflact.ts';
import type {
  SocialPayload,
  SocialPost,
  SocialProfile,
  SocialProfileDay,
  SocialReel,
  SocialStory,
  SocialTarget,
} from './types.ts';

// Several shops run at the same time. Each shop still sends one request
// each second. The project standard is six shops in parallel.
const DEFAULT_CONCURRENCY = 6;
const POST_PAGE_LIMIT = 40;
// A handle with no shop seed has no floor. A deep backfill would run for
// hours. The limit caps it.
const NO_FLOOR_PAGE_LIMIT = 3;

export interface CollectOptions {
  readonly logger: Logger;
  readonly secret?: string;
  readonly concurrency?: number;
  // The VPS sends one payload for each handle. The callback holds the
  // ingest. It keeps the memory flat on a small VPS.
  readonly onHandle?: (target: SocialTarget, result: HandleResult) => Promise<void>;
}

export interface HandleResult {
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

// Read every page above the floor. A pinned post appears first. The
// order is not by time. Collect the posts above the floor on every page.
// Stop when a whole page is at or below the floor.
async function collectPostsRaw(
  session: InflactSession,
  target: SocialTarget,
  logger: Logger
): Promise<readonly InflactPost[]> {
  const floor = floorEpoch(target);
  const posts: InflactPost[] = [];
  let cursor = '';
  let page = 0;
  while (true) {
    const result = await inflactPosts(session, target.handle, cursor, logger);
    let anyNewer = false;
    for (const post of result.posts) {
      if (floor !== null && post.takenAt <= floor) {
        continue;
      }
      anyNewer = true;
      posts.push(post);
    }
    page += 1;
    const pageLimit = floor === null ? NO_FLOOR_PAGE_LIMIT : POST_PAGE_LIMIT;
    if (!result.hasNext || result.cursor === null || page >= pageLimit) {
      break;
    }
    if (floor !== null && !anyNewer) {
      break;
    }
    cursor = result.cursor;
  }
  return posts;
}

async function collectHandle(
  session: InflactSession,
  target: SocialTarget,
  options: CollectOptions
): Promise<HandleResult> {
  const { logger } = options;
  const fetchedAt = new Date().toISOString();

  // The calls do not depend on each other. Run them together. One slow
  // endpoint no longer adds to the other three.
  const [hasStories, reelsRaw, analytics, postsRaw] = await Promise.all([
    inflactStoriesCheck(session, target.handle, logger),
    inflactReels(session, target.handle, logger),
    inflactAnalytics(session, target.handle, logger),
    collectPostsRaw(session, target, logger),
  ]);
  const storiesRaw = hasStories ? await inflactStories(session, target.handle, logger) : [];

  const userId = analytics === null ? (storiesRaw[0]?.ownerId ?? '') : analytics.id;
  if (userId.length === 0) {
    logger.warn('instagram.collect no user id', { handle: target.handle });
    return { profile: null, profileDay: null, posts: [], stories: [], reels: [] };
  }

  const stories: SocialStory[] = [];
  for (const story of storiesRaw) {
    stories.push({
      platform: 'instagram',
      id: story.id,
      userId,
      mediaType: story.isVideo ? 'video' : 'photo',
      isVideo: story.isVideo,
      takenAt: isoFromEpoch(story.takenAt),
      expiringAt: isoFromEpoch(story.expiringAt),
      posterUrl: story.posterUrl,
      r2Key: null,
      fetchedAt,
    });
  }

  const reels: SocialReel[] = [];
  for (const reel of reelsRaw) {
    reels.push({
      platform: 'instagram',
      id: reel.id,
      userId,
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

  const posts: SocialPost[] = [];
  for (const post of postsRaw) {
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

  if (analytics === null) {
    return { profile: null, profileDay: null, posts, stories, reels };
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
  return { profile, profileDay, posts, stories, reels };
}

// Collect every target. Each shop uses one session with one request each
// second. Several shops run at the same time.
export async function collectSocial(targets: readonly SocialTarget[], options: CollectOptions): Promise<SocialPayload> {
  const profiles: SocialProfile[] = [];
  const profileDays: SocialProfileDay[] = [];
  const posts: SocialPost[] = [];
  const stories: SocialStory[] = [];
  const reels: SocialReel[] = [];

  const queue = [...targets];
  const worker = async (): Promise<void> => {
    for (;;) {
      const target = queue.shift();
      if (target === undefined) {
        return;
      }
      try {
        const session = await initInflact(options.logger, options.secret);
        const result = await collectHandle(session, target, options);
        if (options.onHandle !== undefined) {
          await options.onHandle(target, result);
        } else {
          if (result.profile !== null) {
            profiles.push(result.profile);
          }
          if (result.profileDay !== null) {
            profileDays.push(result.profileDay);
          }
          posts.push(...result.posts);
          stories.push(...result.stories);
          reels.push(...result.reels);
        }
        options.logger.info('instagram.handle done', {
          handle: target.handle,
          posts: result.posts.length,
          stories: result.stories.length,
          reels: result.reels.length,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        options.logger.warn('instagram.handle failed', { handle: target.handle, error: message });
      }
    }
  };

  const size = options.concurrency === undefined ? DEFAULT_CONCURRENCY : options.concurrency;
  const workers: Promise<void>[] = [];
  for (let index = 0; index < size; index += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { profiles, profileDays, posts, stories, reels };
}
