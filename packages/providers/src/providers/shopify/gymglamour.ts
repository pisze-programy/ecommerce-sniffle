import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildEmbeddedInventoryProvider, parseRestockRocketQuantity } from "./embedded-inventory.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "gymglamour"), "config gymglamour");

export const gymglamourModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseRestockRocketQuantity, deps.directFetch);
  },
};
