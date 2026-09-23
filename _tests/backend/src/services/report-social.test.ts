import { describe, expect, it } from 'vitest';
import type { EntityStore } from '../../../../backend/src/entities.ts';
import type {
  SocialPost,
  SocialProfile,
  SocialProfileDay,
  SocialReel,
  SocialStory,
} from '../../../../packages/providers/src/social/types.ts';
import {
  entitySocialUserIds,
  renderSocialCard,
  SOCIAL_REPORT_LIMIT,
  socialUserIds,
} from '../../../../backend/src/services/report/social.ts';
import type { SocialRenderData } from '../../../../backend/src/services/report/social.ts';

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

function data(overrides: Partial<SocialRenderData>): SocialRenderData {
  return { profiles: profiles(), posts: [], stories: [], reels: [], profileDays: [], ...overrides };
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

function profileDay(userId: string, overrides: Partial<SocialProfileDay>): SocialProfileDay {
  return {
    platform: 'instagram',
    userId,
    day: '2026-08-30',
    handle: 'karolina_pisarek',
    followers: 149095,
    uploads: 1021,
    avgLikes: 1065,
    avgComments: 54,
    engagement: 0.0075,
    postsPerDay: 0.015,
    postsPerWeek: 0.102,
    score: 6,
    isVerified: false,
    category: null,
    adReelPrice: 0,
    adPostPrice: 0,
    adStoryPrice: 0,
    country: 'Worldwide',
    keywords: null,
    fetchedAt: '2026-08-30T11:00:00.000Z',
    ...overrides,
  };
}

describe('socialUserIds', () => {
  it('maps the entity and person handles to user ids', () => {
    expect(socialUserIds(store(), 'hdrey-group', profiles())).toEqual(['1', '2']);
  });

  it('returns nothing for a shop without instagram handles', () => {
    expect(socialUserIds(store(), 'other', profiles())).toEqual([]);
  });
});

describe('entitySocialUserIds', () => {
  it('keeps the company handles and drops the related persons', () => {
    expect(entitySocialUserIds(store(), 'hdrey-group', profiles())).toEqual(['1']);
  });
});

describe('renderSocialCard', () => {
  it('renders an empty state when the day has no items', () => {
    expect(renderSocialCard(store(), 'hdrey-group', data({}))).toContain('Brak danych');
  });

  it('returns nothing for a shop without instagram handles', () => {
    expect(renderSocialCard(store(), 'other', data({}))).toBe('');
  });

  it('makes the whole post tile a link and uses the r2 poster', () => {
    const html = renderSocialCard(
      store(),
      'hdrey-group',
      data({
        posts: [post('1', 'social/instagram/1/posts/p-1/poster.jpg', 'https://www.instagram.com/p/ABC/', null)],
      })
    );
    expect(html).toContain('href="https://www.instagram.com/p/ABC/"');
    expect(html).toContain('/media/social/instagram/1/posts/p-1/poster.jpg');
    expect(html).not.toContain('https://cdn/1.jpg');
  });

  it('falls back to the poster url when r2 is null', () => {
    const html = renderSocialCard(
      store(),
      'hdrey-group',
      data({ posts: [post('1', null, 'https://www.instagram.com/p/ABC/', 'https://cdn/fallback.jpg')] })
    );
    expect(html).toContain('https://cdn/fallback.jpg');
  });

  it('labels the shop and the related person', () => {
    const html = renderSocialCard(
      store(),
      'hdrey-group',
      data({
        posts: [
          post('1', 'k1', 'https://www.instagram.com/p/ABC/', null),
          post('2', 'k2', 'https://www.instagram.com/p/DEF/', null),
        ],
      })
    );
    expect(html).toContain('Hdrey Group');
    expect(html).toContain('Karolina Pisarek (Właściciel)');
    expect(html).toContain('@hdrey_pl');
  });

  it('links a story to the full poster image', () => {
    const html = renderSocialCard(store(), 'hdrey-group', data({ stories: [story('2', true)] }));
    expect(html).toContain('Stories');
    expect(html).toContain('wideo');
    expect(html).toContain('href="https://cdn/story.jpg"');
    expect(html).toContain('@karolina_pisarek');
  });

  it('links a stored story to the media route', () => {
    const stored: SocialStory = { ...story('1', false), r2Key: 'social/instagram/1/stories/s-1/poster.jpg' };
    const html = renderSocialCard(store(), 'hdrey-group', data({ stories: [stored] }));
    expect(html).toContain('href="/media/social/instagram/1/stories/s-1/poster.jpg"');
  });

  it('keeps the strip inside the display limit', () => {
    const items: SocialPost[] = [];
    for (let index = 0; index < SOCIAL_REPORT_LIMIT + 5; index += 1) {
      items.push(post('1', `k${index}`, `https://www.instagram.com/p/X${index}/`, null));
    }
    const html = renderSocialCard(store(), 'hdrey-group', data({ posts: items }));
    const anchors = html.split('href="https://www.instagram.com/p/').length - 1;
    expect(anchors).toBe(SOCIAL_REPORT_LIMIT);
  });

  it('renders a reel link', () => {
    const html = renderSocialCard(store(), 'hdrey-group', data({ reels: [reel('1')] }));
    expect(html).toContain('href="https://www.instagram.com/p/REEL/"');
    expect(html).toContain('Reels');
  });

  it('renders the daily profile block with the owner label', () => {
    const html = renderSocialCard(store(), 'hdrey-group', data({ profileDays: [profileDay('2', {})] }));
    expect(html).toContain('Profil');
    expect(html).toContain('@karolina_pisarek');
    expect(html).toContain('Karolina Pisarek (Właściciel)');
    expect(html).toContain('Obserwujący: 149 095');
    expect(html).toContain('Zaangażowanie: 0.75%');
    expect(html).toContain('Śr. polubienia: 1 065');
    expect(html).toContain('Kraj: Worldwide');
  });

  it('shows the profile block when the day has no media', () => {
    const html = renderSocialCard(store(), 'hdrey-group', data({ profileDays: [profileDay('1', {})] }));
    expect(html).not.toContain('Brak danych');
    expect(html).toContain('Profil');
  });

  it('shows the ad rates only when they are above zero', () => {
    const zero = renderSocialCard(store(), 'hdrey-group', data({ profileDays: [profileDay('1', {})] }));
    expect(zero).not.toContain('Stawki');
    const paid = renderSocialCard(
      store(),
      'hdrey-group',
      data({ profileDays: [profileDay('1', { adReelPrice: 2500, adPostPrice: 1800, adStoryPrice: 600 })] })
    );
    expect(paid).toContain('Stawki: reel 2 500');
    expect(paid).toContain('post 1 800');
    expect(paid).toContain('story 600');
  });

  it('shows a dash for a missing number', () => {
    const html = renderSocialCard(
      store(),
      'hdrey-group',
      data({ profileDays: [profileDay('1', { followers: null, engagement: null, postsPerWeek: null })] })
    );
    expect(html).toContain('Obserwujący: —');
    expect(html).toContain('Zaangażowanie: —');
  });
});
