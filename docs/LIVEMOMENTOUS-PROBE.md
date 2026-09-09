# LIVEMOMENTOUS — recon probe

This document records the stock-source probe for livemomentous.com.
It uses Simplified Technical English.
Probe date: 2026-09-09.

## The shop

- Domain: `www.livemomentous.com`
- Platform: Shopify (shop `topical-edge.myshopify.com`)
- Currency: USD
- Catalog: 89 products, 149 variants
- Bot vendor: none found. The shop served every GET without a challenge.

## The catalog

The full catalog fits one request:

```
GET https://www.livemomentous.com/products.json?limit=250
```

It returns 89 products and 149 variants.
The request runs direct, without the proxy.

## The stock sources, tested in order

### products.json — hides the count

`inventory_quantity` is `null` for all 149 variants.
The count is hidden. This source is useless alone.
It still gives the handles, variant ids, prices and the
`available` flag for the catalog.

### product .js — clamps at 60

```
GET https://www.livemomentous.com/products/{handle}.js
```

The count clamps at 60. Any stock above 60 reads as 60.
The value 60 is not the exact count. 143 of 149 variants read 60.

Proof: `trendproof-mens-shirt`.

| Variant  | .js | .xml |
| -------- | --- | ---- |
| Small    | 42  | 42   |
| Medium   | 60  | 78   |
| Large    | 60  | 195  |
| X-Large  | 57  | 57   |
| XX-Large | 8   | 8    |

Values equal to or below 60 match between the sources.
Values above 60 read as 60 in the .js endpoint.

### product .xml — exact count, free

```
GET https://www.livemomentous.com/products/{handle}.xml
```

The XML carries `<inventory-quantity type="integer">N</inventory-quantity>`
per variant. The value N is the exact stock.

The full scan of all 89 pages gave 134 distinct values out of
149 variants. Range: 4 to 532459. Only 13 values end in zero.
No clamp is visible.

The scan paces at one request per second. A faster burst gets 429.
At one per second the scan returned zero failures.

## The source choice

The provider uses:

- catalog: `products.json` (one request, direct)
- stock: one `products/{handle}.xml` per product (89 requests, direct)

The source is `xml-inventory`. The mode is `cf-get`.
It costs zero webshare. The proxy is not used.

The MCP or UCP cart is not needed. The XML gives the exact count
for free. The `.js` clamp and the product page scripts are not used.

## Config

See `packages/providers/src/config.ts`, provider id `momentous`.

- domain: `www.livemomentous.com` (the bare domain 301s product pages)
- mode: `cf-get`
- stockSource: `xml-inventory`
- ratePerSecond: 1
- durationSeconds: 180
- requiresProxy: false
- entityId: `momentous`
