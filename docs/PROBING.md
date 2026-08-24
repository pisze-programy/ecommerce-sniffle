# Probing - how to find the stock source

This document explains how to discover the exact stock source for a shop.
It uses Simplified Technical English.

Use this before adding a new shop. The goal is a FREE stock source first.
A free source costs zero webshare. A mutation source costs webshare.

## Shopify methods (tested)

For a Shopify shop, check these in order.

### 1. products.json

```
GET https://{domain}/products.json?limit=250&page=1
```

- If `inventory_quantity` is a number -> exact stock, cf-get, free.
- If `inventory_quantity` is null -> the shop hides it. Continue.

Our shops hide it: bizuu, lamania, booso, gymglamour, hdrey, wakenbake.

### 2. Product page JSON

```
GET https://{domain}/products/{handle}.js
```

- If the response has `inventory_quantity` -> exact stock, cf-get, free.
- montiel.com reveals exact here (978 variants). The `.js` endpoint
  works where products.json hides the count.
- Some shops hide it here too. Continue.

### 3. Product page XML

```
GET https://{domain}/products/{handle}.xml
```

- If the response has `<inventory-quantity>` -> exact stock, cf-get, free.
- The endpoint exists (HTTP 200) but most shops hide the count.

### 4. Embedded inventory scripts on the product page

```
GET https://{domain}/products/{handle}
```

Look for these markers in the HTML:

- `bis-variant-data` (JSON with `inventory_quantity`) - forcer
- `variantInventoryData` (JSON with `inventory_quantity`) - misbhv
- `_RestockRocketConfig.variantsInventoryQuantity` (map of variant
  id to exact count) - gymglamour
- `variant: { id: N, ..., inventory_quantity: M }` (JS object) - noo.ma
- `stripe_product_quantity` (hidden input) - premieresociety
- `stock:{status,stock:N}` - mushi
- `inventory_quantity` anywhere in a script

If found -> exact stock, cf-get, free.

For a page that shows only the default variant, try the variant URL:
```
GET https://{domain}/products/{handle}?variant={variantId}
```
- noo.ma reveals each variant this way.

### 5. Cart probe (mutation, webshare)

```
POST https://{domain}/cart/add.js
POST https://{domain}/cart/change.js  quantity=999
```

- The change returns 422 "Only N available". N is the exact stock.
- This costs webshare (~0.7 KB per variant with the body-abort trick).

Only use this when methods 1-4 fail.

## Shoper

- The list API paginates with `limit` and `offset`, not `page`.
- Basket reveal reveals exact stock. It costs webshare.
- Some shops hide the count in the basket warning (masked).

## IdoSell (IAI) method

The product page embeds the exact stock in the `sizes` config:

```
"amount": 992,
"amount_mw": 992
```

The parser extracts `"size_key": { "type": "...", "amount": N }` per size.
Each size is a variant. `amount` is the exact count. Zero means sold out.
The page also shows "Maksymalnie możesz dodać N szt." - the same number.
foodsbyann.com is an IdoSell shop. The sitemap index points to gzipped
sub-sitemaps with `product-pol-{id}-{name}.html` urls.

## PrestaShop cart-reveal method

Some PrestaShop shops hide exact stock in the page (no quantity in
HTML, JSON-LD, or ajax). The cart clamps the quantity on add.

```
POST https://{domain}/koszyk
  token={page-token}
  id_product={id}
  id_customization=0
  qty=999999999
  add=1
  action=update
Accept: application/json, text/javascript, */*; q=0.01
```

The response JSON has `quantity` (clamped to exact) or the error
"Możesz kupić tylko N sztuk". Use one session (one page GET for the
token) and one POST per product. Extract the product id from the url
`/{category}/{id}-{slug}.html`. laboratoriumpanidomu.pl is an example.
The catalog comes from category pages (`/{category-id}-{slug}`).

## Headless Shopify (Next.js) method

Some headless Shopify stores hide exact stock in products.json, .js and
.xml. The server-rendered product page (Next.js) embeds the Shopify
Storefront API data in the RSC payload. The raw HTML has:

```
\"id\":\"gid://shopify/ProductVariant/59603108757838\",\"title\":\"36.5\",\"price\":\"$248\",\"quantityAvailable\":1
```

The parser extracts the escaped `quantityAvailable` per variant gid.
magdabutrym.com is an example. Fetch `/{locale}/product/{handle}` (the
locale path, not the bare path). The catalog comes from
`sitemap-category/all.xml`.

## Cost summary

| Source | Cost | Mode |
|---|---|---|
| products.json with inventory | free | cf-get |
| product page .js with inventory | free | cf-get |
| product page .xml with inventory | free | cf-get |
| embedded inventory script | free | cf-get |
| cart probe | ~0.7 KB / variant | vps-mutation |
| basket reveal | ~3.4 KB / product | vps-mutation |

## Workflow for a new shop

1. Run the probe-first checklist (methods 1-4).
2. If a free source exists -> add a cf-get provider.
3. If not -> add a cart-probe or basket-reveal provider.
4. Record the source in PROVIDERS.md.
