import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { parseDataInventoryQuantity } from './implementations/embedded-inventory.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';
import { buildEmbeddedSource } from './stock-source.ts';

export * from './implementations/ucp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'monartofficial'),
  'config monartofficial'
);

// V2 reads the true stock from the product page. The cart cap does not
// apply. See docs/CLAMP-BYPASS.md. Set stockSource back to
// 'ucp-inventory' to roll back to V1.
export const monartofficialModule: ProviderModule = {
  config,
  build(deps) {
    const embedded = buildEmbeddedSource(config, deps, parseDataInventoryQuantity);
    if (embedded !== null) {
      return embedded;
    }
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
