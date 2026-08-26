import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildBasketRevealProvider } from './basket-reveal.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'emereedivine'),
  'config emereedivine'
);

export const emereedivineModule: ProviderModule = {
  config,
  build(deps) {
    return buildBasketRevealProvider(config, deps.logger, deps.directFetch);
  },
};
