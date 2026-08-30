# Shopify UCP migration — exact stock after the MCP shutdown

This document explains the move from the old Shopify MCP to UCP.
It uses Simplified Technical English.

## The situation

The old MCP path `/api/mcp` dies on 31 Aug 2026.
The replacement is `/api/ucp/mcp`. It is live.
UCP means Universal Commerce Protocol. Shopify and Google built it.

ACP is not for us. ACP means Agentic Commerce Protocol.
OpenAI and Stripe built it. It handles checkout and payments.
It gives no exact stock. Ignore it.

## The method

We POST to `https://{shop}/api/ucp/mcp`.
The request is JSON-RPC. It is the same shape as the old MCP.

Every call carries an agent profile.
The profile lives in `arguments.meta.ucp-agent.profile`.
The profile is a JSON file. It declares the protocol version
and the capabilities. We host it at a public HTTPS URL.

Without the profile, the shop answers `UCP discovery failed`.

## The clamp

We call `create_cart` with a huge quantity.
The shop clamps the quantity to the exact stock.

The answer holds `line_items[].quantity`.
The number is the exact stock. Example: 60.
The answer also holds `messages[]`.
The message code is `merchandise_not_enough_stock`.

When the shop accepts the whole quantity, there is no message.
The stock has no cap. We write 1 for available, 0 for sold out.

The clamp is cleaner than the old MCP. The old MCP returned
a text error. UCP returns a number.

## Sold-out variants

A sold-out variant is missing from `line_items`.
The shop marks it with a `merchandise_out_of_stock` message.
The missing count equals the message count on every test.
A variant missing from `line_items` is quantity 0.
Do not map messages to variants by title.

## The transfer

The UCP response is bigger than the old MCP. It embeds the
negotiated capabilities and the full cart. It sends the same
data twice: once in `content[0].text`, once in `structuredContent`.

The `Accept-Encoding: gzip` request cuts the proxy transfer.
Measured through the webshare proxy:

| Probe        | Without gzip | With gzip | Ratio |
| ------------ | ------------ | --------- | ----- |
| one variant  | 10.8 KB      | 2.6 KB    | 4.1x  |
| batch of 470 | 590 KB       | 53 KB     | 11.1x |

The webshare proxy meters the compressed bytes.
The gzip header is the single biggest saving.
Shopify rejects a gzipped request body. Do not compress it.

The batch size matters less after gzip. A batch of 100 is
verified clean on icedstuff. A batch of 1475 returns an
invalid error. The shop caps the cart line count.
A batch rejected as invalid is split in half and retried.

The catalog `products.json` runs direct from the VPS IP
with the browser headers. It does not use the proxy.
It does not need gzip.

## The profile

The agent profile drives the negotiated payload. A profile
with only the cart capability returns a small payload.
The profile lives on the worker:
`https://ecommerce-sniffle-backend.dev-4cb.workers.dev/ucp/agent-profile.json`.

## The provider

The UCP stock source is `ucp-inventory`.
The module lives here:
`packages/providers/src/providers/shopify/implementations/ucp-inventory.ts`.
It does not change the old `mcp-inventory`.

The first active shop is icedstuff.pl. It uses the UCP source.
Its catalog has 1475 variants. The run is about 0.4 MB with gzip.
The second active shop is divesmed.pl. Its catalog has 31 products.

## The catalog tools

`get_product` and `lookup_catalog` return the price and the
list price. They return only boolean availability. They give
no exact count. The cart clamp stays the only way to the
exact stock.

## Verified results

Date: 2026-08-29. Shop: sodastream.pl.

We sent `create_cart` with quantity 999999.
The answer returned quantity 60.
The message code was `merchandise_not_enough_stock`.

Date: 2026-08-29. Shop: icedstuff.pl.

A probe of the BTS set returned quantity 20.
A batch of 470 returned 404 line items. The missing 66 were
sold out. Single probes of the missing ones all returned 0.
The shop adds an auto-gift to the real cart. The UCP probe
does not run the shop scripts. The gift does not enter the
probe response.

All 12 active Shopify shops have `/api/ucp/mcp`.
All 12 have the `update_cart` tool.

## The migration plan

1. The `ucp-inventory` source is live for icedstuff.pl.
2. The profile is hosted on the worker.
3. The old shops still run `mcp-inventory`. They stay until
   the old `/api/mcp` dies on 31 Aug 2026.
4. Migrate the old shops one by one. Flip the stock source
   to `ucp-inventory` and run the full path on the VPS.
   Masked must be 0.
5. Finish before 31 Aug 2026.
