import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord } from '@ecommerce-sniffle/providers';
import type { InstagramDeps } from '../../../../backend/src/services/social/instagram.ts';
import { fetchPosts, fetchProfile, fetchStories } from '../../../../backend/src/services/social/instagram.ts';

function makeDeps(): { deps: InstagramDeps; records: LogRecord[] } {
  const records: LogRecord[] = [];
  const logger = createLogger((record) => {
    records.push(record);
  });
  return { deps: { apiKey: 'key', logger }, records };
}

function stubFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

function storyItem(): Record<string, unknown> {
  return {
    pk: '2708068171848798000',
    code: 'CWU_aeCls9N',
    media_type: 2,
    taken_at: 1637046829,
    expiring_at: 1637134085,
    is_paid_partnership: true,
    is_commercial: true,
    is_cta_sticker_available: true,
    reel_mentions: [{ user: { username: 'hdrey_pl' } }],
    image_versions2: { candidates: [{ url: 'https://cdn/1.jpg' }] },
    video_versions: [{ url: 'https://cdn/1.mp4' }],
  };
}

function postNode(): Record<string, unknown> {
  return {
    pk: '2708074171607622648',
    code: 'CWVAxxwFSP4',
    media_type: 1,
    taken_at: 1637047494,
    caption: { text: 'hello #new' },
    is_paid_partnership: true,
    is_commercial: true,
    image_versions2: { candidates: [{ url: 'https://cdn/2.jpg' }] },
    usertags: { in_user_tagged: [{ user: { username: 'hdrey_pl' } }] },
  };
}

describe('instagram scraper', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses stories from a reel response', async () => {
    stubFetch({ reel: { items: [storyItem()] }, status: 'ok' });
    const { deps } = makeDeps();
    const stories = await fetchStories('331874442', deps);
    expect(stories).toHaveLength(1);
    const story = stories[0];
    expect(story?.id).toBe('2708068171848798000');
    expect(story?.mediaType).toBe('video');
    expect(story?.mentions).toEqual(['hdrey_pl']);
    expect(story?.isPaidPartnership).toBe(true);
    expect(story?.hasCtaSticker).toBe(true);
    expect(story?.expiringAt).toMatch(/^2021-11/);
  });

  it('parses posts from the GraphQL edges shape', async () => {
    stubFetch({
      data: { user: { edge_owner_to_timeline_media: { edges: [{ node: postNode() }] } } },
      status: 'ok',
    });
    const { deps } = makeDeps();
    const posts = await fetchPosts('331874442', deps);
    expect(posts).toHaveLength(1);
    const post = posts[0];
    expect(post?.shortcode).toBe('CWVAxxwFSP4');
    expect(post?.type).toBe('photo');
    expect(post?.caption).toBe('hello #new');
    expect(post?.isPaidPartnership).toBe(true);
    expect(post?.taggedUsers).toEqual(['hdrey_pl']);
  });

  it('parses posts from a flat items shape', async () => {
    stubFetch({ items: [postNode()], status: 'ok' });
    const { deps } = makeDeps();
    const posts = await fetchPosts('331874442', deps);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe('2708074171607622648');
  });

  it('returns an empty list for a 204 stories response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    const { deps } = makeDeps();
    expect(await fetchStories('331874442', deps)).toEqual([]);
  });

  it('resolves a profile from user_info', async () => {
    stubFetch({ pk: '331874442', username: 'karolina_pisarek', full_name: 'Karolina' });
    const { deps } = makeDeps();
    const profile = await fetchProfile('karolina_pisarek', deps);
    expect(profile?.userId).toBe('331874442');
    expect(profile?.fullName).toBe('Karolina');
  });

  it('returns null and logs when user_info has no id', async () => {
    stubFetch({});
    const { deps, records } = makeDeps();
    const profile = await fetchProfile('unknown', deps);
    expect(profile).toBeNull();
    expect(records.some((record) => record.level === 'warn' && record.message === 'social.profile.noUserId')).toBe(
      true
    );
  });
});
