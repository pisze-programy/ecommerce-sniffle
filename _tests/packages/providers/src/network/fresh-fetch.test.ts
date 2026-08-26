import { describe, expect, it, vi } from 'vitest';
import { createFreshFetch } from '../../../../../packages/providers/src/network/fresh-fetch.ts';
import type {
  Closeable,
  FreshFetchDeps,
  FreshResponse,
} from '../../../../../packages/providers/src/network/fresh-fetch.ts';

function fakeResponse(status: number, body: string): FreshResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    json: async () => JSON.parse(body),
    body: null,
  };
}

interface FakeAgent extends Closeable {
  readonly proxyUrl: string | null;
}

function captureDeps(agents: FakeAgent[]): FreshFetchDeps {
  return {
    fetchImpl: vi.fn(async (_input, _init, _dispatcher) => fakeResponse(200, '{}')),
    makeAgent: vi.fn((proxyUrl: string | null) => {
      const agent: FakeAgent = {
        proxyUrl,
        close: vi.fn(async () => {}),
      };
      agents.push(agent);
      return agent;
    }),
  };
}

describe('createFreshFetch', () => {
  it('creates one agent per request without a proxy', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const freshFetch = createFreshFetch(null, deps);
    await freshFetch('https://x.pl/a', { method: 'GET' });
    await freshFetch('https://x.pl/b', { method: 'GET' });
    expect(agents).toHaveLength(2);
    expect(agents[0]?.proxyUrl).toBeNull();
    expect(agents[1]?.proxyUrl).toBeNull();
  });

  it('creates one proxy agent per request when a proxy is set', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const freshFetch = createFreshFetch('http://proxy:80', deps);
    await freshFetch('https://x.pl/a', { method: 'POST' });
    expect(agents).toHaveLength(1);
    expect(agents[0]?.proxyUrl).toBe('http://proxy:80');
  });

  it('closes every agent after the request', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const freshFetch = createFreshFetch(null, deps);
    await freshFetch('https://x.pl/a', { method: 'GET' });
    expect(agents[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('closes the agent when the fetch fails', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const failingDeps: FreshFetchDeps = {
      ...deps,
      fetchImpl: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const freshFetch = createFreshFetch(null, failingDeps);
    await expect(freshFetch('https://x.pl/a', { method: 'GET' })).rejects.toThrow('network down');
    expect(agents).toHaveLength(1);
    expect(agents[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('returns the response details from the underlying fetch', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const freshFetch = createFreshFetch(null, deps);
    const response = await freshFetch('https://x.pl/a', { method: 'GET' });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{}');
  });

  it('forwards the init and the agent to the underlying fetch', async () => {
    const agents: FakeAgent[] = [];
    const deps = captureDeps(agents);
    const freshFetch = createFreshFetch(null, deps);
    await freshFetch('https://x.pl/a', { method: 'POST', body: 'abc' });
    const fetchImpl = vi.mocked(
      deps.fetchImpl as (input: string, init: RequestInit, dispatcher: unknown) => Promise<FreshResponse>
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe('https://x.pl/a');
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[2]).toBe(agents[0]);
  });
});
