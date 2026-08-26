# Providers

This document lists the providers and the config that controls them.
It uses Simplified Technical English.

## Config fields

Every provider has a config. The config controls the provider.

| Field           | Meaning                                         |
| --------------- | ----------------------------------------------- |
| `id`            | unique name of the provider                     |
| `domain`        | shop domain                                     |
| `platform`      | shopify, shoper, woocommerce, custom            |
| `schedule`      | cron expression - how often it runs             |
| `mode`          | cf-get, vps-get or vps-mutation - where it runs |
| `stockSource`   | where exact stock comes from                    |
| `ratePerSecond` | max requests per second                         |
| `requiresProxy` | true if the provider needs a residential proxy  |
| `endpoint`      | where the call happens                          |
| `enabled`       | true to run it                                  |

## Execution modes

- `cf-get`: runs on the Cloudflare worker. GETs only.
- `vps-get`: runs on the VPS. GETs only, direct, no proxy.
  For shops that rate-limit bursts. The VPS can run long windows.
- `vps-mutation`: runs on the VPS. Mutations through the proxy.

## Stock sources

- `embedded-json`: Shopify product page JSON (GET).
- `cart-probe`: Shopify cart add (mutation, proxy).
- `basket-reveal`: Shoper basket PUT (mutation, proxy).
- `html`: stock in HTML (GET).
- `boolean`: availability only (1 or 0).
- `mcp-inventory`: Shopify MCP server cart clamp (mutation, proxy).

## The active providers

### Shopify - MCP inventory (vps-mutation)

The MCP server clamps a huge cart quantity to the exact stock.
The cart-probe returned 429 and 403 at production scale. The MCP
server does not. One request holds 10 variants. The transfer is about
3 KB per request. See [SHOPIFY-MCP-INVENTORY.md](./SHOPIFY-MCP-INVENTORY.md).

| id             | domain               | stock source  | Webshare/run |
| -------------- | -------------------- | ------------- | ------------ |
| derichgallery  | derichgallery.com    | mcp-inventory | ~33 KB       |
| monartofficial | monartofficial.com   | mcp-inventory | ~138 KB      |
| wakenbake      | wakenbake.pl         | mcp-inventory | ~6 KB        |
| forcer         | forcer.pl            | mcp-inventory | ~82 KB       |
| nago           | nago.com             | mcp-inventory | ~221 KB      |
| hdrey          | hdrey.com            | mcp-inventory | ~488 KB      |
| godsavequeens  | pl.godsavequeens.com | mcp-inventory | ~498 KB      |
| theodderside   | theodderside.com     | mcp-inventory | ~506 KB      |
| icon-amsterdam | icon-amsterdam.com   | mcp-inventory | ~622 KB      |
| booso          | booso.pl             | mcp-inventory | ~650 KB      |
| gymglamour     | gymglamour.com       | mcp-inventory | ~898 KB      |

All eleven shops give masked 0 on a full run. Shapellx did not pass
the 1 MB webshare rule (about 1.6 MB per run). It stays disabled.
Noo-ma and seembols accept the whole 999999 (no clamp). The MCP gives
no exact count for them, so they keep their exact GET sources.

### Shoper - basket reveal (vps-mutation)

The shop hides the count in the catalog list. The basket reveal
clamps a huge quantity. See below for the flow.

The catalog is a public storefront GET. It runs direct from the VPS IP.
Only the basket mutations go through the proxy. This cuts the webshare
transfer by about half.

| id           | domain           | stock source  | Webshare/run |
| ------------ | ---------------- | ------------- | ------------ |
| emereedivine | emereedivine.com | basket-reveal | ~43 KB       |
| e-daag       | e-daag.com.pl    | basket-reveal | ~359 KB      |
| sklepskolim  | sklepskolim.pl   | basket-reveal | ~469 KB      |
| wkdzik       | wkdzik.pl        | basket-reveal | ~1.0 MB      |

Arustamian and osmpower stay disabled.

### Prestashop - cart reveal (vps-mutation)

| id                   | domain                  | stock source |
| -------------------- | ----------------------- | ------------ |
| laboratoriumpanidomu | laboratoriumpanidomu.pl | cart-probe   |

The page has a hidden form token. The cart clamps the quantity on add.
See [PROBING.md](./PROBING.md).

### Web - HTML stock (cf-get)

| id          | domain         | stock source | mode    |
| ----------- | -------------- | ------------ | ------- |
| rever       | rever.com.pl   | html         | cf-get  |
| royalwatch  | royalwatch.pl  | html         | cf-get  |
| mushi       | mushi.pl       | html         | cf-get  |
| dobrerzeczy | dobrerzeczy.pl | html         | vps-get |

### Web - exact stock notes

