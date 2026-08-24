import type { ProviderConfig } from "./types.ts";
import { assertNonEmptyString, assertPositiveInteger } from "./helpers.ts";

function validateConfig(config: ProviderConfig): ProviderConfig {
  assertNonEmptyString(config.id, "config.id");
  assertNonEmptyString(config.domain, "config.domain");
  assertNonEmptyString(config.schedule, "config.schedule");
  assertNonEmptyString(config.endpoint, "config.endpoint");
  assertPositiveInteger(config.ratePerSecond, "config.ratePerSecond");
  return config;
}

const RAW_CONFIGS: readonly ProviderConfig[] = [
  // Shopify - exact stock via embedded JSON (GET)
  { id: "forcer", domain: "forcer.pl", platform: "shopify", schedule: "0 5 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, requiresProxy: false, endpoint: "https://forcer.pl/products.json", enabled: true },
  { id: "misbhv", domain: "misbhv.com", platform: "shopify", schedule: "15 5 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, requiresProxy: false, endpoint: "https://misbhv.com/products.json", enabled: true },
  // Shopify - exact stock via cart-probe (mutation, via proxy)
  { id: "booso", domain: "booso.pl", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, requiresProxy: true, endpoint: "https://booso.pl/products.json", enabled: false },
  { id: "gymglamour", domain: "gymglamour.com", platform: "shopify", schedule: "0 1 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, requiresProxy: false, endpoint: "https://gymglamour.com/products.json", enabled: true },
  { id: "montiel", domain: "montiel.com", platform: "shopify", schedule: "0 7 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, requiresProxy: false, endpoint: "https://montiel.com/products.json", enabled: true },
  { id: "noo-ma", domain: "noo.ma", platform: "shopify", schedule: "0 8 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, requiresProxy: false, endpoint: "https://noo.ma/products.json", enabled: true },
  { id: "foodsbyann", domain: "foodsbyann.com", platform: "custom", schedule: "0 9 * * *", window: "both", mode: "vps-get", stockSource: "html", ratePerSecond: 1, requiresProxy: false, endpoint: "https://foodsbyann.com/sitemap.xml.gz", enabled: true },
  { id: "laboratoriumpanidomu", domain: "laboratoriumpanidomu.pl", platform: "prestashop", schedule: "0 10 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, requiresProxy: true, endpoint: "https://laboratoriumpanidomu.pl/", enabled: true },
  { id: "hdrey", domain: "hdrey.com", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, requiresProxy: true, endpoint: "https://hdrey.com/products.json", enabled: false },
  { id: "wakenbake", domain: "wakenbake.pl", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, requiresProxy: true, endpoint: "https://wakenbake.pl/products.json", enabled: false },
  // Shoper - catalog (GET) + exact stock via basket-reveal (mutation, via proxy)
  { id: "arustamian", domain: "arustamian.com", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, requiresProxy: true, endpoint: "https://arustamian.com/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "e-daag", domain: "e-daag.com.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, requiresProxy: true, endpoint: "https://e-daag.com.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "emereedivine", domain: "emereedivine.com", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, requiresProxy: true, endpoint: "https://emereedivine.com/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "sklepskolim", domain: "sklepskolim.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, requiresProxy: true, endpoint: "https://sklepskolim.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "wkdzik", domain: "wkdzik.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, requiresProxy: true, endpoint: "https://wkdzik.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  // Web - exact stock via HTML/JSON (GET), no mutation, no proxy
  { id: "rever", domain: "rever.com.pl", platform: "woocommerce", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, requiresProxy: false, endpoint: "https://rever.com.pl/product-sitemap.xml", enabled: true },
  { id: "dobrerzeczy", domain: "dobrerzeczy.pl", platform: "custom", schedule: "0 6 * * *", window: "both", mode: "vps-get", stockSource: "html", ratePerSecond: 1, requiresProxy: true, endpoint: "https://dobrerzeczy.pl/sitemap.xml", enabled: true },
  { id: "royalwatch", domain: "royalwatch.pl", platform: "woocommerce", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, requiresProxy: false, endpoint: "https://www.royalwatch.pl/product-sitemap.xml", enabled: true },
  { id: "mushi", domain: "mushi.pl", platform: "custom", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, requiresProxy: false, endpoint: "https://www.mushi.pl/sitemap.xml", enabled: true },
  { id: "premieresociety", domain: "premieresociety.com", platform: "custom", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, requiresProxy: false, endpoint: "https://premieresociety.com/pl/3-sklep", enabled: true },
];

export const PROVIDERS: readonly ProviderConfig[] = RAW_CONFIGS.map(validateConfig);
