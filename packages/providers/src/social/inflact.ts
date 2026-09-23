// inflact.com Instagram client. See docs/INSTAGRAM.md.
// The API needs a session, a CSRF token, and an HMAC signature.
// The client stores the poster URL, not a video.

import type { Logger } from '../logger.ts';

export const INFLACT_HOST = 'https://inflact.com';

// The signature secret from the client bundle. The value can change.
// The environment variable INFLACT_SIGNATURE_SECRET overrides it.
export const INFLACT_DEFAULT_SECRET = '59c4f127a1d1e260b82b9ea54782a2f5f4fdeed6d5089ec54d99dafcff9eb046';

const STORIES_CHECK_PATH = '/downloader/api/viewer/stories/check/';
const STORIES_PATH = '/downloader/api/viewer/stories/';
const POSTS_PATH = '/downloader/api/viewer/posts/';
const REELS_PATH = '/downloader/api/viewer/reels/';
const ANALYTICS_PATH = '/profile-analyzer/v1/analytics/?lang=en';
const VIEWER_REFERER = `${INFLACT_HOST}/instagram-stories-viewer/`;
const ANALYZER_REFERER = `${INFLACT_HOST}/tools/profile-analyzer/`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// One request each second. The source blocks a faster caller.
export const MIN_REQUEST_INTERVAL_MS = 1000;
let intervalMs = MIN_REQUEST_INTERVAL_MS;
let lastRequestAt = 0;

// The tests set the interval to zero. A test must not wait.
export function setMinRequestIntervalMs(value: number): void {
  intervalMs = value;
}

async function rateLimit(): Promise<void> {
  const wait = intervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, wait);
    });
  }
  lastRequestAt = Date.now();
}

export interface InflactSession {
  readonly cookie: string;
  readonly csrf: string;
  readonly delta: number;
  readonly secret: string;
  readonly clientId: string;
}

export interface InflactStory {
  readonly id: string;
  readonly takenAt: number;
  readonly expiringAt: number;
  readonly isVideo: boolean;
  readonly posterUrl: string | null;
  readonly videoUrl: string | null;
  readonly ownerId: string | null;
}

export interface InflactPost {
  readonly id: string;
  readonly shortcode: string;
  readonly takenAt: number;
  readonly typename: string;
  readonly isReel: boolean;
  readonly caption: string | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly videoViews: number | null;
  readonly posterUrl: string | null;
  readonly permalink: string;
}

export interface InflactReel {
  readonly id: string;
  readonly shortcode: string;
  readonly takenAt: number;
  readonly likeCount: number | null;
  readonly commentCount: number | null;
  readonly playCount: number | null;
  readonly videoViewCount: number | null;
  readonly posterUrl: string | null;
  readonly permalink: string;
}

export interface InflactPostsPage {
  readonly posts: readonly InflactPost[];
  readonly cursor: string | null;
  readonly hasNext: boolean;
}

export interface InflactAnalytics {
  readonly id: string;
  readonly handle: string;
  readonly fullName: string | null;
  readonly followers: number | null;
  readonly uploads: number | null;
  readonly avgLikes: number | null;
  readonly avgComments: number | null;
  readonly engagement: number | null;
  readonly postsPerDay: number | null;
  readonly postsPerWeek: number | null;
  readonly score: number | null;
  readonly isVerified: boolean;
  readonly category: string | null;
  readonly adReelPrice: number | null;
  readonly adPostPrice: number | null;
  readonly adStoryPrice: number | null;
  readonly country: string | null;
  readonly keywords: string | null;
}

type Json = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toHex(buffer);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

function base64(text: string): string {
  return btoa(text);
}

function readSetCookies(headers: Headers): readonly string[] {
  const withGet = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGet.getSetCookie === 'function') {
    return withGet.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single === null ? [] : [single];
}

