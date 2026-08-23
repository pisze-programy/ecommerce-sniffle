import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildCartProbeProvider } from "./cart-probe.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "hdrey"), "config hdrey");

export const hdreyModule: ProviderModule = {
  config,
  build(deps) {
    return buildCartProbeProvider(config, deps.logger);
  },
};
