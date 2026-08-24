import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildEmbeddedInventoryProvider, parseVariantInventoryData } from "./embedded-inventory.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "misbhv"), "config misbhv");

export const misbhvModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseVariantInventoryData, deps.directFetch);
  },
};
