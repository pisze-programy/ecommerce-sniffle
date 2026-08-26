import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildPrestaShopCartRevealProvider } from './cart-reveal.ts';

export * from './cart-reveal.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'laboratoriumpanidomu'),
  'config laboratoriumpanidomu'
);

export const laboratoriumpanidomuModule: ProviderModule = {
  config,
  build(deps) {
    return buildPrestaShopCartRevealProvider(config, deps.logger, deps.directFetch);
  },
};
