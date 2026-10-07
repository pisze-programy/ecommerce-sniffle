# Cart cap - direct stock sources

This document explains the cart cap and the direct stock sources.
A shop hides the exact count in the catalog when it sets a cart cap.
The per-shop record is private. It is not in this repo.
It uses Simplified Technical English.

## The cart cap

Shopify caps a cart line. See Store settings: add-to-cart limit.
A cart probe returns the cap, not the true count.
A stock of the cap or more is masked as the cap.

Some shops render the true count in the product page HTML.
Some shops grant the inventory scope to the public Storefront token.
The cap does not apply to those GET sources.

## V2 direct sources

The V2 provider reads the true count from a GET source.
It runs direct. It uses no proxy.

| stockSource        | source                           |
| ------------------ | -------------------------------- |
| `embedded-json`    | a script on the product page     |
| `embedded-graphql` | the Storefront API quantity      |
| `cache-stock`      | the Shoper public stock endpoint |

Config: `mode: 'vps-get'`, `requiresProxy: false`,
`durationSeconds: 1200`.
V1 fallback: `stockSource: 'ucp-inventory'` or `'basket-reveal'`,
`mode: 'vps-mutation'`, `requiresProxy: true`.
The `buildEmbeddedSource` helper picks the builder from `stockSource`.

A rollback changes the builder only.
The snapshot shape changes with it.
V2 stores the exact count. V1 stores the cap as a floor.
The history shows the jump at a rollback. It is not a data error.

## The probe

Run the probe on the developer machine:

```
npm run clamp -w discovery -- <domain> [--cap=N]
```

The probe reads the product pages and reports every vector.
The probe never uses the proxy.
It refuses to run on the production host.

## Failure rules

- The GraphQL path fails the task when the pull is incomplete.
  It never stores a partial map.
- The page path stops at a time budget. The remaining products keep
  the catalog value.
- The Shoper path masks a product when a pull fails.

The shop names, the caps, and the counts live in the private notes.
