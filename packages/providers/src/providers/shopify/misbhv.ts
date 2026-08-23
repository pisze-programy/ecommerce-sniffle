import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import type { ProviderModule } from "../../module.ts";
import { buildProvider } from "../../factory.ts";
import { fetchShopifyCatalog } from "./adapter.ts";

const config = requireValue(PROVIDERS.find((c) => c.id === "misbhv"), "config misbhv");

export const misbhvModule: ProviderModule = {
  config,
  build(deps) {
    return buildProvider(config, deps.logger, () =>
      fetchShopifyCatalog(config.endpoint, config.domain, deps.logger),
    );
  },
};
