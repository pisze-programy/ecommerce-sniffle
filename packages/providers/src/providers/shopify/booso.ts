import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildCartProbeProvider } from './implementations/cart-probe.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'booso'),
  'config booso'
);

export const boosoModule: ProviderModule = {
  config,
  build(deps) {
    return buildCartProbeProvider(config, deps.logger, deps.directFetch);
  },
};
