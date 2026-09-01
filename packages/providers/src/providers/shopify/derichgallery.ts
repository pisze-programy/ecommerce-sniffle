import { PROVIDERS } from '../../config.ts';
import { requireValue } from '../../helpers.ts';
import type { ProviderModule } from '../../module.ts';
import { buildUcpInventoryProvider } from './implementations/ucp-inventory.ts';

export * from './implementations/ucp-inventory.ts';

const config = requireValue(
  PROVIDERS.find((c) => c.id === 'derichgallery'),
  'config derichgallery'
);

export const derichgalleryModule: ProviderModule = {
  config,
  build(deps) {
    return buildUcpInventoryProvider(config, deps.logger, deps.directFetch);
  },
};
