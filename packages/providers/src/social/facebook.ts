// Facebook client. See docs/FACEBOOK.md.
// The profile comes from the chocodata key. The posts and the reels come
// from the public page with a crawler user agent. A desktop browser agent
// gets a 400. The stories come from a public story viewer. No token for
// the page and the viewer.

import type { Logger } from '../logger.ts';

export const FACEBOOK_HOST = 'https://www.facebook.com';
export const FACEBOOK_STORIES_API = 'https://facebookstoryviewer.com/api/stories/';
export const CHOCODATA_HOST = 'https://api.chocodata.com/api/v1';

// Facebook serves the logged-out page to a crawler agent only.
export const FACEBOOK_CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
export const FACEBOOK_MIN_REQUEST_INTERVAL_MS = 1000;

export interface FacebookSession {
  readonly limiter: { lastAt: number };
}

export interface FacebookPost {
  readonly id: string;
  readonly permalink: string;
  readonly takenAt: number;
  readonly caption: string | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly videoViews: number | null;
  readonly isVideo: boolean;
  readonly posterUrl: string | null;
}

export interface FacebookStory {
  readonly id: string;
  readonly takenAt: number;
  readonly isVideo: boolean;
  readonly posterUrl: string | null;
}

export interface FacebookPageData {
  readonly id: string;
  readonly handle: string;
  readonly fullName: string | null;
  readonly followers: number | null;
  readonly talkingAbout: number | null;
  readonly posts: readonly FacebookPost[];
}

export interface FacebookProfileData {
  readonly id: string;
  readonly handle: string;
  readonly fullName: string | null;
  readonly followers: number | null;
  readonly talkingAbout: number | null;
}

let intervalMs = FACEBOOK_MIN_REQUEST_INTERVAL_MS;

// The tests set the interval to zero. A test must not wait.
export function setFacebookMinIntervalMs(value: number): void {
  intervalMs = value;
}

async function rateLimit(session: FacebookSession): Promise<void> {
  const wait = intervalMs - (Date.now() - session.limiter.lastAt);
  if (wait > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, wait);
    });
  }
  session.limiter.lastAt = Date.now();
}

type Json = Record<string, unknown>;

function rec(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Json) : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: string | undefined): string {
  return value === undefined ? '' : value;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, property: string): string | null {
  const match = new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html);
  return match === null ? null : decodeEntities(text(match[1]));
}

// The about line holds "540,575 followers · 8,831 talking about this".
// The number uses spaces and non breaking spaces as the group separator.
function parseCount(description: string, patterns: readonly string[]): number | null {
  for (const pattern of patterns) {
    const match = new RegExp(`([\\d][\\d\\s\\u00a0.,]*)\\s*(?:${pattern})`, 'i').exec(description);
    if (match !== null) {
      const digits = text(match[1]).replace(/[^\d]/g, '');
      if (digits.length > 0) {
        return Number(digits);
      }
    }
  }
  return null;
}

function unescapeJson(value: string): string {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

function firstNumber(source: string, pattern: RegExp): number | null {
  const match = pattern.exec(source);
  return match === null ? null : num(Number(match[1]));
}

interface PostFeedback {
  readonly likes: number | null;
  readonly comments: number | null;
  readonly views: number | null;
}

// The post node carries post_id and creation_time next to each other.
// The engagement sits in a feedback block, keyed by subscription_target_id.
export function parseFacebookPosts(html: string): readonly FacebookPost[] {
  const feedback = new Map<string, PostFeedback>();
  for (const match of html.matchAll(/"subscription_target_id":"(\d+)"/g)) {
    const id = text(match[1]);
    if (feedback.has(id)) {
      continue;
    }
    const start = match.index;
    const window = html.slice(start, start + 6000);
    feedback.set(id, {
      likes: firstNumber(window, /"reaction_count":\{"count":(\d+)/),
      comments: firstNumber(window, /"comments":\{"total_count":(\d+)/),
      views: firstNumber(window, /"video_view_count":(\d+)/),
    });
  }
  const anchors = [...html.matchAll(/"post_id":"(\d+)","creation_time":(\d+)/g)];
  const posts: FacebookPost[] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const match = anchors[index];
    if (match === undefined) {
      continue;
    }
    const id = text(match[1]);
    const takenAt = Number(match[2]);
    const start = match.index;
    const next = anchors[index + 1];
    const end = next === undefined ? start + 8000 : next.index;
    const window = html.slice(start, end);
    const message = /"message":\{"text":"((?:[^"\\]|\\.)*)"/.exec(window);
    const type = /"attachments":\[\{"media":\{"__typename":"(\w+)"/.exec(window);
    const url = /"url":"(https:\\\/\\\/www\.facebook\.com\\\/[^"]+\\\/(?:videos|posts|reel)\\\/\d+\\\/?)"/.exec(window);
    const image = /"image":\{"uri":"([^"]+)"/.exec(window);
    const fallbackImage = /"uri":"(https:\\\/\\\/scontent[^"]+\.jpg[^"]*)"/.exec(window);
    const imageValue = image === null ? fallbackImage : image;
    const fb = feedback.get(id);
    posts.push({
      id,
      permalink: url === null ? '' : unescapeJson(text(url[1])),
      takenAt,
      caption: message === null ? null : unescapeJson(text(message[1])),
      likes: fb === undefined ? null : fb.likes,
      comments: fb === undefined ? null : fb.comments,
      videoViews: fb === undefined ? null : fb.views,
      isVideo: type !== null && type[1] === 'Video',
      posterUrl: imageValue === null ? null : unescapeJson(text(imageValue[1])),
    });
  }
  return posts;
}

