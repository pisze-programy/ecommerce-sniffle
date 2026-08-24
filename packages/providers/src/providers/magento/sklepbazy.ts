import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildMagentoCartRevealProvider } from "./cart-reveal.ts";

export * from "./cart-reveal.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "sklepbazy"), "config sklepbazy");

export const sklepbazyModule: ProviderModule = {
  config,
  build(deps) {
    return buildMagentoCartRevealProvider(config, deps.logger, deps.directFetch);
  },
};
