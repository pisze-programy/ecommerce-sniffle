import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildEmbeddedInventoryProvider, parseShopifyJsInventory } from "./embedded-inventory.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "montiel"), "config montiel");

export const montielModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseShopifyJsInventory, deps.directFetch, ".js");
  },
};
