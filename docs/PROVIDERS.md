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
| `mode` | cf-get or vps-mutation - where it runs |
| `stockSource` | where exact stock comes from |
| `ratePerSecond` | max requests per second |
| `requiresProxy` | true if the provider needs a residential proxy |
| `endpoint` | where the call happens |
| `enabled` | true to run it |

## Execution modes

- `cf-get`: runs on the Cloudflare worker. GETs only.
- `vps-mutation`: runs on the VPS. Mutations through the proxy.

## Stock sources

- `embedded-json`: Shopify product page JSON (GET).
- `cart-probe`: Shopify cart add (mutation, proxy).
- `basket-reveal`: Shoper basket PUT (mutation, proxy).
- `html`: stock in HTML (GET).
- `boolean`: availability only (1 or 0).

## The 14 providers

### Shopify - embedded JSON (cf-get)

| id | domain | stock source |
|---|---|---|
| forcer | forcer.pl | embedded-json |
| misbhv | misbhv.com | embedded-json |

### Shopify - cart probe (vps-mutation)

| id | domain | stock source |
|---|---|---|
| booso | booso.pl | cart-probe |
| gymglamour | gymglamour.com | cart-probe |
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
- e-daag.com.pl and sklepskolim.pl have broken list pagination.
  The API returns the same first page for every page value.
  Only the exposed products are tracked (about 10 per shop).
- Some Shoper shops hide stock counts. The basket warning has no number.
  The variant stays masked.

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
