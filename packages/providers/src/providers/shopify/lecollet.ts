import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { parseRestockRocketQuantity } from './implementations/embedded-inventory.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';
import { buildEmbeddedSource } from './stock-source.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'lecollet'),
  'config lecollet'
);

// V2 reads the true stock from the product page. The config stockSource
// picks the builder. Set stockSource back to 'ucp-inventory' to roll
// back to V1.
export const lecolletModule: ProviderModule = {
  config,
  build(deps) {
    const embedded = buildEmbeddedSource(config, deps, parseRestockRocketQuantity);
    if (embedded !== null) {
      return embedded;
    }
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
