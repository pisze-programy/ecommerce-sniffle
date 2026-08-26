import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';
import type { WrappedFetch } from './manager.ts';

export interface FreshResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  readonly body: { cancel(): Promise<void> } | null;
}

export interface Closeable {
  close(): Promise<void>;
}

type FetchImpl = (input: string, init: RequestInit, dispatcher: unknown) => Promise<FreshResponse>;

type MakeAgent = (proxyUrl: string | null) => Closeable;

export interface FreshFetchDeps {
  readonly fetchImpl?: FetchImpl;
  readonly makeAgent?: MakeAgent;
}

const defaultFetchImpl: FetchImpl = (input, init, dispatcher) =>
  undiciFetch(input, { ...init, dispatcher } as Parameters<typeof undiciFetch>[1]);

const defaultMakeAgent: MakeAgent = (proxyUrl) => {
  if (proxyUrl === null) {
    return new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
  }
  return new ProxyAgent(proxyUrl);
};

export function createFreshFetch(proxyUrl: string | null, deps: FreshFetchDeps = {}): WrappedFetch {
  const fetchImpl = deps.fetchImpl ?? defaultFetchImpl;
  const makeAgent = deps.makeAgent ?? defaultMakeAgent;
  return async (input, init) => {
    const agent = makeAgent(proxyUrl);
    try {
      const response = await fetchImpl(String(input), init ?? {}, agent);
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer(),
        json: () => response.json(),
        body: response.body,
      };
    } finally {
      await agent.close();
    }
  };
}
