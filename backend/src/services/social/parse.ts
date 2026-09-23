// Parse the social ingest body. See docs/INSTAGRAM.md.
// The VPS sends the payload. The worker checks the shape before the write.

import type {
  SocialPayload,
  SocialPost,
  SocialProfile,
  SocialProfileDay,
  SocialReel,
  SocialStory,
} from '@ecommerce-sniffle/providers/social';

type Json = Readonly<Record<string, unknown>>;

function rec(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Json) : null;
}

function arr(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

// The instagram value is the default. The facebook value must be exact.
function platform(value: unknown): 'instagram' | 'facebook' {
  return value === 'facebook' ? 'facebook' : 'instagram';
}

function mapAll<T>(value: unknown, fn: (row: Json) => T | null): readonly T[] {
  const out: T[] = [];
  for (const entry of arr(value)) {
    const row = rec(entry);
    if (row === null) {
      continue;
    }
    const parsed = fn(row);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

function parseProfile(row: Json): SocialProfile | null {
  const userId = str(row['userId']);
  if (userId === null) {
    return null;
  }
  return {
    platform: platform(row['platform']),
    userId,
    handle: str(row['handle']) ?? userId,
    fullName: str(row['fullName']),
  };
}

function parsePost(row: Json): SocialPost | null {
  const id = str(row['id']);
  const userId = str(row['userId']);
  if (id === null || userId === null) {
    return null;
  }
  const kind = str(row['type']);
  return {
    platform: platform(row['platform']),
    id,
    userId,
    shortcode: str(row['shortcode']) ?? '',
    permalink: str(row['permalink']) ?? '',
    type: kind === 'video' ? 'video' : kind === 'carousel' ? 'carousel' : 'photo',
    isReel: bool(row['isReel']),
    takenAt: str(row['takenAt']) ?? '',
    caption: str(row['caption']),
    likes: num(row['likes']),
    comments: num(row['comments']),
    videoViews: num(row['videoViews']),
    posterUrl: str(row['posterUrl']),
    r2Key: str(row['r2Key']),
    fetchedAt: str(row['fetchedAt']) ?? '',
  };
}

function parseStory(row: Json): SocialStory | null {
  const id = str(row['id']);
  const userId = str(row['userId']);
  if (id === null || userId === null) {
    return null;
  }
  const kind = str(row['mediaType']);
  return {
    platform: platform(row['platform']),
    id,
    userId,
    mediaType: kind === 'video' ? 'video' : 'photo',
    isVideo: bool(row['isVideo']),
    takenAt: str(row['takenAt']) ?? '',
    expiringAt: str(row['expiringAt']) ?? '',
    posterUrl: str(row['posterUrl']),
    r2Key: str(row['r2Key']),
    fetchedAt: str(row['fetchedAt']) ?? '',
  };
}

function parseReel(row: Json): SocialReel | null {
  const id = str(row['id']);
  const userId = str(row['userId']);
  if (id === null || userId === null) {
    return null;
  }
  return {
    platform: platform(row['platform']),
    id,
    userId,
    shortcode: str(row['shortcode']) ?? '',
    permalink: str(row['permalink']) ?? '',
    takenAt: str(row['takenAt']) ?? '',
    likeCount: num(row['likeCount']),
    commentCount: num(row['commentCount']),
    playCount: num(row['playCount']),
    videoViewCount: num(row['videoViewCount']),
    posterUrl: str(row['posterUrl']),
    r2Key: str(row['r2Key']),
    fetchedAt: str(row['fetchedAt']) ?? '',
  };
}

function parseProfileDay(row: Json): SocialProfileDay | null {
  const userId = str(row['userId']);
  const day = str(row['day']);
  if (userId === null || day === null) {
    return null;
  }
  return {
    platform: platform(row['platform']),
    userId,
    day,
    handle: str(row['handle']) ?? userId,
    followers: num(row['followers']),
    uploads: num(row['uploads']),
    avgLikes: num(row['avgLikes']),
    avgComments: num(row['avgComments']),
    engagement: num(row['engagement']),
    postsPerDay: num(row['postsPerDay']),
    postsPerWeek: num(row['postsPerWeek']),
    score: num(row['score']),
    talkingAbout: num(row['talkingAbout']),
    isVerified: bool(row['isVerified']),
    category: str(row['category']),
    adReelPrice: num(row['adReelPrice']),
    adPostPrice: num(row['adPostPrice']),
    adStoryPrice: num(row['adStoryPrice']),
    country: str(row['country']),
    keywords: str(row['keywords']),
    fetchedAt: str(row['fetchedAt']) ?? '',
  };
}

export function parseSocialPayload(body: unknown): SocialPayload | null {
  const root = rec(body);
  if (root === null) {
    return null;
  }
  if (!Array.isArray(root['posts']) && !Array.isArray(root['stories']) && !Array.isArray(root['reels'])) {
    return null;
  }
  return {
    profiles: mapAll(root['profiles'], parseProfile),
    profileDays: mapAll(root['profileDays'], parseProfileDay),
    posts: mapAll(root['posts'], parsePost),
    stories: mapAll(root['stories'], parseStory),
    reels: mapAll(root['reels'], parseReel),
  };
}