function cookieHeaderFrom(setCookies: readonly string[]): string {
  const pairs: string[] = [];
  for (const raw of setCookies) {
    const pair = raw.split(';')[0]?.trim() ?? '';
    if (pair.length > 0) {
      pairs.push(pair);
    }
  }
  return pairs.join('; ');
}

async function fetchText(url: string, init: RequestInit, logger: Logger, label: string): Promise<string | null> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      logger.warn('instagram.http error', { label, status: response.status });
      return null;
    }
    return await response.text();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('instagram.fetch failed', { label, error: message });
    return null;
  }
}

function parseJson(text: string, logger: Logger, label: string): Json | null {
  try {
    // Instagram ids have 19 digits. A JavaScript number loses precision
    // above 15 digits. Quote the long id values before the parse. The
    // value stays exact. asId reads a string and a number.
    const quoted = text.replace(/("(?:id|pk|post_id|story_id|owner_id|user_id)":)(\d{16,})/g, '$1"$2"');
    const parsed: unknown = JSON.parse(quoted);
    return asRecord(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('instagram.json failed', { label, error: message, body: text.slice(0, 120) });
    return null;
  }
}

export function buildMultipart(fields: Readonly<Record<string, string>>): {
  readonly body: string;
  readonly contentType: string;
} {
  const boundary = `----geckoformboundary${randomHex(8)}`;
  let body = '';
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Start a session. The GET gives the cookies, the CSRF token, and the
// server time delta.
export async function initInflact(logger: Logger, secretOverride?: string): Promise<InflactSession> {
  await rateLimit();
  const response = await fetch(VIEWER_REFERER, { headers: { 'User-Agent': USER_AGENT } });
  const html = await response.text();
  const cookie = cookieHeaderFrom(readSetCookies(response.headers));
  const csrf = /name="csrf-token" content="([^"]+)"/.exec(html)?.[1] ?? '';
  const serverEpoch = Number(
    /serverTimeDelta\s*=\s*Math\.floor\(Date\.now\(\)\s*\/\s*1000\)\s*-\s*(\d+)/.exec(html)?.[1]
  );
  const delta =
    Math.floor(Date.now() / 1000) - (Number.isFinite(serverEpoch) ? serverEpoch : Math.floor(Date.now() / 1000));
  const secret = secretOverride === undefined || secretOverride.length === 0 ? INFLACT_DEFAULT_SECRET : secretOverride;
  if (csrf.length === 0) {
    logger.warn('instagram.session no csrf', { cookie: cookie.length > 0 });
  }
  return { cookie, csrf, delta, secret, clientId: randomHex(16) };
}

async function signedFetch(
  session: InflactSession,
  path: string,
  fields: Readonly<Record<string, string>>,
  logger: Logger,
  referer: string
): Promise<string | null> {
  const payload = {
    timestamp: Math.floor(Date.now() / 1000) - session.delta,
    clientId: session.clientId,
    nonce: randomHex(16),
  };
  const message = JSON.stringify(payload);
  const signature = await hmacHex(session.secret, message);
  const { body, contentType } = buildMultipart({ ...fields, _csrf: session.csrf });
  await rateLimit();
  return fetchText(
    `${INFLACT_HOST}${path}`,
    {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Content-Type': contentType,
        'X-Client-Token': base64(message),
        'X-Client-Signature': signature,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer,
        Origin: INFLACT_HOST,
      },
      body,
    },
    logger,
    path
  );
}

function ownerId(item: Json): string | null {
  const owner = asRecord(item['owner']);
  return owner === null ? null : asId(owner['pk']);
}

function parseStory(item: Json): InflactStory | null {
  const id = asId(item['id']);
  if (id === null) {
    return null;
  }
  return {
    id,
    takenAt: asNumber(item['takenAt']) ?? 0,
    expiringAt: asNumber(item['expiringAt']) ?? 0,
    isVideo: asBool(item['isVideo']),
    posterUrl: asString(item['displayUrl']),
    videoUrl: asString(item['videoUrl']),
    ownerId: ownerId(item),
  };
}

