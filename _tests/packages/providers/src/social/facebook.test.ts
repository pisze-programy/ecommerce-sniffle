import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../packages/providers/src/logger.ts';
import {
  parseChocodataProfile,
  parseFacebookPage,
  parseFacebookPosts,
  parseFacebookStories,
  setFacebookMinIntervalMs,
} from '../../../../../packages/providers/src/social/facebook.ts';
import { collectSocial } from '../../../../../packages/providers/src/social/collect.ts';

beforeEach(() => {
  setFacebookMinIntervalMs(0);
});

afterEach(() => {
  setFacebookMinIntervalMs(1000);
  vi.unstubAllGlobals();
});

const PAGE_HTML = [
  '<meta property="og:title" content="Laboratorium Pani Domu | Warsaw ">',
  '<meta property="og:description" content="Laboratorium Pani Domu, Warszawa. 540 575 obserwatorów · 8801 osób mówi o tym · 49 użytkowników tu było.">',
  '"delegate_page":{"id":"1527130717525496"}',
  '"post_id":"1503138655179656","creation_time":1790168469',
  '"message":{"text":"Pewnie dobrze znacie nasz bestseller"}',
  '"attachments":[{"media":{"__typename":"Video"',
  '"url":"https:\\/\\/www.facebook.com\\/LaboratoriumPaniDomu\\/videos\\/2372130456932479\\/"',
  '"subscription_target_id":"1503138655179656"',
  '"reaction_count":{"count":10',
  '"comments":{"total_count":2',
  '"video_view_count":2727',
  '"post_id":"1501367052023483","creation_time":1789995685',
  '"message":{"text":"Dbamy o to, by troska o miejsce"',
  '"attachments":[{"media":{"__typename":"Photo"',
  '"url":"https:\\/\\/www.facebook.com\\/LaboratoriumPaniDomu\\/posts\\/1501367052023483\\/"',
  '"subscription_target_id":"1501367052023483"',
  '"reaction_count":{"count":8',
  '"comments":{"total_count":1',
].join(',');

describe('parseFacebookPage', () => {
  it('reads the profile, the posts and the reels', () => {
    const page = parseFacebookPage(PAGE_HTML, 'LaboratoriumPaniDomu');
    expect(page.id).toBe('1527130717525496');
    expect(page.fullName).toBe('Laboratorium Pani Domu');
    expect(page.followers).toBe(540575);
    expect(page.talkingAbout).toBe(8801);
    expect(page.posts).toHaveLength(2);
    const video = page.posts.find((post) => post.isVideo);
    expect(video?.id).toBe('1503138655179656');
    expect(video?.likes).toBe(10);
    expect(video?.comments).toBe(2);
    expect(video?.videoViews).toBe(2727);
    expect(video?.permalink).toContain('/videos/2372130456932479/');
    const photo = page.posts.find((post) => !post.isVideo);
    expect(photo?.caption).toBe('Dbamy o to, by troska o miejsce');
    expect(photo?.likes).toBe(8);
  });

  it('returns no posts when the page sends none', () => {
    const posts = parseFacebookPosts('<meta property="og:title" content="X">');
    expect(posts).toEqual([]);
  });
});

describe('parseFacebookStories', () => {
  it('maps the viewer items', () => {
    const stories = parseFacebookStories({
      ok: true,
      profile: { username: 'x' },
      items: [{ id: '1', created: 1790168462, type: 'image', url: 'https://cdn/1.jpg', thumb: 'https://cdn/t.jpg' }],
    });
    expect(stories).toHaveLength(1);
    expect(stories[0]?.id).toBe('1');
    expect(stories[0]?.isVideo).toBe(false);
    expect(stories[0]?.posterUrl).toBe('https://cdn/t.jpg');
  });

  it('returns nothing on a failed response', () => {
    expect(parseFacebookStories({ ok: false })).toEqual([]);
  });
});

describe('parseChocodataProfile', () => {
  it('reads the followers and the talking-about count', () => {
    const profile = parseChocodataProfile(
      {
        id: '100064506083609',
        username: 'LaboratoriumPaniDomu',
        name: 'Laboratorium Pani Domu | Warsaw',
        about: 'Laboratorium Pani Domu, Warsaw. 540,575 followers · 8,831 talking about this · 49 were here.',
      },
      'LaboratoriumPaniDomu'
    );
    expect(profile?.followers).toBe(540575);
    expect(profile?.talkingAbout).toBe(8831);
  });
});

describe('collectSocial facebook', () => {
  it('collects the facebook profile, the posts, the reels and the stories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('api.chocodata.com')) {
          return new Response(
            JSON.stringify({
              id: '100064506083609',
              name: 'Laboratorium Pani Domu | Warsaw',
              about: 'Laboratorium Pani Domu. 540,575 followers · 8,831 talking about this.',
            }),
            { status: 200 }
          );
        }
        if (url.includes('facebookstoryviewer.com')) {
          return new Response(
            JSON.stringify({
              ok: true,
              items: [{ id: 's1', created: 1790168462, type: 'video', url: 'https://cdn/s.mp4', thumb: null }],
            }),
            { status: 200 }
          );
        }
        return new Response(PAGE_HTML, { status: 200 });
      })
    );
    const payload = await collectSocial(
      [
        {
          platform: 'facebook',
          handle: 'LaboratoriumPaniDomu',
          ownerKind: 'entity',
          ownerId: 'laboratoriumpanidomu',
          seedDay: null,
          sinceEpoch: null,
        },
      ],
      { logger: createLogger(() => {}), facebookKey: 'test-key', concurrency: 1 }
    );
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0]?.platform).toBe('facebook');
    expect(payload.profileDays[0]?.followers).toBe(540575);
    expect(payload.profileDays[0]?.talkingAbout).toBe(8831);
    expect(payload.posts).toHaveLength(1);
    expect(payload.reels).toHaveLength(1);
    expect(payload.stories).toHaveLength(1);
    expect(payload.stories[0]?.platform).toBe('facebook');
  });
});
