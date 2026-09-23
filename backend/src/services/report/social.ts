// Renders the Social card: the posts, stories and reels of the shop's
// entity and its related persons, for one day. See docs/INSTAGRAM.md.

import type { EntityStore } from '../../entities.ts';
import { findEntity, findPerson, ROLE_LABELS } from '../../entities.ts';
import type { SocialPost, SocialProfile, SocialReel, SocialStory } from '@ecommerce-sniffle/providers/social';
import { badge, card, emptyState, esc } from '../report-components.ts';

export interface SocialRenderData {
  readonly profiles: readonly SocialProfile[];
  readonly posts: readonly SocialPost[];
  readonly stories: readonly SocialStory[];
  readonly reels: readonly SocialReel[];
}

// How many items the strip shows for each kind. The strip scrolls. The
// database keeps every item. This value is display only.
export const SOCIAL_REPORT_LIMIT = 12;

interface HandleOwner {
  readonly handle: string;
  readonly label: string;
}

// The Instagram handles of the entity and its related persons. Each
// entry holds the owner label: the shop name or the person name and role.
function relevantHandles(store: EntityStore, entityId: string): readonly HandleOwner[] {
  const owners = new Map<string, string>();
  const entity = findEntity(store, entityId);
  if (entity !== null) {
    for (const link of entity.socials) {
      if (link.platform === 'instagram') {
        owners.set(link.handle, entity.name);
      }
    }
  }
  for (const relation of store.personRelations.filter((entry) => entry.entityId === entityId)) {
    const person = findPerson(store, relation.personId);
    if (person === null) {
      continue;
    }
    const label = `${person.name} (${ROLE_LABELS[relation.role]})`;
    for (const link of person.socials) {
      if (link.platform === 'instagram') {
        owners.set(link.handle, label);
      }
    }
  }
  const result: HandleOwner[] = [];
  for (const [handle, label] of owners) {
    result.push({ handle, label });
  }
  return result;
}

export function socialUserIds(
  store: EntityStore,
  entityId: string,
  profiles: readonly SocialProfile[]
): readonly string[] {
  const handleToUserId = new Map(profiles.map((profile) => [profile.handle, profile.userId]));
  return relevantHandles(store, entityId)
    .map((entry) => handleToUserId.get(entry.handle))
    .filter((userId): userId is string => userId !== undefined);
}

function thumb(r2Key: string | null, posterUrl: string | null): string {
  if (r2Key !== null) {
    return `/media/${esc(r2Key)}`;
  }
  return posterUrl === null ? '' : esc(posterUrl);
}

function mapValue(source: ReadonlyMap<string, string>, key: string): string {
  const value = source.get(key);
  return value === undefined ? '' : value;
}

interface TileOptions {
  readonly image: string;
  readonly href: string | null;
  readonly handle: string;
  readonly owner: string;
  readonly badges: string;
  readonly date: string;
  readonly alt: string;
}

// One fixed tile. The image keeps a square shape. The whole tile is the
// link when a permalink exists.
function tile(options: TileOptions): string {
  const media =
    options.image === ''
      ? '<div class="social-thumb"><span>brak</span></div>'
      : `<div class="social-thumb"><img src="${options.image}" loading="lazy" alt="${esc(options.alt)}"></div>`;
  const head = options.handle === '' ? '' : `<div class="text-truncate fw-medium">@${esc(options.handle)}</div>`;
  const owner =
    options.owner === '' ? '' : `<div class="text-truncate text-secondary fs-6">${esc(options.owner)}</div>`;
  const badges = options.badges === '' ? '' : `<div class="d-flex flex-wrap gap-1">${options.badges}</div>`;
  const date = `<div class="text-secondary fs-6">${esc(options.date.slice(0, 10))}</div>`;
  const body = `<div class="card-body p-2">${head}${owner}${badges}${date}</div>`;
  if (options.href === null) {
    return `<div class="card card-sm social-tile">${media}${body}</div>`;
  }
  return `<a class="card card-sm social-tile text-reset text-decoration-none" href="${esc(options.href)}" target="_blank" rel="noopener">${media}${body}</a>`;
}

function strip(title: string, tiles: readonly string[]): string {
  if (tiles.length === 0) {
    return '';
  }
  return `<div class="subheader mt-3 mb-1">${esc(title)}</div><div class="social-strip">${tiles.join('')}</div>`;
}

function likesBadge(likes: number | null): string {
  return likes === null ? '' : `<span class="text-secondary fs-6">${likes} ♥</span>`;
}

function playsBadge(plays: number | null): string {
  return plays === null ? '' : `<span class="text-secondary fs-6">${plays} ▶</span>`;
}

export function renderSocialCard(store: EntityStore, entityId: string, data: SocialRenderData): string {
  const handles = relevantHandles(store, entityId);
  if (handles.length === 0) {
    return '';
  }
  const handleByUserId = new Map(data.profiles.map((profile) => [profile.userId, profile.handle]));
  const handleToUserId = new Map(data.profiles.map((profile) => [profile.handle, profile.userId]));
  const ownerByUserId = new Map<string, string>();
  for (const entry of handles) {
    const userId = handleToUserId.get(entry.handle);
    if (userId !== undefined) {
      ownerByUserId.set(userId, entry.label);
    }
  }
  const storyTiles = data.stories.slice(0, SOCIAL_REPORT_LIMIT).map((story) =>
    tile({
      image: thumb(story.r2Key, story.posterUrl),
      href: null,
      handle: mapValue(handleByUserId, story.userId),
      owner: mapValue(ownerByUserId, story.userId),
      badges: story.isVideo ? badge('wideo', 'blue') : '',
      date: story.takenAt,
      alt: `stories ${story.takenAt.slice(0, 10)}`,
    })
  );
  const postTiles = data.posts.slice(0, SOCIAL_REPORT_LIMIT).map((post) =>
    tile({
      image: thumb(post.r2Key, post.posterUrl),
      href: post.permalink.length === 0 ? null : post.permalink,
      handle: mapValue(handleByUserId, post.userId),
      owner: mapValue(ownerByUserId, post.userId),
      badges: [post.isReel ? badge('reel', 'blue') : '', likesBadge(post.likes)].join(''),
      date: post.takenAt,
      alt: post.caption === null ? `post ${post.takenAt.slice(0, 10)}` : post.caption.slice(0, 80),
    })
  );
  const reelTiles = data.reels.slice(0, SOCIAL_REPORT_LIMIT).map((reel) =>
    tile({
      image: thumb(reel.r2Key, reel.posterUrl),
      href: reel.permalink.length === 0 ? null : reel.permalink,
      handle: mapValue(handleByUserId, reel.userId),
      owner: mapValue(ownerByUserId, reel.userId),
      badges: [badge('reel', 'blue'), playsBadge(reel.playCount)].join(''),
      date: reel.takenAt,
      alt: `reel ${reel.takenAt.slice(0, 10)}`,
    })
  );
  const body = `${strip('Stories', storyTiles)}${strip('Posty', postTiles)}${strip('Reels', reelTiles)}`;
  if (body === '') {
    return card({
      title: 'Social',
      body: emptyState('Brak danych', 'Brak postów i stories w wybranym dniu.'),
      collapsed: true,
    });
  }
  return card({ title: 'Social', body, collapsed: true });
}
