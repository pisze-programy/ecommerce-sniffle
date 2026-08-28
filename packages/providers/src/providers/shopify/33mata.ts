import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildMcpInventoryProvider } from './implementations/mcp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === '33mata'),
  'config 33mata'
);

export const mata33Module: ProviderModule = {
  config,
  build(deps) {
    return buildMcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
