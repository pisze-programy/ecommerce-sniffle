import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildEmbeddedInventoryProvider, parseBisVariantData } from "./embedded-inventory.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "forcer"), "config forcer");

export const forcerModule: ProviderModule = {
  config,
  build(deps) {
    return buildEmbeddedInventoryProvider(config, deps.logger, parseBisVariantData, deps.directFetch);
  },
};
