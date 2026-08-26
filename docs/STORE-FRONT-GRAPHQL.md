# Shopify Storefront GraphQL — stock pattern

This document explains how to find a fast stock source for a Shopify
shop. The odderside shop proved the pattern. The result changed from
5-8 minutes and 500 KB to 2 seconds and 0 KB of webshare.

## The old way

The cart probe adds a product to the basket. Then it changes the
quantity. The shop clamps the quantity. This gives the exact stock.

The cart probe costs a lot:

- two requests per variant
- one IP gets throttled fast
- the shop returns 429
- the run takes minutes

## The new way

The Shopify shop embeds a storefront access token in the product page.
The token lives in the shopify-features JSON. Find it in the page
source.

Look for this text:

```
"accessToken":"afdf357271d8cff8936241fda0e82a84"
```

The token opens the Storefront GraphQL API. Post a query to this URL:

```
https://{domain}/api/2024-01/graphql.json
```

Add this header:

```
X-Shopify-Storefront-Access-Token: {token}
```

Ask for the product variants and their availability:

```
{ products(first: 250) {
  edges { node {
    variants(first: 100) { edges { node { id availableForSale } } }
  } }
  pageInfo { hasNextPage }
} }
```

The response gives the availability per variant. It is a boolean.
One or zero. The exact quantity stays hidden. The shop denies the
quantityAvailable field.

## The result (theodderside)

| Metric   | Cart probe  | GraphQL   |
| -------- | ----------- | --------- |
| Time     | 5-8 minutes | 2 seconds |
| Webshare | 500 KB      | 0 KB      |
| Requests | about 6650  | 4         |
| Masked   | many (429)  | zero      |

## How to apply the pattern

1. Fetch a product page.
2. Find the access token.
3. Post the GraphQL query.
4. Map the variant id to the availability.

The variant id in the response is a GID. It looks like this:
`gid://shopify/ProductVariant/123`. Take the last part. It matches
the variant id from products.json.

## The reusable module

The module lives here:
`packages/providers/src/providers/shopify/storefront-graphql.ts`.

It exports:

- `extractStorefrontAccessToken(html)`
- `fetchStorefrontAvailability(domain, token, fetchFn)`
- `buildStorefrontAvailabilityProvider(config, logger, directFetch)`

The provider reads the catalog from products.json. Then it merges
the availability from the GraphQL. The mode is vps-get. No proxy.

## When the pattern fits

The pattern fits a shop that:

- runs on Shopify
- hides the inventory in products.json
- embeds the storefront access token in the product page
- accepts the read-only GraphQL query

The availability is enough for a stock tracker. The exact quantity
is not needed. One means in stock. Zero means sold out.
