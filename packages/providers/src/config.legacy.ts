import type { ProviderConfig } from './types.ts';

export const LEGACY_PROVIDERS: readonly ProviderConfig[] = [
  {
    id: 'montiel',
    domain: 'montiel.com',
    platform: 'shopify',
    schedule: '0 7 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 2,
    durationSeconds: 1000,
    requiresProxy: false,
    endpoint: 'https://montiel.com/products.json',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'noo-ma',
    domain: 'noo.ma',
    platform: 'shopify',
    schedule: '0 8 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 2,
    durationSeconds: 1500,
    requiresProxy: false,
    endpoint: 'https://noo.ma/products.json',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'magdabutrym',
    domain: 'magdabutrym.com',
    platform: 'shopify',
    schedule: '0 11 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 2,
    durationSeconds: 600,
    requiresProxy: false,
    endpoint: 'https://www.magdabutrym.com/sitemap-category/all.xml',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'shapellx',
    domain: 'www.shapellx.com',
    platform: 'shopify',
    schedule: '0 13 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 1,
    durationSeconds: 120,
    requiresProxy: false,
    endpoint: 'https://www.shapellx.com/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'seembols',
    domain: 'seembols.com',
    platform: 'shopify',
    schedule: '0 14 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: false,
    endpoint: 'https://seembols.com/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'westwing',
    domain: 'www.westwing.pl',
    platform: 'shopify',
    schedule: '0 15 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: false,
    endpoint: 'https://www.westwing.pl/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'deehome',
    domain: 'deehome.pl',
    platform: 'woocommerce',
    schedule: '0 17 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'cart-probe',
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: true,
    endpoint: 'https://deehome.pl/sklep/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'bloozie',
    domain: 'www.bloozie.pl',
    platform: 'shopify',
    schedule: '0 14 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 1,
    durationSeconds: 180,
    requiresProxy: false,
    endpoint: 'https://www.bloozie.pl/products.json',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'phlov',
    domain: 'www.phlov.com',
    platform: 'prestashop',
    schedule: '0 12 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'cart-probe',
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: false,
    endpoint: 'https://www.phlov.com/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'influcenter',
    domain: 'influcenter.pl',
    platform: 'magento',
    schedule: '0 18 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 2,
    durationSeconds: 600,
    requiresProxy: false,
    endpoint: 'https://influcenter.pl/',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'lexon',
    domain: 'lexon-design.com',
    platform: 'magento',
    schedule: '30 18 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'embedded-json',
    ratePerSecond: 2,
    durationSeconds: 300,
    requiresProxy: false,
    endpoint: 'https://lexon-design.com/en',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'arustamian',
    domain: 'arustamian.com',
    platform: 'shoper',
    schedule: '30 4 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'basket-reveal',
    ratePerSecond: 5,
    durationSeconds: 1000,
    requiresProxy: true,
    endpoint: 'https://arustamian.com/webapi/front/pl_PL/products/PLN/list',
    enabled: false,
    currency: 'PLN',
  },
  {
    id: 'osmpower',
    domain: 'osmpower.pl',
    platform: 'shoper',
    schedule: '35 4 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'basket-reveal',
    ratePerSecond: 5,
    durationSeconds: 600,
    requiresProxy: true,
    endpoint: 'https://osmpower.pl/webapi/front/pl_PL/products/PLN/list',
    enabled: false,
    currency: 'PLN',
  },
  // kfd - PrestaShop, parked. Discovery 2026-08-29.
  // The shop is not Shoper. The Shoper webapi returns 404.
  // The product page embeds a data-product JSON. It holds the
  // quantity of the default flavor, the quantity of all flavors,
  // the price, and the available_for_order flag. The JSON-LD block
  // holds the price and the availability. The refresh POST returns
  // data-stock and current-price-value. The Security Pro WAF resets
  // connections on a burst of product GETs. Even a slow serial crawl
  // was blocked during discovery. A combo product exposes only the
  // default flavor and the total. Re-validate the crawl on the VPS
  // IP before enabling. Do not reuse extractPrestaProductId for this
  // shop. It returns the wrong id for kfd URLs. Parse the -p-<id>
  // tail instead.
  {
    id: 'kfd',
    domain: 'sklep.kfd.pl',
    platform: 'prestashop',
    schedule: '0 12 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 900,
    requiresProxy: false,
    endpoint: 'https://sklep.kfd.pl/',
    enabled: false,
    currency: 'PLN',
  },
  // sfd - IdoSell, parked. Discovery 2026-08-29.
  // The sitemap holds the full catalog. It lists 3210 product pages
  // in one GET. The product page embeds PRODUCT_PAGE_CONFIG. It holds
  // the price. It holds no stock and no availability. The listing
  // loads availability by async. The endpoint is unknown. The basket
  // add is a WebForms postback with 131 viewstate fields and one
  // checkbox per flavor. The masked rule forbids a price-only
  // provider. Find the availability endpoint before enabling.
  {
    id: 'sfd',
    domain: 'sklep.sfd.pl',
    platform: 'idosell',
    schedule: '0 12 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 600,
    requiresProxy: false,
    endpoint: 'https://sklep.sfd.pl/sitemap.xml',
    enabled: false,
    currency: 'PLN',
  },
  // huel - Shopify headless, parked. Discovery 2026-08-29.
  // The store runs on a Next.js frontend. The origin is
  // huelpoland.myshopify.com. It has no bot protection. The
  // products.json returns 404. The catalog is the sitemap at
  // sitemaps/sitemap/pl-pl.xml. It lists 58 products. The page
  // embeds the price. It does not embed the availability. The
  // /api/mcp endpoint is not confirmed. Validate the update_cart
  // clamp on the real path before enabling.
  {
    id: 'huel',
    domain: 'pl.huel.com',
    platform: 'shopify',
    schedule: '0 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'ucp-inventory',
    ratePerSecond: 1,
    durationSeconds: 60,
    requiresProxy: true,
    endpoint: 'https://pl.huel.com/sitemaps/sitemap/pl-pl.xml',
    enabled: false,
    currency: 'PLN',
  },
  // sodastream - Shopify, parked. Discovery 2026-08-29.
  // The shop is a standard Shopify store. It has no bot protection.
  // The products.json lists 64 products. It holds the price and the
  // availability. It does not hold the exact inventory. The /api/mcp
  // endpoint is present. It exposes the update_cart tool. The
  // mcp-inventory provider can reveal the exact stock. The catalog is
  // small. Validate the update_cart clamp on the VPS before enabling.
  {
    id: 'sodastream',
    domain: 'sodastream.pl',
    platform: 'shopify',
    schedule: '0 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'ucp-inventory',
    ratePerSecond: 1,
    durationSeconds: 30,
    requiresProxy: true,
    endpoint: 'https://sodastream.pl/products.json',
    enabled: false,
    currency: 'PLN',
  },
  // marionis - Shopify, disabled. The stock data is junk.
  // The products.json returns garbage that does not match the shop.
  // Do not re-enable before the data source is fixed.
  {
    id: 'marionis',
    domain: 'marionis.pl',
    platform: 'shopify',
    schedule: '0 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'ucp-inventory',
    ratePerSecond: 1,
    durationSeconds: 15,
    requiresProxy: true,
    endpoint: 'https://marionis.pl/products.json',
    enabled: false,
    currency: 'PLN',
  },
  // marlehome - PrestaShop 1.7, disabled. Integration unfinished.
  // The stock semantics are not solved yet. Someone else will finish.
  //
  // The shop: https://marlehome.com, made-to-order furniture.
  // Catalog: category "13-wszystkie-produkty" with pagination,
  // 124 products (50+50+24). The sitemap is stale (14 urls).
  // The sitemap-only urls redirect 301 to the canonical pages.
  //
  // Platform: PrestaShop 1.7, PHP 7.4.33 EOL, jQuery 1.7.1.
  // No bot protection, no webshare needed. Webservice /api is 401
  // (no public key). No products.json (that is Shopify, not here).
  //
  // Stock source: the "Wybierz wariant" block on the product page.
  // Each entry is a buyable unit (a color/size combination, each with
  // its own product url) and carries data-quantity, server-rendered:
  //   <div class="cv-related-product-item cv-related-product-id-91"
  //        data-quantity="2">...</div>
  // A positive data-quantity is the exact stock (verified: 91 -> 2,
  // the add-to-cart accepts 2 and rejects 3).
  //
  // The block appears on 44 of 124 products. The other 80 products
  // have no block and no stock signal in the HTML.
  //
  // NOT solved:
  // - data-quantity of 0 or negative (-1, -2) does NOT mean sold out.
  //   Example: 158 (qty 0) is buyable, 165 (qty 0) is not (button
  //   disabled). The shop is made to order, so 0 is "none in stock
  //   now, order anyway". The negative values are undefined.
  // - The buyable flag is the add-to-cart button disabled attribute.
  // - The exact max quantity is confirmed by this read-only request
  //   (fires on every qty change in the UI, no cart mutation):
  //     POST /index.php?controller=product&token={static token}
  //          &id_product={id}&id_customization=0&qty={X}
  //     Content-Type: application/x-www-form-urlencoded
  //     X-Requested-With: XMLHttpRequest
  //     Body: ajax=1&action=refresh&quantity_wanted={X}
  //   X above stock -> response contains "Nie ma wystarczajacej
  //   ilosci". X at or below -> no such error. Token is the
  //   static_token / form token on the page.
  // - A future provider can read data-quantity for the block products
  //   and binary search the rest through that endpoint. cf-get,
  //   requiresProxy false.
  //
  // Entity (owner data, harvested 2026-09-07):
  //   Marle Group sp. z o.o., ul. Stefana Zeromskiego 62/2,
  //   50-312 Wroclaw. KRS 0000925154, NIP 8982269793,
  //   REGON 520135170. Instagram: @marlehomecom.
  //   Owner: Jakub Roskosz, Instagram @jakubroskosz.
  //   Bizraport financials: assets 199k, revenue 473k, profit -48k,
  //   valuation 337k (PLN).
  {
    id: 'marlehome',
    domain: 'marlehome.com',
    platform: 'prestashop',
    schedule: '30 3 * * *',
    window: 'both',
    mode: 'cf-get',
    stockSource: 'embedded-quantity',
    ratePerSecond: 1,
    durationSeconds: 240,
    requiresProxy: false,
    endpoint: 'https://marlehome.com/13-wszystkie-produkty',
    enabled: false,
    currency: 'PLN',
    entityId: 'marlehome',
  },
];
