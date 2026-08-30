// Renders the Social card: recent IG posts and stories of the shop's
// entity and its related persons. Sponsorship flags become badges.
// Known tagged handles become loose connections.

import type { EntityStore } from '../../entities.ts';
import { findEntity, findPerson } from '../../entities.ts';
import type { SocialPost, SocialProfile, SocialStory } from '../social/types.ts';
import { badge, card, emptyState, esc } from '../report-components.ts';

export interface SocialRenderData {
  readonly profiles: readonly SocialProfile[];
  readonly posts: readonly SocialPost[];
  readonly stories: readonly SocialStory[];
}

function knownHandleLabels(store: EntityStore): Map<string, string> {
  const labels = new Map<string, string>();
  for (const entity of store.entities) {
    for (const link of entity.socials) {
      if (link.platform === 'instagram') {
        labels.set(link.handle, entity.name);
      }
    }
  }
  for (const person of store.persons) {
    for (const link of person.socials) {
      if (link.platform === 'instagram') {
        labels.set(link.handle, person.name);
      }
    }
  }
  return labels;
}

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

function looseBadges(handles: readonly string[], known: ReadonlyMap<string, string>): string {
  const names = new Set<string>();
  for (const handle of handles) {
    const label = known.get(handle);
    if (label !== undefined) {
      names.add(label);
    }
  }
  return [...names].map((name) => badge(`→ ${name}`, 'green')).join(' ');
}

function thumb(post: SocialPost | SocialStory): string {
  if (post.r2Key !== null) {
    return `/media/${esc(post.r2Key)}`;
  }
  const url = post.mediaUrls[0];
  return url === undefined ? '' : esc(url);
}

function renderStories(stories: readonly SocialStory[], known: ReadonlyMap<string, string>): string {
  if (stories.length === 0) {
    return '';
  }
  const tiles = stories
    .map((story) => {
      const flags = [
        story.isPaidPartnership ? badge('sponsorowane', 'yellow') : '',
        story.isCommercial ? badge('reklama', 'blue') : '',
        story.hasCtaSticker ? badge('CTA', 'blue') : '',
      ].join('');
      const loose = looseBadges(story.mentions, known);
      const image = thumb(story);
      const imageHtml =
        image === ''
          ? '<div class="card-body"><p class="text-secondary fs-6">brak mediów</p></div>'
          : `<img class="card-img-top" src="${image}" loading="lazy" alt="story">`;
      return `<div class="col-6 col-lg-3">
  <div class="card card-sm h-100">
    ${imageHtml}
    <div class="card-body p-2">
      <div class="d-flex flex-wrap gap-1">${flags}${loose}</div>
      <div class="text-secondary fs-6">${esc(story.takenAt.slice(0, 10))}</div>
    </div>
  </div>
</div>`;
    })
    .join('');
  return `<div class="subheader mt-3 mb-1">Stories</div><div class="row row-cards">${tiles}</div>`;
}

function renderPosts(posts: readonly SocialPost[], known: ReadonlyMap<string, string>): string {
  if (posts.length === 0) {
    return '';
  }
  const tiles = posts
    .map((post) => {
      const flags = [
        post.isPaidPartnership ? badge('sponsorowane', 'yellow') : '',
        post.isCommercial ? badge('reklama', 'blue') : '',
      ].join('');
      const loose = looseBadges(post.taggedUsers, known);
      const image = thumb(post);
      const href = `https://www.instagram.com/p/${esc(post.shortcode)}/`;
      const imageHtml =
        image === ''
          ? '<div class="card-body"><p class="text-secondary fs-6">brak mediów</p></div>'
          : `<a href="${href}" target="_blank" rel="noopener"><img class="card-img-top" src="${image}" loading="lazy" alt="post"></a>`;
      const caption =
        post.caption === null || post.caption.length === 0
          ? ''
          : `<div class="text-secondary fs-6 text-truncate">${esc(post.caption)}</div>`;
      return `<div class="col-6 col-lg-3">
  <div class="card card-sm h-100">
    ${imageHtml}
    <div class="card-body p-2">
      <div class="d-flex flex-wrap gap-1">${flags}${loose}</div>
      <div class="text-secondary fs-6">${esc(post.takenAt.slice(0, 10))}</div>
      ${caption}
    </div>
  </div>
</div>`;
    })
    .join('');
  return `<div class="subheader mt-3 mb-1">Posty</div><div class="row row-cards">${tiles}</div>`;
}

export function renderSocialCard(store: EntityStore, entityId: string, data: SocialRenderData): string {
  const known = knownHandleLabels(store);
  if (relevantHandles(store, entityId).length === 0) {
    return '';
  }
  const userIds = socialUserIds(store, entityId, data.profiles);
  const posts = data.posts.filter((post) => userIds.includes(post.userId)).slice(0, 8);
  const stories = data.stories.filter((story) => userIds.includes(story.userId)).slice(0, 8);
  const body = `${renderStories(stories, known)}${renderPosts(posts, known)}`;
  if (body === '') {
    return card({
      title: 'Social',
      body: emptyState('Brak danych', 'Nie pobrano jeszcze postów i stories.'),
      collapsed: true,
    });
  }
  return card({ title: 'Social', body, collapsed: true });
}
