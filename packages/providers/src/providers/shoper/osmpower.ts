import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildBasketRevealProvider } from "../shoper/basket-reveal.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "osmpower"), "config osmpower");

export const osmpowerModule: ProviderModule = {
  config,
  build(deps) {
    return buildBasketRevealProvider(config, deps.logger, deps.directFetch);
  },
};
