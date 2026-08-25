import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildCartProbeProvider } from "./cart-probe.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "derichgallery"), "config derichgallery");

export const derichgalleryModule: ProviderModule = {
  config,
  build(deps) {
    return buildCartProbeProvider(config, deps.logger, deps.directFetch);
  },
};
