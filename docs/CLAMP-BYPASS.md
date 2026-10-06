# CLAMP-BYPASS.md

## Purpose

The cart cap hides the exact stock above a limit.
The cap comes from Shopify `Settings > Checkout > Add-to-cart limit`.
The cart endpoints return the cap, not the true count.
Some theme apps render the true count in the page HTML.
The cap does not apply to the page HTML.

This file records the cap per store and the leak vector.
This file lists the stores to rework.
This file lists the stores with no public leak.
This file lists the stores with no check yet.

## Confirmed leak vectors

Each store uses a different app.
The vector is per store, not global.

| store              | cap | vector                                        | real example           | status |
| ------------------ | --- | --------------------------------------------- | ---------------------- | ------ |
| gymglamour.com     | 50  | Storefront GraphQL token with inventory scope | 347, 859, 701, 265     | LEAK   |
| icon-amsterdam.com | 40  | bundle app JSON                               | 47, 96, 91, 104        | LEAK   |
| monartofficial.com | 20  | custom inventory script                       | 420, 474, 490          | LEAK   |
| theodderside.com   | 21  | back-in-stock app config                      | 191                    | LEAK   |
| wojanshop.pl       | 50  | Grow app JS map                               | 144, 243, 757, 1129    | LEAK   |
| booso.pl           | 20  | Grow app JS map                               | 23, 28, 30, 57, 59, 62 | LEAK   |
| sanah.shop         | 50  | cart message below the cap                    | 1 to 49 (partial)      | LEAK   |
| wakenbake.pl       | 50  | cart message below the cap                    | 1 to 49 (partial)      | LEAK   |
| 33mata.pl          | 50  | cart message below the cap                    | 1 to 49 (partial)      | LEAK   |
| ooponka.com        | 50  | cart message below the cap                    | 3, 4, 8, 21 (partial)  | LEAK   |

## Verified 1:1

Each row is the cap bypass proof.
The cart is tested at cap-1, cap and cap+1, and at leak-1, leak and leak+1.
The cart cuts every value above the cap.
The leak holds the true count.

| store              | cap | leak | cart at cap-1 | cart at cap | cart above cap | cart at leak |
| ------------------ | --- | ---- | ------------- | ----------- | -------------- | ------------ |
| gymglamour.com     | 50  | 2143 | 49: ok        | 50: ok      | 51: 50         | 2143: 50     |
| monartofficial.com | 20  | 490  | 19: ok        | 20: ok      | 21: 20         | 490: 20      |
| theodderside.com   | 21  | 191  | 20: ok        | 21: ok      | 22: 21         | 191: 21      |
| wojanshop.pl       | 50  | 243  | 49: ok        | 50: ok      | 51: 50         | 243: 50      |
| icon-amsterdam.com | 40  | 104  | 39: ok        | 40: ok      | 41: 40         | 104: 40      |
| booso.pl           | 20  | 62   | 19: ok        | 20: ok      | 21: 20         | 62: 20       |

The icedstuff loyalty config holds reward stock only.
It does not hold the catalog stock.
It is not a leak.

## V2

The V2 provider reads the true stock from the page or the Storefront API.
The cart cap does not apply.
The provider runs direct. It uses no proxy.

| store              | source             | provider           |
| ------------------ | ------------------ | ------------------ |
| icon-amsterdam.com | Kaching JSON       | embedded-inventory |
| booso.pl           | Grow map           | embedded-inventory |
| wojanshop.pl       | Grow map           | embedded-inventory |
| theodderside.com   | ReStock config     | embedded-inventory |
| monartofficial.com | data-inventory     | embedded-inventory |
| gymglamour.com     | Storefront GraphQL | embedded-graphql   |
| sklepskolim.pl     | ProductStocksCache | cache-stock        |

Switch and rollback live in the config, one store at a time.
V2: `stockSource: 'embedded-json'`, `'embedded-graphql'` or
`'cache-stock'`, `mode: 'vps-get'`, `requiresProxy: false`,
`durationSeconds: 1200`.
V1: `stockSource: 'ucp-inventory'` or `'basket-reveal'`,
`mode: 'vps-mutation'`, `requiresProxy: true`.
The shared `buildEmbeddedSource` helper picks the builder from
`stockSource`.

A rollback changes the builder only.
The snapshot shape changes with it.
V2 stores the exact count. V1 stores the cap as a floor.
Expect a one-day discontinuity at the rollback.
The history shows the jump. It is not a data error.

The page path stops at a time budget. The remaining products stay
at the catalog value. The run logs `embeddedinventory.budget`.
The GraphQL path fails the task when the pull is incomplete.
It never stores a partial map. The run logs `embeddedgraphql.incomplete`.
The sklepskolim `cache-stock` path masks a product when a pull fails.
It does not fail the task. The run logs `shoperstocks.*` and the mask.
The same rule covers a missing token, a broken node shape and an empty
pull. Each case fails the task. The store keeps its last good snapshot.

Local proof on 2026-10-05 (direct, no proxy):

```
icon-amsterdam: products=124 exact=2157 null=0 top=1138  cart=40
gymglamour:     products=806 exact=3451        top=9915  cart=50
```

## Stores to rework

These stores leak the true count.
Move them to an embedded source.
The source reads the count from the product page.
The cart cap then does not apply.
All six stores are on V2 now.

