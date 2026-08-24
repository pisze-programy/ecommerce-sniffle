import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildBasketRevealProvider } from "./basket-reveal.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "wkdzik"), "config wkdzik");

export const wkdzikModule: ProviderModule = {
  config,
  build(deps) {
    return buildBasketRevealProvider(config, deps.logger, deps.directFetch);
  },
};
