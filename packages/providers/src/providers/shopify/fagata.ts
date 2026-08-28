import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildMcpInventoryProvider } from './implementations/mcp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'fagata'),
  'config fagata'
);

export const fagataModule: ProviderModule = {
  config,
  build(deps) {
    return buildMcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
