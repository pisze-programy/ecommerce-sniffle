import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'hdrey'),
  'config hdrey'
);

export const hdreyModule: ProviderModule = {
  config,
  build(deps) {
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
