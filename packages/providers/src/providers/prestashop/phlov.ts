import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildPrestaShopDataStockProvider } from './data-stock.ts';

export * from './data-stock.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'phlov'),
  'config phlov'
);

export const phlovModule: ProviderModule = {
  config,
  build(deps) {
    return buildPrestaShopDataStockProvider(config, deps.logger, deps.directFetch);
  },
};
