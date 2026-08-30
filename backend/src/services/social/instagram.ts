// Instagram scraper for the pilot: `instagram-scraper2` on RapidAPI.
// Endpoints: /user_info, /medias_v2, /stories.
// The parser is defensive: it reads multiple possible shapes and logs
// the top-level keys when it cannot find items. The live run shows the
// real shape if the provider changes it.

import type { Logger } from '@ecommerce-sniffle/providers';
import type { SocialPost, SocialProfile, SocialStory } from './types.ts';

const HOST = 'instagram-scraper2.p.rapidapi.com';

export interface InstagramDeps {
  readonly apiKey: string;
  readonly logger: Logger;
}

type Json = Record<string, unknown>;

function fetchJson(url: string, deps: InstagramDeps): Promise<Response> {
  return fetch(url, {
    headers: {
      'x-rapidapi-host': HOST,
      'x-rapidapi-key': deps.apiKey,
    },
  });
}

function isoFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function unwrap(data: unknown): Json {
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const root = data as Json;
  // Some responses wrap the payload in a body or data field.
  const body = root['body'];
  if (typeof body === 'object' && body !== null) {
    return body as Json;
  }
  const nested = root['data'];
  if (typeof nested === 'object' && nested !== null) {
    const user = (nested as Json)['user'];
    if (typeof user === 'object' && user !== null) {
      return user as Json;
    }
  }
  return root;
}

function findItems(data: unknown): readonly Json[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const root = data as Json;
  const candidates: unknown[] = [];
  const push = (value: unknown): void => {
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  };
  push(root['items']);
  const reel = root['reel'];
  if (typeof reel === 'object' && reel !== null) {
    push((reel as Json)['items']);
  }
  const dataField = root['data'];
  if (typeof dataField === 'object' && dataField !== null) {
    const user = (dataField as Json)['user'];
    if (typeof user === 'object' && user !== null) {
      const edge = (user as Json)['edge_owner_to_timeline_media'];
      if (typeof edge === 'object' && edge !== null) {
        const edges = (edge as Json)['edges'];
        if (Array.isArray(edges)) {
          for (const entry of edges) {
            if (typeof entry === 'object' && entry !== null) {
              const node = (entry as Json)['node'];
              if (typeof node === 'object' && node !== null) {
                candidates.push(node);
              }
            }
          }
        }
      }
    }
  }
  const body = root['body'];
  if (typeof body === 'object' && body !== null) {
    push((body as Json)['items']);
  }
  const results = candidates.filter((entry): entry is Json => typeof entry === 'object' && entry !== null);
  return results.slice(0, 50);
}

function mediaUrls(item: Json): readonly string[] {
  const urls: string[] = [];
  const imageVersions = item['image_versions2'];
  if (typeof imageVersions === 'object' && imageVersions !== null) {
    const candidates = (imageVersions as Json)['candidates'];
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        if (typeof candidate === 'object' && candidate !== null) {
          const url = asString((candidate as Json)['url']);
          if (url !== null) {
            urls.push(url);
          }
        }
      }
    }
  }
  const videoVersions = item['video_versions'];
  if (Array.isArray(videoVersions)) {
    for (const version of videoVersions) {
      if (typeof version === 'object' && version !== null) {
        const url = asString((version as Json)['url']);
        if (url !== null) {
          urls.push(url);
        }
      }
    }
  }
  const display = asString(item['display_url']);
  if (display !== null) {
    urls.push(display);
  }
  const thumbnail = asString(item['thumbnail_src']);
  if (thumbnail !== null) {
    urls.push(thumbnail);
  }
  return [...new Set(urls)];
}

function usernames(value: unknown): readonly string[] {
  const names: string[] = [];
  let list: unknown = value;
  if (typeof value === 'object' && value !== null) {
    const inner = (value as Json)['in_user_tagged'];
    if (Array.isArray(inner)) {
      list = inner;
    }
  }
  if (!Array.isArray(list)) {
    return names;
  }
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const user = (entry as Json)['user'];
    if (typeof user === 'object' && user !== null) {
      const name = asString((user as Json)['username']);
      if (name !== null) {
        names.push(name);
      }
    }
  }
  return names;
}

function asEpoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mediaTypeName(value: unknown): 'photo' | 'video' | 'carousel' {
  if (value === 2) {
    return 'video';
  }
  if (value === 8) {
    return 'carousel';
  }
  return 'photo';
}

function storyMediaType(value: unknown): 'photo' | 'video' {
  return value === 2 ? 'video' : 'photo';
}