- mushi.pl embeds `stock:{status,stock:N}` in the page. Exact count, cf-get.
- premieresociety.com is PrestaShop. The page has a hidden
  `stripe_product_quantity` field with the exact count. cf-get.
  The catalog comes from the category page (790 product pages).
- foodsbyann.com is IdoSell. The page embeds `sizes` with `amount`.
  Each size is a variant and `amount` is the exact count. vps-get.
  The sitemap index has gzipped sub-sitemaps with product urls.

## Stock coverage

Every provider gives 100% stock coverage:

- exact count where the shop tracks stock
- 1 when available (buyable)
- 0 when sold out

## How mutation providers reveal exact stock

### Shopify cart probe

The shop hides the count in `products.json`.
The provider asks the cart for a huge quantity.

1. `POST /cart/add.js` with `quantity=1`. This starts a cart line.
2. `POST /cart/change.js` with `quantity=999`.
   Shopify clamps the line to the available stock.
3. The response says "Only N items were added".
   The number N is the exact stock.

A cart line is small. The provider discards the cart after the probe.

### Shoper basket reveal

The shop hides the count in the catalog list.
The provider puts a huge quantity in the basket.

1. `POST /webapi/front/{lang}/basket/{currency}/` with `stock_id` and `quantity=999999999`.
   The response adds the item and warns:
   "Current stock is: NAME - N szt." The number N is the exact stock.
   The POST alone reveals the stock for a simple product.
2. Variant products need a fallback:
   `PUT .../basket/{currency}/{itemId}/` with `quantity=999999999`.
   The shop clamps the line.
3. The warning says "Aktualnie dostepna ilosc to: NAME - N szt."
4. `DELETE .../basket/{currency}/{itemId}/`. This keeps the basket clean.

Variant products need option values. The provider fetches the product
detail, builds the option combinations, and probes each one.
Each variant gets an id like `{productId}-Rozmiar: XL`.

## Known coverage limits

- booso.pl can answer with a Cloudflare challenge. The provider logs
  and skips the variant. Exact stock is masked on challenged probes.
- The Shoper list API paginates with `limit` and `offset`, not `page`.
  The provider uses `limit=500&offset=N` to fetch the full catalog.
- Shoper warnings come in Polish or English. The parser reads both.
  Products that are inactive or `can_buy: false` get quantity 0.
  The basket add sets two cookies. The reveal keeps every one of them
  with `getSetCookie`. A missing session cookie stops the clamp and
  masks every variant of the product.
  Shoper bundle products (a `PAKIET` pack) stay masked. The basket add
  needs the bundle children data and answers
  `Nieprawidłowe dane produktów składowych` without it.
- hdrey.com hides exact stock from every GET source. The MCP server
  is the way. The run gives masked 0.
- dobrerzeczy.pl blocks datacenter IPs on its GETs. The provider runs
  on the VPS with `requiresProxy: true`, so its GETs go through the
  webshare proxy.
- Shopify rate-limits bursts. The embedded JSON enrichment runs at
  `ratePerSecond` and must finish on the VPS, not the worker.
- The old cart-probe shops (booso, hdrey, wakenbake, godsavequeens,
  icon-amsterdam, theodderside) answered cart mutations with a
  Cloudflare challenge after a few requests. They moved to the MCP
  inventory source. The MCP server does not challenge.
- misbhv.com product `knitted-beanie-251a518` has no embedded script.
  The shop does not emit it for this product. The variant stays masked.
- Catalog fetches run direct from the VPS (no proxy). Only the mutations
  go through the webshare proxy. This keeps the proxy data low.

## Cloudflare challenges

Some shops answer with a Cloudflare challenge page.
The status is 429 or 403. The body says "Verifying your connection...".

The providers detect the challenge and log it:
`cartprobe.challenge blocked` or `basketreveal.challenge blocked`.
The variant is skipped. The provider never writes fake stock.

Two cases exist:

- Managed challenge (`cType: 'managed'`): not solvable without a browser.
  The VPS has no browser. The variant is skipped.
- Standalone Turnstile widget with `data-sitekey`: solvable token-only
  via the 2captcha client. Requires `CAPTCHA_KEY` in the environment.
  The solve-and-retry path is ready but not wired yet.

See `_internal/docs/CF-CHALLENGE.md` for details.

## Probing a new shop

Before adding a shop, discover its stock source.
See [PROBING.md](./PROBING.md) for the probe-first checklist.
A free source (embedded JSON) costs zero webshare.

## The provider interface

A provider has a `fetchCatalog()` method.
A mutation provider also has a `revealStock()` method.

Both return a normalized `Catalog`:

```ts
interface Catalog {
  domain: string;
  fetchedAt: string;
  products: Product[];
}
```

The normalized shape is the same for every platform.
The CF worker and the VPS use the same types.
