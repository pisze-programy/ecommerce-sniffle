import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildEmbeddedInventoryProvider, parseRestockRocketQuantity } from "../shopify/embedded-inventory.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "nago"), "config nago");

export const nagoModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseRestockRocketQuantity, deps.directFetch);
  },
};
