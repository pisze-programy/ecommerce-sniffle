import { describe, expect, it } from 'vitest';
import type { EntityStore } from '../../../../backend/src/entities.ts';
import type {
  SocialPost,
  SocialProfile,
  SocialReel,
  SocialStory,
} from '../../../../packages/providers/src/social/types.ts';
import {
  renderSocialCard,
  SOCIAL_REPORT_LIMIT,
  socialUserIds,
} from '../../../../backend/src/services/report/social.ts';

function store(): EntityStore {
  return {
    entities: [
      {
        id: 'hdrey-group',
        name: 'Hdrey Group',
        kind: 'company',
        krs: null,
        regon: null,
        nip: null,
        bizraportUrl: null,
        socials: [{ platform: 'instagram', handle: 'hdrey_pl', url: 'https://ig/hdrey_pl' }],
        metaPageId: null,
        googleAdvertiserId: null,
        cpmOverride: null,
        logoKey: null,
        bgKey: null,
      },
      {
        id: 'other',
        name: 'Other Shop',
        kind: 'company',
        krs: null,
        regon: null,
        nip: null,
        bizraportUrl: null,
        socials: [],
        metaPageId: null,
        googleAdvertiserId: null,
        cpmOverride: null,
        logoKey: null,
        bgKey: null,
      },
    ],
    persons: [
      {
        id: 'karolina',
        name: 'Karolina Pisarek',
        linkedinUrl: null,
        avatarKey: null,
        socials: [{ platform: 'instagram', handle: 'karolina_pisarek', url: 'https://ig/karolina_pisarek' }],
      },
    ],
    personRelations: [{ personId: 'karolina', entityId: 'hdrey-group', role: 'owner', from: null, to: null }],
    entityRelations: [],
  };
}

function profiles(): readonly SocialProfile[] {
  return [
    { platform: 'instagram', userId: '1', handle: 'hdrey_pl', fullName: 'Hdrey' },
    { platform: 'instagram', userId: '2', handle: 'karolina_pisarek', fullName: 'Karolina' },
  ];
}

function post(userId: string, r2Key: string | null, permalink: string, posterUrl: string | null): SocialPost {
  return {
    platform: 'instagram',
    id: `p-${userId}`,
    userId,
    shortcode: 'ABC',
    permalink,
    type: 'photo',
    isReel: false,
    takenAt: '2026-08-30T10:00:00.000Z',
    caption: 'hello world',
    likes: 10,
    comments: 2,
    videoViews: null,
    posterUrl,
    r2Key,
    fetchedAt: '2026-08-30T11:00:00.000Z',
  };
}

function story(userId: string, isVideo: boolean): SocialStory {
  return {
    platform: 'instagram',
    id: `s-${userId}`,
    userId,
    mediaType: isVideo ? 'video' : 'photo',
    isVideo,
    takenAt: '2026-08-30T09:00:00.000Z',
    expiringAt: '2026-08-31T09:00:00.000Z',
    posterUrl: 'https://cdn/story.jpg',
    r2Key: null,
    fetchedAt: '2026-08-30T11:00:00.000Z',
  };
}

function reel(userId: string): SocialReel {
  return {
    platform: 'instagram',
    id: `r-${userId}`,
    userId,
    shortcode: 'REEL',
    permalink: 'https://www.instagram.com/p/REEL/',
    takenAt: '2026-08-30T08:00:00.000Z',
    likeCount: 5,
    commentCount: 1,
    playCount: 900,
    videoViewCount: 800,
    posterUrl: 'https://cdn/reel.jpg',
    r2Key: null,
    fetchedAt: '2026-08-30T11:00:00.000Z',
  };
}

const EMPTY = { profiles: [], posts: [], stories: [], reels: [] } as const;

describe('socialUserIds', () => {
  it('maps the entity and person handles to user ids', () => {
    expect(socialUserIds(store(), 'hdrey-group', profiles())).toEqual(['1', '2']);
  });

  it('returns nothing for a shop without instagram handles', () => {
    expect(socialUserIds(store(), 'other', profiles())).toEqual([]);
  });
});

describe('renderSocialCard', () => {
  it('renders an empty state when the day has no items', () => {
    const html = renderSocialCard(store(), 'hdrey-group', { profiles: profiles(), ...EMPTY });
    expect(html).toContain('Brak danych');
  });

  it('returns nothing for a shop without instagram handles', () => {
    expect(renderSocialCard(store(), 'other', { profiles: profiles(), ...EMPTY })).toBe('');
  });

  it('makes the whole post tile a link and uses the r2 poster', () => {
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: [post('1', 'social/instagram/1/posts/p-1/poster.jpg', 'https://www.instagram.com/p/ABC/', null)],
      stories: [],
      reels: [],
    });
    expect(html).toContain('href="https://www.instagram.com/p/ABC/"');
    expect(html).toContain('/media/social/instagram/1/posts/p-1/poster.jpg');
    expect(html).not.toContain('https://cdn/1.jpg');
  });

  it('falls back to the poster url when r2 is null', () => {
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: [post('1', null, 'https://www.instagram.com/p/ABC/', 'https://cdn/fallback.jpg')],
      stories: [],
      reels: [],
    });
    expect(html).toContain('https://cdn/fallback.jpg');
  });

  it('labels the shop and the related person', () => {
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: [
        post('1', 'k1', 'https://www.instagram.com/p/ABC/', null),
        post('2', 'k2', 'https://www.instagram.com/p/DEF/', null),
      ],
      stories: [],
      reels: [],
    });
    expect(html).toContain('Hdrey Group');
    expect(html).toContain('Karolina Pisarek (Właściciel)');
    expect(html).toContain('@hdrey_pl');
  });

  it('renders a story without a link', () => {
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: [],
      stories: [story('2', true)],
      reels: [],
    });
    expect(html).toContain('Stories');
    expect(html).toContain('wideo');
    expect(html).not.toContain('<a class="card card-sm social-tile');
  });

  it('keeps the strip inside the display limit', () => {
    const items: SocialPost[] = [];
    for (let index = 0; index < SOCIAL_REPORT_LIMIT + 5; index += 1) {
      items.push(post('1', `k${index}`, `https://www.instagram.com/p/X${index}/`, null));
    }
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: items,
      stories: [],
      reels: [],
    });
    const anchors = html.split('href="https://www.instagram.com/p/').length - 1;
    expect(anchors).toBe(SOCIAL_REPORT_LIMIT);
  });

  it('renders a reel link', () => {
    const html = renderSocialCard(store(), 'hdrey-group', {
      profiles: profiles(),
      posts: [],
      stories: [],
      reels: [reel('1')],
    });
    expect(html).toContain('href="https://www.instagram.com/p/REEL/"');
    expect(html).toContain('Reels');
  });
});
