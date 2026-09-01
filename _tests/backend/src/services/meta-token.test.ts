import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaTokenExpired } from '../../../../backend/src/index.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubResponse(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  );
}

describe('metaTokenExpired', () => {
  it('reports an expired token when the graph api returns 401', async () => {
    stubResponse(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
    expect(await metaTokenExpired('tok')).toBe(true);
  });

  it('reports an expired token on any auth failure', async () => {
    stubResponse(403, {});
    expect(await metaTokenExpired('tok')).toBe(true);
  });

  it('reports an expired token from an error body on a 200 response', async () => {
    stubResponse(200, { error: { code: 190, message: 'Token has expired' } });
    expect(await metaTokenExpired('tok')).toBe(true);
  });

  it('reports a live token when the call succeeds', async () => {
    stubResponse(200, { id: '123' });
    expect(await metaTokenExpired('tok')).toBe(false);
  });

  it('keeps false on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    expect(await metaTokenExpired('tok')).toBe(false);
  });
});