function captionText(node: Json): string | null {
  const caption = asRecord(node['edge_media_to_caption']);
  if (caption === null) {
    return null;
  }
  const edges = asArray(caption['edges']);
  const first = asRecord(edges[0]);
  if (first === null) {
    return null;
  }
  const inner = asRecord(first['node']);
  return inner === null ? null : asString(inner['text']);
}

function parsePost(node: Json): InflactPost | null {
  const id = asId(node['id']);
  const shortcode = asString(node['shortcode']) ?? asString(node['short_code']);
  if (id === null || shortcode === null) {
    return null;
  }
  const typename = asString(node['__typename']) ?? 'GraphImage';
  const likes = asRecord(node['edge_media_preview_like']);
  const comments = asRecord(node['edge_media_to_comment']);
  return {
    id,
    shortcode,
    takenAt: asNumber(node['taken_at_timestamp']) ?? 0,
    typename,
    isReel: typename === 'GraphVideo',
    caption: captionText(node),
    likes: likes === null ? null : asNumber(likes['count']),
    comments: comments === null ? null : asNumber(comments['count']),
    videoViews: asNumber(node['video_view_count']),
    posterUrl: asString(node['display_url']),
    permalink: `https://www.instagram.com/p/${shortcode}/`,
  };
}

function parseReel(item: Json): InflactReel | null {
  const id = asId(item['id']);
  const shortcode = asString(item['shortCode']);
  if (id === null || shortcode === null) {
    return null;
  }
  return {
    id,
    shortcode,
    takenAt: asNumber(item['createdAt']) ?? 0,
    likeCount: asNumber(item['likeCount']),
    commentCount: asNumber(item['commentCount']),
    playCount: asNumber(item['playCount']),
    videoViewCount: asNumber(item['videoViewCount']),
    posterUrl: asString(item['imageUrl']),
    permalink: `https://www.instagram.com/p/${shortcode}/`,
  };
}

export async function inflactStoriesCheck(session: InflactSession, handle: string, logger: Logger): Promise<boolean> {
  const text = await signedFetch(session, STORIES_CHECK_PATH, { url: handle }, logger, VIEWER_REFERER);
  if (text === null) {
    return false;
  }
  const json = parseJson(text, logger, 'stories/check');
  if (json === null) {
    return false;
  }
  const data = asRecord(json['data']);
  return data !== null && asBool(data['hasStories']);
}

export async function inflactStories(
  session: InflactSession,
  handle: string,
  logger: Logger
): Promise<readonly InflactStory[]> {
  const text = await signedFetch(session, STORIES_PATH, { url: handle, cursor: '' }, logger, VIEWER_REFERER);
  if (text === null) {
    return [];
  }
  const json = parseJson(text, logger, 'stories');
  if (json === null) {
    return [];
  }
  const data = asRecord(json['data']);
  const items = data === null ? [] : asArray(data['stories']);
  const stories: InflactStory[] = [];
  for (const item of items) {
    const row = asRecord(item);
    if (row === null) {
      continue;
    }
    const story = parseStory(row);
    if (story !== null) {
      stories.push(story);
    }
  }
  return stories;
}

export async function inflactPosts(
  session: InflactSession,
  handle: string,
  cursor: string,
  logger: Logger
): Promise<InflactPostsPage> {
  const text = await signedFetch(session, POSTS_PATH, { url: handle, cursor }, logger, VIEWER_REFERER);
  if (text === null) {
    return { posts: [], cursor: null, hasNext: false };
  }
  const json = parseJson(text, logger, 'posts');
  if (json === null) {
    return { posts: [], cursor: null, hasNext: false };
  }
  const data = asRecord(json['data']);
  const postsNode = data === null ? null : asRecord(data['posts']);
  const model = postsNode === null ? null : asRecord(postsNode['data']);
  const user = model === null ? null : asRecord(model['user']);
  const timeline = user === null ? null : asRecord(user['edge_owner_to_timeline_media']);
  if (timeline === null) {
    return { posts: [], cursor: null, hasNext: false };
  }
  const pageInfo = asRecord(timeline['page_info']);
  const edges = asArray(timeline['edges']);
  const posts: InflactPost[] = [];
  for (const edge of edges) {
    const record = asRecord(edge);
    const node = record === null ? null : asRecord(record['node']);
    if (node === null) {
      continue;
    }
    const post = parsePost(node);
    if (post !== null) {
      posts.push(post);
    }
  }
  const hasNext = pageInfo !== null && asBool(pageInfo['has_next_page']);
  const nextCursor = hasNext && pageInfo !== null ? asString(pageInfo['end_cursor']) : null;
  return { posts, cursor: nextCursor, hasNext };
}

