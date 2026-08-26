import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildCartProbeProvider } from './implementations/cart-probe.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'icon-amsterdam'),
  'config icon-amsterdam'
);

export const iconAmsterdamModule: ProviderModule = {
  config,
  build(deps) {
    return buildCartProbeProvider(config, deps.logger, deps.directFetch);
  },
};
