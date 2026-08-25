import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildStorefrontApiProvider } from "./storefront.ts";

export { parseStorefrontToken, parseVariantId, parseGraphQLCatalog } from "./storefront.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "seembols"), "config seembols");

export const seembolsModule: ProviderModule = {
  config,
  build(deps) {
    return buildStorefrontApiProvider(config, deps.logger, deps.directFetch);
  },
};
