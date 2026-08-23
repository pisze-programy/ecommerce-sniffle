import type { Logger } from "./logger.ts";
import type { Provider, ProviderConfig, StockRevealer } from "./types.ts";

export interface ProviderDeps {
  readonly logger: Logger;
}

export interface ProviderModule {
  readonly config: ProviderConfig;
  readonly build: (deps: ProviderDeps) => Provider | StockRevealer;
}
