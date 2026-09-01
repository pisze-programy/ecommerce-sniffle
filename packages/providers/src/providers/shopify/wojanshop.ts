import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'wojanshop'),
  'config wojanshop'
);

export const wojanshopModule: ProviderModule = {
  config,
  build(deps) {
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
