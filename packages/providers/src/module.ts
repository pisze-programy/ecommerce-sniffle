import type { Logger } from "./logger.ts";
import type { Provider, ProviderConfig, StockRevealer } from "./types.ts";

export interface DirectFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DirectFetchOptions {
  readonly maxBytes?: number;
}

export type DirectFetch = (
  input: string | URL | Request,
  init?: RequestInit,
  options?: DirectFetchOptions,
) => Promise<DirectFetchResponse>;

export interface ProviderDeps {
  readonly logger: Logger;
  readonly directFetch?: DirectFetch;
}

export interface ProviderModule {
  readonly config: ProviderConfig;
  readonly build: (deps: ProviderDeps) => Provider | StockRevealer;
}
