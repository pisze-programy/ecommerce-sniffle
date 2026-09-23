import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../packages/providers/src/logger.ts';
import {
  INFLACT_DEFAULT_SECRET,
  MIN_REQUEST_INTERVAL_MS,
  inflactAnalytics,
  inflactPosts,
  inflactReels,
  inflactStories,
  inflactStoriesCheck,
  initInflact,
  setMinRequestIntervalMs,
} from '../../../../../packages/providers/src/social/inflact.ts';
import { collectSocial } from '../../../../../packages/providers/src/social/collect.ts';

beforeEach(() => {
  setMinRequestIntervalMs(0);
});

afterEach(() => {
  setMinRequestIntervalMs(MIN_REQUEST_INTERVAL_MS);
  vi.unstubAllGlobals();
});

const PAGE_HTML =
  '<html><head><meta name="csrf-token" content="CSRF123">' +
  '<script>window.serverTimeDelta = Math.floor(Date.now() / 1000) - ' +
  String(Math.floor(Date.now() / 1000)) +
  ';</script></head></html>';

interface Captured {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubRouting(routes: (url: string) => Response | null, captured: Captured[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const headers: Record<string, string> = {};
      const raw = init?.headers;
      if (raw !== undefined && !(raw instanceof Headers) && !Array.isArray(raw)) {
        for (const key of Object.keys(raw)) {
          headers[key] = String((raw as Record<string, string>)[key]);
        }
      }
      captured.push({ url, headers, body: typeof init?.body === 'string' ? init.body : '' });
      const response = routes(url);
      if (response !== null) {
        return response;
      }
      return new Response(PAGE_HTML, {
        status: 200,
        headers: { 'set-cookie': 'ingram_sid=abc; path=/', 'content-type': 'text/html' },
      });
    })
  );
}

