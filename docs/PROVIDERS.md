# Providers

This document lists the providers and the config that controls them.
It uses Simplified Technical English.

## Config fields

Every provider has a config. The config controls the provider.

| Field | Meaning |
|---|---|
| `id` | unique name of the provider |
| `domain` | shop domain |
| `platform` | shopify, shoper, woocommerce, custom |
| `schedule` | cron expression - how often it runs |
| `mode` | cf-get, vps-get or vps-mutation - where it runs |
| `stockSource` | where exact stock comes from |
| `ratePerSecond` | max requests per second |
| `requiresProxy` | true if the provider needs a residential proxy |
| `endpoint` | where the call happens |
| `enabled` | true to run it |

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

## The 16 providers

### Shopify - embedded JSON (vps-get)

The shop embeds `bis-variant-data`, `variantInventoryData`, or
`_RestockRocketConfig.variantsInventoryQuantity` in the product page.
The JSON has the exact count. This is a free GET source.

The provider fetches the product page for every product. Shopify
rate-limits bursts of page fetches. The provider paces the fetches at
`ratePerSecond` (1 request per second). A full catalog takes minutes.
The Cloudflare worker has a 30 second limit. This is why the
mode is `vps-get`, not `cf-get`.

| id | domain | stock source |
|---|---|---|
| forcer | forcer.pl | embedded-json |
| misbhv | misbhv.com | embedded-json |
| gymglamour | gymglamour.com | embedded-json |
| montiel | montiel.com | embedded-json |
| noo-ma | noo.ma | embedded-json |

gymglamour uses the Restock Rocket app. The page has
`_RestockRocketConfig.variantsInventoryQuantity`, a map of variant id
to exact count. This is free exact, no cart probe needed.

montiel reveals exact in the `.js` product endpoint. The provider
fetches `products/{handle}.js` and reads `inventory_quantity` per
variant. Free exact.

noo.ma embeds `variant: { id, inventory_quantity }` in the product
page. The page shows only the default variant, so the provider fetches
`?variant={id}` for every variant. Free exact.

### Shopify - cart probe (vps-mutation)

| id | domain | stock source |
|---|---|---|
| booso | booso.pl | cart-probe |
| hdrey | hdrey.com | cart-probe |
| wakenbake | wakenbake.pl | cart-probe |

### Shoper - basket reveal (vps-mutation)

| id | domain | stock source |
|---|---|---|
| arustamian | arustamian.com | basket-reveal |
| e-daag | e-daag.com.pl | basket-reveal |
| emereedivine | emereedivine.com | basket-reveal |
| sklepskolim | sklepskolim.pl | basket-reveal |
| wkdzik | wkdzik.pl | basket-reveal |

### Web - HTML stock (cf-get)

| id | domain | stock source |
|---|---|---|
| rever | rever.com.pl | html |
| dobrerzeczy | dobrerzeczy.pl | html |
| royalwatch | royalwatch.pl | html |
| mushi | mushi.pl | html |
| premieresociety | premieresociety.com | html |

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

1. `POST /webapi/front/{lang}/basket/{currency}/` with `stock_id` and `quantity=1`.
   The response returns the basket item id.
2. `PUT .../basket/{currency}/{itemId}/` with `quantity=999999999`.
   The shop clamps the line.
3. The warning says "Aktualnie dostepna ilosc to: NAME - N szt."
   The number N is the exact stock.
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
  Products with a text option (like engraving) get a placeholder value.
- hdrey.com hides exact stock from every GET source. The cart probe is
  the only way. The probe runs at a calm pace and retries challenged
  variants after a cooldown. A few challenges can stay masked on a run.
- dobrerzeczy.pl blocks datacenter IPs on its GETs. The provider runs
  on the VPS with `requiresProxy: true`, so its GETs go through the
  webshare proxy.
- Shopify rate-limits bursts. The embedded JSON enrichment runs at
  `ratePerSecond` and must finish on the VPS, not the worker.
- booso, hdrey and wakenbake are cart-probe shops. The shops answer
  cart mutations with a Cloudflare challenge after a few requests.
  The probes are disabled. The queue retry path can re-enable them
  when a challenge solver is ready.
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
