import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildBasketRevealProvider } from './basket-reveal.ts';
import { buildShoperCacheStockProvider } from './cache-stock.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'sklepskolim'),
  'config sklepskolim'
);

// V2 reads the exact stock from the public product stock endpoint.
// The product page names every stock id in ProductStocksCache. The cart
// cap does not apply. See docs/CLAMP-BYPASS.md.
// Roll back to V1 with every field:
//   stockSource: 'basket-reveal', mode: 'vps-mutation',
//   requiresProxy: true, ratePerSecond: 5, durationSeconds: 70,
//   and the adaptiveRate block.
export const sklepskolimModule: ProviderModule = {
  config,
  build(deps) {
    if (config.stockSource === 'cache-stock') {
      return buildShoperCacheStockProvider(config, deps.logger, deps.directFetch);
    }
    return buildBasketRevealProvider(config, deps.logger, deps.directFetch);
  },
};