export async function inflactReels(
  session: InflactSession,
  handle: string,
  logger: Logger
): Promise<readonly InflactReel[]> {
  const text = await signedFetch(session, REELS_PATH, { url: handle, cursor: '' }, logger, VIEWER_REFERER);
  if (text === null) {
    return [];
  }
  const json = parseJson(text, logger, 'reels');
  if (json === null) {
    return [];
  }
  const data = asRecord(json['data']);
  const items = data === null ? [] : asArray(data['reels']);
  const reels: InflactReel[] = [];
  for (const item of items) {
    const row = asRecord(item);
    if (row === null) {
      continue;
    }
    const reel = parseReel(row);
    if (reel !== null) {
      reels.push(reel);
    }
  }
  return reels;
}

export async function inflactAnalytics(
  session: InflactSession,
  handle: string,
  logger: Logger
): Promise<InflactAnalytics | null> {
  const text = await signedFetch(session, ANALYTICS_PATH, { url: handle }, logger, ANALYZER_REFERER);
  if (text === null) {
    return null;
  }
  const json = parseJson(text, logger, 'analytics');
  if (json === null) {
    return null;
  }
  const data = asRecord(json['data']);
  const profile = data === null ? null : asRecord(data['profile']);
  if (profile === null) {
    return null;
  }
  const id = asId(profile['id']);
  const username = asString(profile['username']);
  if (id === null || username === null) {
    return null;
  }
  const engagement = asRecord(profile['engagement']);
  const publishing = asRecord(profile['publishing']);
  const advertisement = asRecord(profile['advertisement']);
  const postsPerDay = publishing === null ? null : asRecord(publishing['postsPerDay']);
  const postsPerWeek = publishing === null ? null : asRecord(publishing['postsPerWeek']);
  const reel = advertisement === null ? null : asRecord(advertisement['reel']);
  const post = advertisement === null ? null : asRecord(advertisement['post']);
  const story = advertisement === null ? null : asRecord(advertisement['story']);
  const globalStats = asArray(profile['globalStats']);
  const firstGlobal = asRecord(globalStats[0]);
  const keywords = asRecord(profile['keywords']);
  return {
    id,
    handle: username,
    fullName: asString(profile['name']),
    followers: engagement === null ? null : asNumber(engagement['followers']),
    uploads: engagement === null ? null : asNumber(engagement['uploads']),
    avgLikes: engagement === null ? null : asNumber(engagement['avgLikes']),
    avgComments: engagement === null ? null : asNumber(engagement['avgComments']),
    engagement: engagement === null ? null : asNumber(engagement['value']),
    postsPerDay: postsPerDay === null ? null : asNumber(postsPerDay['value']),
    postsPerWeek: postsPerWeek === null ? null : asNumber(postsPerWeek['value']),
    score: asNumber(profile['score']),
    isVerified: asBool(profile['isVerified']),
    category: asString(profile['category']),
    adReelPrice: reel === null ? null : asNumber(reel['value']),
    adPostPrice: post === null ? null : asNumber(post['value']),
    adStoryPrice: story === null ? null : asNumber(story['value']),
    country: firstGlobal === null ? null : asString(firstGlobal['title']),
    keywords: keywords === null ? null : JSON.stringify(keywords),
  };
}
