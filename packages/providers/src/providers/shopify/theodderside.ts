import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildStorefrontAvailabilityProvider } from './implementations/storefront-graphql.ts';

export * from './implementations/storefront-graphql.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'theodderside'),
  'config theodderside'
);

export const theoddersideModule: ProviderModule = {
  config,
  build(deps) {
    return buildStorefrontAvailabilityProvider(config, deps.logger, deps.directFetch);
  },
};
