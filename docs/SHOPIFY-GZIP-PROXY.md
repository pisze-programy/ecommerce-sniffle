# Shopify cart-probe — the standard

This document explains how the system reads the exact stock
from a Shopify shop. The method is the cart-probe.

The method fits a Shopify shop that hides the inventory in
products.json and the product pages. The cart-probe gives the
exact quantity per variant.

> Newer shops use the MCP inventory source instead. The cart-probe
> returns 429 and 403 at production scale. The MCP server does not.
> See [SHOPIFY-MCP-INVENTORY.md](./SHOPIFY-MCP-INVENTORY.md).

## The cart-probe flow

The flow has two requests per variant.

1. Add the variant to the basket.
   `POST /cart/add.js` with `id=<variantId>&quantity=1`.
   The response sets the cart cookie.

2. Change the line to a huge quantity.
   `POST /cart/change.js` with `line=1&quantity=9999`.
   The shop clamps the quantity to the available stock.
   The response says the clamped value.

The clamp message looks like this:
`{"errors":"Only 20 items were added to your cart due to availability."}`

The value 20 is the exact stock for that variant.

## Requirements

Every Shopify cart-probe shop behaves the same way.

- The User-Agent is required. Without it the shop returns 429.
- The webshare proxy is required. The local IP gets the
  Cloudflare challenge after a few probes.
- The gzip is on. The responses are small.

The same pattern was verified on 7 shops. All of them blocked
the local IP and passed through the webshare.

## The response weights

| Request          | Raw         | Gzip wire  |
| ---------------- | ----------- | ---------- |
| `cart/add.js`    | 5.2KB       | 2.1KB      |
| `cart/change.js` | 152B        | 119B       |
| products.json    | about 200KB | about 80KB |

The add response is 66 percent the product description.
The provider cancels the body after the set-cookie header.
This saves the transfer.

## The measurements per shop

The sample of 12 variants gave these per-probe values.

| Shop                 | seconds per probe | KB per variant |
| -------------------- | ----------------- | -------------- |
| booso.pl             | 2.0               | 0.9            |
| icon-amsterdam.com   | 2.0               | 1.2            |
| pl.godsavequeens.com | 1.8               | 1.0            |
| derichgallery.com    | 2.25              | 1.3            |
| monartofficial.com   | 2.0               | 1.1            |
| hdrey.com            | 2.1               | 1.6            |
| wakenbake.pl         | 1.7               | 0.9            |

## The full run estimates

The provider runs 12 probes in parallel. The table shows the
estimated run time and the webshare transfer.

| Shop               | Variants | Run time | Webshare |
| ------------------ | -------- | -------- | -------- |
| monartofficial.com | 487      | 1.4 min  | 0.63MB   |
| derichgallery.com  | 58       | 0.2 min  | 0.12MB   |
| wakenbake.pl       | 46       | 0.1 min  | 0.05MB   |
| icon-amsterdam.com | 2232     | 6.2 min  | 2.80MB   |
| hdrey.com          | 1063     | 3.1 min  | 2.15MB   |

The three small shops fit the two-minute batch.
The two big shops need a separate cron window.

## The VPS cron

The batch cron runs the providers that fit two minutes.
The two big shops run outside the batch.

| Shop               | Cron entry   |
| ------------------ | ------------ |
| icon-amsterdam.com | `0 16 * * *` |
| hdrey.com          | `15 4 * * *` |

Add these entries to the VPS crontab. The executor runs the
shop at its own time.

## The code

The module lives here:
`packages/providers/src/providers/shopify/cart-probe.ts`.

It exports `buildCartProbeProvider`. The config sets
`mode: vps-mutation` and `requiresProxy: true`.
