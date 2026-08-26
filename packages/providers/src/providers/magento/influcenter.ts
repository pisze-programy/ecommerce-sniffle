import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildEmbeddedQtyProvider } from './embedded-qty.ts';

export { fetchMagentoCookie, parseEmbeddedQty, parseCurrency } from './embedded-qty.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'influcenter'),
  'config influcenter'
);

export const influcenterModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedQtyProvider(config, deps.logger, deps.directFetch);
  },
};
