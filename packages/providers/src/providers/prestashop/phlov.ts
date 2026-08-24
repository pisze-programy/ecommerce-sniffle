import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildPrestaShopCartRevealProvider } from "./cart-reveal.ts";

export * from "./cart-reveal.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "phlov"), "config phlov");

export const phlovModule: ProviderModule = {
  config,
  build(deps) {
    return buildPrestaShopCartRevealProvider(config, deps.logger, deps.directFetch);
  },
};
