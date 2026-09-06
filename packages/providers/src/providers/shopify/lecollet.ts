import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildEmbeddedInventoryProvider, parseRestockRocketQuantity } from './implementations/embedded-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'lecollet'),
  'config lecollet'
);

export const lecolletModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseRestockRocketQuantity, deps.directFetch);
  },
};