function parsePost(item: Json, userId: string, fetchedAt: string): SocialPost | null {
  const id = asString(item['pk']) ?? asString(item['id']);
  const shortcode = asString(item['code']);
  if (id === null || shortcode === null) {
    return null;
  }
  const takenAt = isoFromEpoch(asEpoch(item['taken_at']) ?? 0);
  const captionObj = item['caption'];
  const caption =
    typeof captionObj === 'object' && captionObj !== null
      ? asString((captionObj as Json)['text'])
      : asString(captionObj);
  const isCommercial = asBool(item['is_commercial']) || item['commerciality_status'] === 'commercial';
  return {
    platform: 'instagram',
    id,
    userId,
    shortcode,
    type: mediaTypeName(item['media_type']),
    isReel: asBool(item['is_reel_media']),
    takenAt,
    caption,
    mediaUrls: mediaUrls(item),
    isPaidPartnership: asBool(item['is_paid_partnership']),
    isCommercial,
    taggedUsers: usernames(item['usertags'] ?? item['tags']),
    r2Key: null,
    fetchedAt,
  };
}

function parseStory(item: Json, userId: string, fetchedAt: string): SocialStory | null {
  const id = asString(item['pk']) ?? asString(item['id']);
  if (id === null) {
    return null;
  }
  return {
    platform: 'instagram',
    id,
    userId,
    mediaType: storyMediaType(item['media_type']),
    mediaUrls: mediaUrls(item),
    takenAt: isoFromEpoch(asEpoch(item['taken_at']) ?? 0),
    expiringAt: isoFromEpoch(asEpoch(item['expiring_at']) ?? 0),
    isPaidPartnership: asBool(item['is_paid_partnership']),
    isCommercial: asBool(item['is_commercial']) || item['commerciality_status'] === 'commercial',
    hasCtaSticker: asBool(item['is_cta_sticker_available']) || asBool(item['has_cta_sticker']),
    mentions: usernames(item['reel_mentions']),
    r2Key: null,
    fetchedAt,
  };
}

function bodyAsJson(body: string, deps: InstagramDeps, label: string): Json {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Json;
    }
    deps.logger.warn(`social.${label}.notJson`, { body: body.slice(0, 200) });
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error(`social.${label}.parseFailed`, { error: message, body: body.slice(0, 200) });
    return {};
  }
}

// Resolves a handle to a stable profile. Returns null when the endpoint
// gives no usable id. The registry stores the id for the daily cron.
export async function fetchProfile(handle: string, deps: InstagramDeps): Promise<SocialProfile | null> {
  const url = `https://${HOST}/user_info?username=${encodeURIComponent(handle)}`;
  try {
    const response = await fetchJson(url, deps);
    const body = await response.text();
    const data = unwrap(bodyAsJson(body, deps, 'profile'));
    const userId = asString(data['pk']) ?? asString(data['pk_id']) ?? asString(data['id']) ?? asString(data['user_id']);
    const username = asString(data['username']) ?? handle;
    const fullName = asString(data['full_name']);
    if (userId === null) {
      deps.logger.warn('social.profile.noUserId', { handle, keys: JSON.stringify(Object.keys(data).slice(0, 20)) });
      return null;
    }
    return { platform: 'instagram', userId, handle: username, fullName };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('social.profile.failed', { handle, error: message });
    return null;
  }
}

export async function fetchPosts(userId: string, deps: InstagramDeps): Promise<readonly SocialPost[]> {
  const url = `https://${HOST}/medias_v2?user_id=${encodeURIComponent(userId)}&batch_size=30`;
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetchJson(url, deps);
    if (response.status === 204) {
      return [];
    }
    const body = await response.text();
    const data = bodyAsJson(body, deps, 'posts');
    const items = findItems(data);
    const posts: SocialPost[] = [];
    for (const item of items) {
      const post = parsePost(item, userId, fetchedAt);
      if (post !== null) {
        posts.push(post);
      }
    }
    if (posts.length === 0 && items.length > 0) {
      deps.logger.warn('social.posts.unparsed', {
        userId,
        itemCount: items.length,
        keys: JSON.stringify(Object.keys(items[0] ?? {}).slice(0, 20)),
      });
    }
    return posts;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('social.posts.failed', { userId, error: message });
    return [];
  }
}

export async function fetchStories(userId: string, deps: InstagramDeps): Promise<readonly SocialStory[]> {
  const url = `https://${HOST}/stories?user_id=${encodeURIComponent(userId)}`;
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetchJson(url, deps);
    if (response.status === 204) {
      return [];
    }
    const body = await response.text();
    const data = bodyAsJson(body, deps, 'stories');
    const items = findItems(data);
    const stories: SocialStory[] = [];
    for (const item of items) {
      const story = parseStory(item, userId, fetchedAt);
      if (story !== null) {
        stories.push(story);
      }
    }
    if (stories.length === 0 && items.length > 0) {
      deps.logger.warn('social.stories.unparsed', { userId, itemCount: items.length });
    }
    return stories;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error('social.stories.failed', { userId, error: message });
    return [];
  }
}
