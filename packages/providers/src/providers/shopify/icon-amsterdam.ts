import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { parseKachingInventory } from './implementations/embedded-inventory.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';
import { buildEmbeddedSource } from './stock-source.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'icon-amsterdam'),
  'config icon-amsterdam'
);

// V2 reads the true stock from the product page. The cart cap does not
// apply. See docs/CLAMP-BYPASS.md. Set stockSource back to
// 'ucp-inventory' to roll back to V1.
export const iconAmsterdamModule: ProviderModule = {
  config,
  build(deps) {
    const embedded = buildEmbeddedSource(config, deps, parseKachingInventory);
    if (embedded !== null) {
      return embedded;
    }
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