export function parseFacebookPage(html: string, handle: string): FacebookPageData {
  const description = metaContent(html, 'og:description');
  const title = metaContent(html, 'og:title');
  const pageId = /"delegate_page":\{"id":"(\d+)"/.exec(html);
  const firstPart = title === null ? null : title.split('|')[0];
  const rawName = firstPart === undefined ? null : firstPart;
  const name = rawName === null ? null : rawName.trim();
  const idValue = pageId === null ? handle : text(pageId[1]);
  return {
    id: idValue.length === 0 ? handle : idValue,
    handle,
    fullName: name === null || name.length === 0 ? null : name,
    followers: parseCount(description === null ? '' : description, ['obserwator', 'followers']),
    talkingAbout: parseCount(description === null ? '' : description, [
      'os[óo]b\\s*m[óo]w',
      'osoby\\s*m[óo]w',
      'people\\s*talking',
    ]),
    posts: parseFacebookPosts(html),
  };
}

export function parseFacebookStories(body: unknown): readonly FacebookStory[] {
  const root = rec(body);
  if (root === null || root['ok'] !== true) {
    return [];
  }
  const items = Array.isArray(root['items']) ? root['items'] : [];
  const stories: FacebookStory[] = [];
  for (const entry of items) {
    const row = rec(entry);
    if (row === null) {
      continue;
    }
    const id = str(row['id']);
    const created = num(row['created']);
    if (id === null || created === null) {
      continue;
    }
    const thumb = str(row['thumb']);
    stories.push({
      id,
      takenAt: created,
      isVideo: str(row['type']) === 'video',
      posterUrl: thumb === null ? str(row['url']) : thumb,
    });
  }
  return stories;
}

// The chocodata profile is an Open Graph read. The about line holds
// "540,575 followers · 8,831 talking about this".
export function parseChocodataProfile(body: unknown, handle: string): FacebookProfileData | null {
  const root = rec(body);
  if (root === null) {
    return null;
  }
  const id = str(root['id']);
  if (id === null) {
    return null;
  }
  const about = str(root['about']);
  const description = about === null ? '' : about;
  return {
    id,
    handle,
    fullName: str(root['name']),
    followers: parseCount(description, ['followers', 'obserwator', 'likes']),
    talkingAbout: parseCount(description, ['talking about', 'm[óo]wi']),
  };
}

export async function initFacebook(logger: Logger): Promise<FacebookSession> {
  logger.debug('facebook.session start', {});
  return { limiter: { lastAt: 0 } };
}

// The profile read uses the chocodata key. Without the key the page
// parser still reads the same values from the Open Graph block.
export async function facebookProfile(
  session: FacebookSession,
  handle: string,
  logger: Logger,
  apiKey: string | undefined
): Promise<FacebookProfileData | null> {
  if (apiKey === undefined || apiKey.length === 0) {
    return null;
  }
  await rateLimit(session);
  try {
    const url = `${CHOCODATA_HOST}/facebook/profile?username=${encodeURIComponent(handle)}&api_key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { headers: { 'User-Agent': FACEBOOK_CRAWLER_UA } });
    if (!response.ok) {
      logger.warn('facebook.profile http error', { handle, status: response.status });
      return null;
    }
    return parseChocodataProfile(await response.json(), handle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('facebook.profile failed', { handle, error: message });
    return null;
  }
}

export async function facebookPage(
  session: FacebookSession,
  handle: string,
  logger: Logger
): Promise<FacebookPageData | null> {
  await rateLimit(session);
  try {
    const response = await fetch(`${FACEBOOK_HOST}/${encodeURIComponent(handle)}`, {
      headers: { 'User-Agent': FACEBOOK_CRAWLER_UA, 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8' },
    });
    if (!response.ok) {
      logger.warn('facebook.page http error', { handle, status: response.status });
      return null;
    }
    return parseFacebookPage(await response.text(), handle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('facebook.page failed', { handle, error: message });
    return null;
  }
}

export async function facebookStories(
  session: FacebookSession,
  handle: string,
  logger: Logger
): Promise<readonly FacebookStory[]> {
  await rateLimit(session);
  try {
    const response = await fetch(FACEBOOK_STORIES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': FACEBOOK_CRAWLER_UA,
        Origin: 'https://facebookstoryviewer.com',
        Referer: 'https://facebookstoryviewer.com/',
      },
      body: JSON.stringify({ url: `${FACEBOOK_HOST}/${handle}` }),
    });
    if (!response.ok) {
      logger.warn('facebook.stories http error', { handle, status: response.status });
      return [];
    }
    return parseFacebookStories(await response.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('facebook.stories failed', { handle, error: message });
    return [];
  }
}