- gymglamour.com
- icon-amsterdam.com
- monartofficial.com
- theodderside.com
- wojanshop.pl
- booso.pl

These stores leak the count only below the cap.
The cart message is the source.
The value at the cap stays hidden.

- sanah.shop
- wakenbake.pl
- 33mata.pl
- ooponka.com

## Stores with no public leak

These stores hide the true count above the cap.
Some stores have a Storefront token, but the token lacks the
`unauthenticated_read_product_inventory` scope.
Every public vector below returned no count.

| store                | cap | tried                                                                                                                                                   | conclusion                                          |
| -------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| hdrey.com            | 70  | PDP, .js, .json, section render, collection, recommendations, wishlist app, cart sections, permalink, market context, buyer identity, cart accumulation | no count                                            |
| pl.godsavequeens.com | 40  | PDP, .js, .json, section render, collection, recommendations, Storefront token                                                                          | token lacks the inventory scope                     |
| pl.holy.com          | 50  | PDP, .js, .json, section render, collection, recommendations, Storefront token                                                                          | token lacks the inventory scope                     |
| friendzstore.pl      | 50  | PDP, .js, .json, variants, products.json, section render, Storefront token, app proxy                                                                   | token lacks the inventory scope                     |
| dawidpodsiadlo.pl    | 50  | PDP, .js, .json, variants, products.json, section render, Storefront token                                                                              | token lacks the inventory scope                     |
| icedstuff.pl         | 20  | PDP, .js, .json, loyalty config                                                                                                                         | the config holds reward stock only, not the catalog |

## The fallback for no-leak stores

Store the cap as a floor, not as a count.
A value equal to the cap means "at least the cap".
Do not count a change at the cap as a sale.

The `atCap` marker is planned. It is not implemented yet.
No code writes it today.

## Open list

Checked on 2026-10-05:

| store            | platform | clamp | GET leak                      |
| ---------------- | -------- | ----- | ----------------------------- |
| nago.com         | shopify  | 20    | none                          |
| papitoenergy.com | shopify  | 50    | none                          |
| wasalaa.com      | shopify  | 25    | none                          |
| risky.pl         | shoper   | no    | none (basket only)            |
| wkdzik.pl        | shoper   | no    | none (basket only)            |
| e-daag.com.pl    | shoper   | no    | none (basket only)            |
| sklepskolim.pl   | shoper   | no    | ProductStocksCache, see below |
| patandrub.eu     | shoper   | ?     | not finished (timeout)        |

The sklepskolim page holds the exact stock in a base64 field:
`Shop.values.ProductStocksCache`. It decodes to
`{ "<optionValueId>": { "sid": <stockId>, "stock": <count> } }`.
It covers products with selectable variants only.
A simple product writes an empty cache. The stock endpoint still
returns its exact count.
This is a GET source for a Shoper store. V2 reads it in `cache-stock`.

The cache names the stock id of every option variant. The exact count
comes from the public endpoint
`product/getstock/product/<id>/imgwidth/500/imgheight/500/?stock=<sid>`.
It returns the exact `stock` for one stock id. It covers the base
variant, the option variants and the simple products.
`cache-stock` reads the cache for the stock ids and the names, then one
stock call per id. It runs direct. It uses no proxy.

Live proof on 2026-10-05 (developer machine, direct):
188 products, 594 variants, 594 exact counts, 0 masked, top 6103.
The cart add returned the same stock id for 21 of 21 buyable variants.
The two sources agree on the variant mapping.
Product 280: base 7119=100, cache {469:7120/0, 470:7121/18,
471:7122/4, 472:7123/21}. The cart add returned the same four ids.
Product 31: base 39=78, cache {469:5008/12, 470:5009/12, 471:5010/12,
472:5011/6, 473:5044/10}. Only option 472 is buyable.
Product 39 (simple, kubek): base 47=9.
The shop answers 503 under a fast burst. The provider paces every
request at `ratePerSecond`, retries a 429 or a 500 up to three times
with a backoff, and stops at the `durationSeconds` deadline
(`shoperstocks.budget`). A failed page or stock call masks the product:
the count becomes unknown. The provider never stores the catalog floor
`0` as a real count. The run reports the mask.

## Probe

Run the probe on the developer machine:

```
npm run clamp -w discovery -- <domain> [--cap=N]
```

The probe reads the product pages and reports every vector.
With `--cap` it verifies one count below the cap against the cart.
The probe never uses the proxy.
The probe refuses to run on the production host.

## Method notes

Probe from the developer machine only.
The VPS host `frog` is production.
A probe from the VPS can rate-limit the production egress.

The leak is per store.
Each store runs different apps.
The first step is the product page HTML.
Dump the JSON script blocks and scan for count fields.
Then try the other public endpoints.
Then try the Storefront GraphQL token.
The token works only when the store granted the inventory scope.

## Transfer

The embedded methods are plain GETs.
They run direct, like the current catalog fetch.
Direct costs zero webshare bytes.
The proxy is forbidden for these fetches.

The embedded path also removes the cart probes.
The current proxy use for these stores is about 12 MB per run.
The embedded path direct drops that to zero.

The gymglamour GraphQL path is different.
One query returns 250 products in 12 KB.
The full store is about 48 KB per run.
That path is direct too.

The cart-message stores use the cart.
The cart goes through the proxy today.
The cost is about 3 KB per variant.
