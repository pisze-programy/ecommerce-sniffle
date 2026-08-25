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
  { id: "forcer", domain: "forcer.pl", platform: "shopify", schedule: "0 5 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 150, requiresProxy: false, endpoint: "https://forcer.pl/products.json", enabled: true },
  { id: "misbhv", domain: "misbhv.com", platform: "shopify", schedule: "15 5 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 1800, requiresProxy: false, endpoint: "https://misbhv.com/products.json", enabled: true },
  // Shopify - exact stock via cart-probe (mutation, via proxy)
  { id: "booso", domain: "booso.pl", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 1200, requiresProxy: true, endpoint: "https://booso.pl/products.json", enabled: false },
  { id: "gymglamour", domain: "gymglamour.com", platform: "shopify", schedule: "0 1 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 3600, requiresProxy: false, endpoint: "https://gymglamour.com/products.json", enabled: true },
  // montiel: shop is gone, products.json returns 401 from every IP. Disabled.
  { id: "montiel", domain: "montiel.com", platform: "shopify", schedule: "0 7 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 1000, requiresProxy: false, endpoint: "https://montiel.com/products.json", enabled: false },
  { id: "noo-ma", domain: "noo.ma", platform: "shopify", schedule: "0 8 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 1500, requiresProxy: false, endpoint: "https://noo.ma/products.json", enabled: true },
  // magdabutrym: buffers product pages, caused an out-of-memory kill on the VPS. Disabled.
  { id: "magdabutrym", domain: "magdabutrym.com", platform: "shopify", schedule: "0 11 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 600, requiresProxy: false, endpoint: "https://www.magdabutrym.com/sitemap-category/all.xml", enabled: false },
  { id: "nago", domain: "nago.com", platform: "shopify", schedule: "0 12 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 700, requiresProxy: false, endpoint: "https://nago.com/products.json", enabled: true },
  { id: "shapellx", domain: "www.shapellx.com", platform: "shopify", schedule: "0 13 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, durationSeconds: 120, requiresProxy: false, endpoint: "https://www.shapellx.com/", enabled: true },
  // seembols: storefront API exact stock. Disabled. Decide later if the shop is needed.
  { id: "seembols", domain: "seembols.com", platform: "shopify", schedule: "0 14 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, durationSeconds: 300, requiresProxy: false, endpoint: "https://seembols.com/", enabled: false },
  // westwing: shopify hydrogen, exact stock only per product page (27k pages, ~10GB). Disabled. Decide later if the shop is needed.
  { id: "westwing", domain: "www.westwing.pl", platform: "shopify", schedule: "0 15 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, durationSeconds: 300, requiresProxy: false, endpoint: "https://www.westwing.pl/", enabled: false },
  // icon-amsterdam: shopify, exact stock only via cart-probe (2.5-3.8MB webshare/run). Disabled. May return later.
  { id: "icon-amsterdam", domain: "icon-amsterdam.com", platform: "shopify", schedule: "0 16 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://icon-amsterdam.com/products.json", enabled: false },
  // deehome: woocommerce, exact stock only via cart-probe (10k probes, ~7MB). Disabled. Decide later if the shop is needed.
  { id: "deehome", domain: "deehome.pl", platform: "woocommerce", schedule: "0 17 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://deehome.pl/sklep/", enabled: false },
  { id: "bloozie", domain: "www.bloozie.pl", platform: "shopify", schedule: "0 14 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 1, durationSeconds: 180, requiresProxy: false, endpoint: "https://www.bloozie.pl/products.json", enabled: true },
  { id: "godsavequeens", domain: "pl.godsavequeens.com", platform: "shopify", schedule: "15 3 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://pl.godsavequeens.com/products.json", enabled: true },
  { id: "theodderside", domain: "theodderside.com", platform: "shopify", schedule: "30 3 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 1100, requiresProxy: true, endpoint: "https://theodderside.com/products.json", enabled: true },
  { id: "derichgallery", domain: "derichgallery.com", platform: "shopify", schedule: "0 2 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://derichgallery.com/products.json", enabled: true },
  { id: "monartofficial", domain: "monartofficial.com", platform: "shopify", schedule: "15 2 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 1100, requiresProxy: true, endpoint: "https://monartofficial.com/products.json", enabled: true },
  { id: "foodsbyann", domain: "foodsbyann.com", platform: "custom", schedule: "0 9 * * *", window: "both", mode: "vps-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 300, requiresProxy: false, endpoint: "https://foodsbyann.com/sitemap.xml.gz", enabled: true },
  { id: "laboratoriumpanidomu", domain: "laboratoriumpanidomu.pl", platform: "prestashop", schedule: "0 10 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 250, requiresProxy: true, endpoint: "https://laboratoriumpanidomu.pl/", enabled: true },
  { id: "phlov", domain: "www.phlov.com", platform: "prestashop", schedule: "0 12 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://www.phlov.com/", enabled: true },
  // Magento Etn - exact stock embedded in category pages (GET, proxy only for the session cookie)
  { id: "influcenter", domain: "influcenter.pl", platform: "magento", schedule: "0 18 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 600, requiresProxy: false, endpoint: "https://influcenter.pl/", enabled: true },
  { id: "lexon", domain: "lexon-design.com", platform: "magento", schedule: "30 18 * * *", window: "both", mode: "vps-get", stockSource: "embedded-json", ratePerSecond: 2, durationSeconds: 300, requiresProxy: false, endpoint: "https://lexon-design.com/en", enabled: true },
  { id: "hdrey", domain: "hdrey.com", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 1200, requiresProxy: true, endpoint: "https://hdrey.com/products.json", enabled: false },
  { id: "wakenbake", domain: "wakenbake.pl", platform: "shopify", schedule: "15 4 * * *", window: "both", mode: "vps-mutation", stockSource: "cart-probe", ratePerSecond: 1, durationSeconds: 300, requiresProxy: true, endpoint: "https://wakenbake.pl/products.json", enabled: false },
  // Shoper - catalog (GET) + exact stock via basket-reveal (mutation, via proxy)
  { id: "arustamian", domain: "arustamian.com", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 1000, requiresProxy: true, endpoint: "https://arustamian.com/webapi/front/pl_PL/products/PLN/list", enabled: false },
  { id: "e-daag", domain: "e-daag.com.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 1300, requiresProxy: true, endpoint: "https://e-daag.com.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "emereedivine", domain: "emereedivine.com", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 40, requiresProxy: true, endpoint: "https://emereedivine.com/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "sklepskolim", domain: "sklepskolim.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 700, requiresProxy: true, endpoint: "https://sklepskolim.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "wkdzik", domain: "wkdzik.pl", platform: "shoper", schedule: "30 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 1000, requiresProxy: true, endpoint: "https://wkdzik.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  { id: "osmpower", domain: "osmpower.pl", platform: "shoper", schedule: "35 4 * * *", window: "both", mode: "vps-mutation", stockSource: "basket-reveal", ratePerSecond: 1, durationSeconds: 600, requiresProxy: true, endpoint: "https://osmpower.pl/webapi/front/pl_PL/products/PLN/list", enabled: true },
  // Web - exact stock via HTML/JSON (GET), no mutation, no proxy
  { id: "rever", domain: "rever.com.pl", platform: "woocommerce", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 10, requiresProxy: false, endpoint: "https://rever.com.pl/product-sitemap.xml", enabled: true },
  { id: "dobrerzeczy", domain: "dobrerzeczy.pl", platform: "custom", schedule: "0 6 * * *", window: "both", mode: "vps-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 5, requiresProxy: true, endpoint: "https://dobrerzeczy.pl/", enabled: true },
  { id: "royalwatch", domain: "royalwatch.pl", platform: "woocommerce", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 10, requiresProxy: false, endpoint: "https://www.royalwatch.pl/product-sitemap.xml", enabled: true },
  { id: "mushi", domain: "mushi.pl", platform: "custom", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 5, requiresProxy: false, endpoint: "https://www.mushi.pl/sitemap.xml", enabled: true },
  { id: "premieresociety", domain: "premieresociety.com", platform: "custom", schedule: "45 4 * * *", window: "both", mode: "cf-get", stockSource: "html", ratePerSecond: 1, durationSeconds: 20, requiresProxy: false, endpoint: "https://premieresociety.com/pl/3-sklep", enabled: true },
];

export const PROVIDERS: readonly ProviderConfig[] = RAW_CONFIGS.map(validateConfig);