function inflactRoutes(url: string): Response | null {
  if (url.includes('/stories/check/')) {
    return jsonResponse({ status: 'success', data: { hasStories: true } });
  }
  if (url.includes('/stories/')) {
    return jsonResponse({
      data: { stories: [{ id: 1, displayUrl: 'u1', takenAt: 1, expiringAt: 2, isVideo: false, owner: { pk: 9 } }] },
    });
  }
  if (url.includes('/reels/')) {
    return jsonResponse({
      data: { reels: [{ id: 2, shortCode: 'R', createdAt: 1, imageUrl: 'u2', likeCount: 1 }] },
    });
  }
  if (url.includes('/posts/')) {
    return jsonResponse({
      data: {
        posts: {
          data: {
            user: {
              edge_owner_to_timeline_media: {
                page_info: { has_next_page: false, end_cursor: null },
                edges: [
                  {
                    node: {
                      id: 3,
                      shortcode: 'P',
                      __typename: 'GraphImage',
                      taken_at_timestamp: 1790000000,
                      display_url: 'u3',
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });
  }
  if (url.includes('/analytics/')) {
    return jsonResponse({
      data: {
        profile: {
          id: 9,
          username: 'x',
          name: 'X',
          engagement: { followers: 1 },
          publishing: {},
          advertisement: {},
        },
      },
    });
  }
  return null;
}

describe('rate limit', () => {
  it('keeps one second between the requests of one session', async () => {
    setMinRequestIntervalMs(MIN_REQUEST_INTERVAL_MS);
    const times: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        times.push(Date.now());
        const response = inflactRoutes(String(input));
        if (response !== null) {
          return response;
        }
        return new Response(PAGE_HTML, {
          status: 200,
          headers: { 'set-cookie': 'ingram_sid=abc; path=/', 'content-type': 'text/html' },
        });
      })
    );
    const session = await initInflact(createLogger(() => {}));
    await inflactReels(
      session,
      'x',
      createLogger(() => {})
    );
    await inflactReels(
      session,
      'x',
      createLogger(() => {})
    );
    expect(times.length).toBeGreaterThanOrEqual(2);
    const gap = times[times.length - 1]! - times[times.length - 2]!;
    expect(gap).toBeGreaterThanOrEqual(999);
  });
});

describe('initInflact', () => {
  it('reads the csrf token and the session cookie', async () => {
    const captured: Captured[] = [];
    stubRouting(() => null, captured);
    const session = await initInflact(createLogger(() => {}));
    expect(session.csrf).toBe('CSRF123');
    expect(session.cookie).toContain('ingram_sid=abc');
    expect(session.secret).toBe(INFLACT_DEFAULT_SECRET);
    expect(session.clientId).toHaveLength(32);
  });
});

describe('signed requests', () => {
  it('sends a valid HMAC signature', async () => {
    const captured: Captured[] = [];
    stubRouting(
      (url) =>
        url.includes('/stories/check/') ? jsonResponse({ status: 'success', data: { hasStories: true } }) : null,
      captured
    );
    const session = await initInflact(createLogger(() => {}));
    const has = await inflactStoriesCheck(
      session,
      'daag__torebki',
      createLogger(() => {})
    );
    expect(has).toBe(true);
    const request = captured.find((entry) => entry.url.includes('/stories/check/'));
    expect(request).toBeDefined();
    const token = request?.headers['X-Client-Token'] ?? '';
    const signature = request?.headers['X-Client-Signature'] ?? '';
    const message = Buffer.from(token, 'base64').toString('utf8');
    const expected = createHmac('sha256', INFLACT_DEFAULT_SECRET).update(message).digest('hex');
    expect(signature).toBe(expected);
    expect(message).toContain('clientId');
    expect(message).toContain('nonce');
  });
});

describe('parsers', () => {
  function storyBody(): string {
    return (
      '{"status":"success","data":{"stories":[{"id":3992438281361201390,' +
      '"displayUrl":"https://cdn.inflact.com/a.jpg","videoUrl":null,' +
      '"takenAt":1790155752,"expiringAt":1790242152,"isVideo":false,' +
      '"owner":{"pk":28388909189}}]}}'
    );
  }

  it('parses a story', async () => {
    const captured: Captured[] = [];
    stubRouting(
      (url) =>
        url.includes('/stories/') && !url.includes('check') ? new Response(storyBody(), { status: 200 }) : null,
      captured
    );
    const session = await initInflact(createLogger(() => {}));
    const stories = await inflactStories(
      session,
      'daag__torebki',
      createLogger(() => {})
    );
    expect(stories).toHaveLength(1);
    expect(stories[0]?.id).toBe('3992438281361201390');
    expect(stories[0]?.ownerId).toBe('28388909189');
    expect(stories[0]?.isVideo).toBe(false);
  });

  it('parses a post with a permalink', async () => {
    const captured: Captured[] = [];
    const body = {
      status: 'success',
      data: {
        posts: {
          data: {
            user: {
              edge_owner_to_timeline_media: {
                page_info: { has_next_page: true, end_cursor: 'CURSOR1' },
                edges: [
                  {
                    node: {
                      id: 3990204290098353079,
                      shortcode: 'ABC',
                      __typename: 'GraphVideo',
                      taken_at_timestamp: 1790000000,
                      display_url: 'https://cdn.inflact.com/p.jpg',
                      video_view_count: 100,
                      edge_media_preview_like: { count: 5 },
                      edge_media_to_comment: { count: 2 },
                      edge_media_to_caption: { edges: [{ node: { text: 'hello' } }] },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };
    stubRouting((url) => (url.includes('/posts/') ? jsonResponse(body) : null), captured);
    const session = await initInflact(createLogger(() => {}));
    const page = await inflactPosts(
      session,
      'daag__torebki',
      '',
      createLogger(() => {})
    );
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]?.permalink).toBe('https://www.instagram.com/p/ABC/');
    expect(page.posts[0]?.likes).toBe(5);
    expect(page.cursor).toBe('CURSOR1');
    expect(page.hasNext).toBe(true);
  });

  it('parses a reel', async () => {
    const captured: Captured[] = [];
    const body = {
      status: 'success',
      data: {
        reels: [
          {
            id: 3788092051020388927,
            shortCode: 'DSSAaZ1jRo_',
            createdAt: 1765796259,
            imageUrl: 'https://cdn.inflact.com/r.jpg',
            likeCount: 10,
            commentCount: 1,
            playCount: 900,
            videoViewCount: 800,
          },
        ],
      },
    };
    stubRouting((url) => (url.includes('/reels/') ? jsonResponse(body) : null), captured);
    const session = await initInflact(createLogger(() => {}));
    const reels = await inflactReels(
      session,
      'daag__torebki',
      createLogger(() => {})
    );
    expect(reels).toHaveLength(1);
    expect(reels[0]?.permalink).toBe('https://www.instagram.com/p/DSSAaZ1jRo_/');
    expect(reels[0]?.playCount).toBe(900);
  });

  it('parses the analytics', async () => {
    const captured: Captured[] = [];
    const body = {
      status: 'success',
      data: {
        profile: {
          id: 28388909189,
          username: 'daag__torebki',
          name: 'DAAG',
          score: 6,
          isVerified: false,
          category: null,
          engagement: { value: 0.0075, followers: 149095, uploads: 1021, avgLikes: 1065, avgComments: 54 },
          publishing: { postsPerDay: { value: 0.015 }, postsPerWeek: { value: 0.102 } },
          advertisement: { reel: { value: 0 }, post: { value: 0 }, story: { value: 0 } },
          globalStats: [{ title: 'Worldwide' }],
          keywords: { top: {} },
        },
      },
    };
    stubRouting((url) => (url.includes('/analytics/') ? jsonResponse(body) : null), captured);
    const session = await initInflact(createLogger(() => {}));
    const analytics = await inflactAnalytics(
      session,
      'daag__torebki',
      createLogger(() => {})
    );
    expect(analytics?.id).toBe('28388909189');
    expect(analytics?.followers).toBe(149095);
    expect(analytics?.postsPerDay).toBe(0.015);
    expect(analytics?.country).toBe('Worldwide');
  });
});

describe('collectSocial', () => {
  it('maps the responses to a payload', async () => {
    const captured: Captured[] = [];
    stubRouting(inflactRoutes, captured);
    const payload = await collectSocial(
      [{ handle: 'x', ownerKind: 'entity', ownerId: 'e1', seedDay: null, sinceEpoch: null }],
      { logger: createLogger(() => {}) }
    );
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profileDays).toHaveLength(1);
    expect(payload.posts).toHaveLength(1);
    expect(payload.stories).toHaveLength(1);
    expect(payload.reels).toHaveLength(1);
    expect(payload.posts[0]?.permalink).toBe('https://www.instagram.com/p/P/');
  });

  it('streams each handle through the callback and keeps the payload flat', async () => {
    const captured: Captured[] = [];
    stubRouting(inflactRoutes, captured);
    const seen: string[] = [];
    const payload = await collectSocial(
      [
        { handle: 'a', ownerKind: 'entity', ownerId: 'e1', seedDay: null, sinceEpoch: null },
        { handle: 'b', ownerKind: 'entity', ownerId: 'e2', seedDay: null, sinceEpoch: null },
      ],
      {
        logger: createLogger(() => {}),
        concurrency: 1,
        onHandle: async (target, result) => {
          seen.push(`${target.handle}:${result.posts.length}`);
        },
      }
    );
    expect(seen).toEqual(['a:1', 'b:1']);
    expect(payload.profiles).toHaveLength(0);
    expect(payload.posts).toHaveLength(0);
    expect(payload.stories).toHaveLength(0);
    expect(payload.reels).toHaveLength(0);
  });

  it('falls back to the fetch time when the source sends no publish time', async () => {
    const captured: Captured[] = [];
    stubRouting((url) => {
      if (url.includes('/stories/check/')) {
        return jsonResponse({ status: 'success', data: { hasStories: true } });
      }
      if (url.includes('/stories/')) {
        return jsonResponse({
          data: {
            stories: [{ id: 1, displayUrl: 'u1', takenAt: 0, expiringAt: 0, isVideo: false, owner: { pk: 9 } }],
          },
        });
      }
      if (url.includes('/reels/')) {
        return jsonResponse({ data: { reels: [] } });
      }
      if (url.includes('/posts/')) {
        return jsonResponse({
          data: {
            posts: {
              data: {
                user: {
                  edge_owner_to_timeline_media: {
                    page_info: { has_next_page: false, end_cursor: null },
                    edges: [
                      {
                        node: {
                          id: 3,
                          shortcode: 'P',
                          __typename: 'GraphImage',
                          taken_at_timestamp: 0,
                          display_url: 'u3',
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        });
      }
      if (url.includes('/analytics/')) {
        return jsonResponse({
          data: {
            profile: {
              id: 9,
              username: 'x',
              name: 'X',
              engagement: { followers: 1 },
              publishing: {},
              advertisement: {},
            },
          },
        });
      }
      return null;
    }, captured);
    const payload = await collectSocial(
      [{ handle: 'x', ownerKind: 'entity', ownerId: 'e1', seedDay: null, sinceEpoch: null }],
      { logger: createLogger(() => {}) }
    );
    const story = payload.stories[0];
    const post = payload.posts[0];
    expect(story?.takenAt).toBe(story?.fetchedAt);
    expect(story?.takenAt).not.toContain('1970');
    expect(story?.expiringAt).not.toContain('1970');
    expect(post?.takenAt).toBe(post?.fetchedAt);
    expect(post?.takenAt).not.toContain('1970');
  });
});
