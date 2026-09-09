import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildEmbeddedInventoryProvider, parseShopifyXmlInventory } from './implementations/embedded-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'momentous'),
  'config momentous'
);

export const momentousModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseShopifyXmlInventory, deps.directFetch, '.xml');
  },
};
