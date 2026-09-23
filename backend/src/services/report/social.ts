// Renders the Social card: recent IG posts, stories and reels of the
// shop's entity and its related persons. See docs/INSTAGRAM.md.

import type { EntityStore } from '../../entities.ts';
import { findEntity, findPerson } from '../../entities.ts';
import type { SocialPost, SocialProfile, SocialReel, SocialStory } from '@ecommerce-sniffle/providers/social';
import { badge, card, emptyState, esc } from '../report-components.ts';

export interface SocialRenderData {
  readonly profiles: readonly SocialProfile[];
  readonly posts: readonly SocialPost[];
  readonly stories: readonly SocialStory[];
  readonly reels: readonly SocialReel[];
}

// How many items the shop page shows for each kind. The collection is not
// limited. The database keeps every item. This value is display only.
export const SOCIAL_REPORT_LIMIT = 24;

function relevantHandles(store: EntityStore, entityId: string): readonly string[] {
  const handles = new Set<string>();
  const entity = findEntity(store, entityId);
  if (entity !== null) {
    for (const link of entity.socials) {
      if (link.platform === 'instagram') {
        handles.add(link.handle);
      }
    }
  }
  for (const relation of store.personRelations.filter((entry) => entry.entityId === entityId)) {
    const person = findPerson(store, relation.personId);
    if (person === null) {
      continue;
    }
    for (const link of person.socials) {
      if (link.platform === 'instagram') {
        handles.add(link.handle);
      }
    }
  }
  return [...handles];
}

export function socialUserIds(
  store: EntityStore,
  entityId: string,
  profiles: readonly SocialProfile[]
): readonly string[] {
  const handleToUserId = new Map(profiles.map((profile) => [profile.handle, profile.userId]));
  return relevantHandles(store, entityId)
    .map((handle) => handleToUserId.get(handle))
    .filter((userId): userId is string => userId !== undefined);
}

function thumb(r2Key: string | null, posterUrl: string | null): string {
  if (r2Key !== null) {
    return `/media/${esc(r2Key)}`;
  }
  return posterUrl === null ? '' : esc(posterUrl);
}

function tile(image: string, href: string | null, badges: string, date: string): string {
  const imageHtml =
    image === ''
      ? '<div class="card-body"><p class="text-secondary fs-6">brak mediów</p></div>'
      : href === null
        ? `<img class="card-img-top" src="${image}" loading="lazy" alt="media">`
        : `<a href="${href}" target="_blank" rel="noopener"><img class="card-img-top" src="${image}" loading="lazy" alt="media"></a>`;
  return `<div class="col-6 col-lg-3">
  <div class="card card-sm h-100">
    ${imageHtml}
    <div class="card-body p-2">
      <div class="d-flex flex-wrap gap-1">${badges}</div>
      <div class="text-secondary fs-6">${esc(date.slice(0, 10))}</div>
    </div>
  </div>
</div>`;
}

function renderStories(stories: readonly SocialStory[]): string {
  if (stories.length === 0) {
    return '';
  }
  const tiles = stories
    .map((story) => {
      const flags = story.isVideo ? badge('wideo', 'blue') : '';
      return tile(thumb(story.r2Key, story.posterUrl), null, flags, story.takenAt);
    })
    .join('');
  return `<div class="subheader mt-3 mb-1">Stories</div><div class="row row-cards">${tiles}</div>`;
}

function renderPosts(posts: readonly SocialPost[]): string {
  if (posts.length === 0) {
    return '';
  }
  const tiles = posts
    .map((post) => {
      const flags = [
        post.isReel ? badge('reel', 'blue') : '',
        post.likes === null ? '' : `<span class="text-secondary fs-6">${post.likes} ♥</span>`,
      ].join('');
      const href = post.permalink.length === 0 ? null : esc(post.permalink);
      return tile(thumb(post.r2Key, post.posterUrl), href, flags, post.takenAt);
    })
    .join('');
  return `<div class="subheader mt-3 mb-1">Posty</div><div class="row row-cards">${tiles}</div>`;
}

function renderReels(reels: readonly SocialReel[]): string {
  if (reels.length === 0) {
    return '';
  }
  const tiles = reels
    .map((reel) => {
      const flags = [
        badge('reel', 'blue'),
        reel.playCount === null ? '' : `<span class="text-secondary fs-6">${reel.playCount} ▶</span>`,
      ].join('');
      const href = reel.permalink.length === 0 ? null : esc(reel.permalink);
      return tile(thumb(reel.r2Key, reel.posterUrl), href, flags, reel.takenAt);
    })
    .join('');
  return `<div class="subheader mt-3 mb-1">Reels</div><div class="row row-cards">${tiles}</div>`;
}

export function renderSocialCard(store: EntityStore, entityId: string, data: SocialRenderData): string {
  if (relevantHandles(store, entityId).length === 0) {
    return '';
  }
  const userIds = socialUserIds(store, entityId, data.profiles);
  const posts = data.posts.filter((post) => userIds.includes(post.userId)).slice(0, SOCIAL_REPORT_LIMIT);
  const stories = data.stories.filter((story) => userIds.includes(story.userId)).slice(0, SOCIAL_REPORT_LIMIT);
  const reels = data.reels.filter((reel) => userIds.includes(reel.userId)).slice(0, SOCIAL_REPORT_LIMIT);
  const body = `${renderStories(stories)}${renderPosts(posts)}${renderReels(reels)}`;
  if (body === '') {
    return card({
      title: 'Social',
      body: emptyState('Brak danych', 'Nie pobrano jeszcze postów i stories.'),
      collapsed: true,
    });
  }
  return card({ title: 'Social', body, collapsed: true });
}
