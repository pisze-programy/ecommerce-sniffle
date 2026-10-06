import type { ProviderDeps } from '../../module.ts';
import type { Provider, ProviderConfig, StockRevealer } from '../../types.ts';
import { buildEmbeddedGraphqlProvider } from './implementations/embedded-graphql.ts';
import { buildEmbeddedInventoryProvider } from './implementations/embedded-inventory.ts';
import type { InventoryParser } from './implementations/embedded-inventory.ts';

// Picks the embedded V2 source when the config asks for it.
// Returns null when the config asks for the V1 fallback.
// Rollback: set stockSource back to the V1 value in config.ts.
export function buildEmbeddedSource(
  config: ProviderConfig,
  deps: ProviderDeps,
  parser: InventoryParser | null
): Provider | StockRevealer | null {
  if (config.stockSource === 'embedded-graphql') {
    return buildEmbeddedGraphqlProvider(config, deps.logger, deps.directFetch);
  }
  if (config.stockSource === 'embedded-json' && parser !== null) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parser, deps.directFetch);
  }
  return null;
}
