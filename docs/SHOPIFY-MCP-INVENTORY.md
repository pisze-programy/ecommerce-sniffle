# Shopify MCP inventory — exact stock via the MCP server

This document explains the MCP stock source. It uses Simplified Technical English.
The module lives here:
`packages/providers/src/providers/shopify/mcp-inventory.ts`.

The stock source replaces the cart-probe for derichgallery.com and
monartofficial.com. The cart-probe returned 429 and 403 at production
scale. The MCP server does not.

## The method

A Shopify shop embeds an MCP server at `https://{shop}/api/mcp`.
It is a JSON-RPC endpoint. It accepts cart mutations without the
Cloudflare challenge.

```
POST https://{shop}/api/mcp
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {
    "name": "update_cart",
    "arguments": {
      "add_items": [
        {"product_variant_id": "gid://shopify/ProductVariant/{id}",
         "quantity": 999999}
      ]
    }
  }
}
```

The shop clamps the quantity to the exact stock. The clamp shows in the
response errors.

## The response shape

The response is JSON-RPC. The count lives in a nested JSON string.

```
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"errors\":[{\"field\":[\"add_items\",\"0\",\"quantity\"],\"message\":\"You can only add 2 8×10 IN | CASH SYMBOL to the cart.\"}]}"
      }
    ]
  }
}
```

The parser reads `result.content[0].text`, parses it as JSON, and reads
the `errors` array. It keeps the entries where the field path is
`add_items / {index} / quantity`.

## Split-line clamps — sum the counts

A shop can split one clamp into several cart lines. Derichgallery runs
a BUY 2 GET 1 FREE promotion. The clamp creates one paid line and one
free line. The MCP server reports one error per line.

Example, PINK RESERVE, one probe:

```
You can only add 2 16×20 IN | PINK RESERVE to the cart.
You can only add 1 16×20 IN | PINK RESERVE to the cart.
You can only add 1 16×20 IN | PINK RESERVE to the cart.
```

The sum is 4. The cart holds 1 paid + 1 free + 2 paid, total 4.
The real stock is 4. Verified with a browser cart
(`cart.js`, each line input shows `max="4"`).

Rule: **sum all counts for one title in one response.** The sum is the
exact stock. Do not treat differing counts as a conflict.

## No-cap variants

Some variants accept the whole 999999. The response has no error for
them. The provider cannot know the exact count.

The provider writes the availability flag for them:
quantity 1 when the variant is buyable, 0 when it is not.
Derichgallery has 27 such variants. They report 1.

## Batch size

The provider sends 10 variants per request. Batch size 5 is broken on
some shops. The server emits the last item twice in a way that a
5-item request returns 6 errors. Batch size 10 is verified clean on
both pilot shops.

The provider keeps one variant per title per batch. It runs 5
concurrent workers.

A variant that gets no count in a healthy batch response is no-cap.
The provider resolves it at once with the availability flag.

## The transfer

One MCP request is about 3 KB (about 0.5 KB up, 2.5 KB down).
Catalog fetches run direct, not through the proxy. The proxy sees only
the MCP requests.

| Shop               | Requests per run | Webshare per run |
| ------------------ | ---------------- | ---------------- |
| derichgallery.com  | about 6          | about 15 KB      |
| monartofficial.com | about 35         | about 70 KB      |
| Both               | about 41         | about 85 KB      |

The measured full runs use about 0.4 MB for both shops. The 1 MB
webshare budget covers about two full runs.

## Verified results (local IP, no proxy)

| Shop               | Variants | Masked | Time  |
| ------------------ | -------- | ------ | ----- |
| derichgallery.com  | 58       | 0      | 1.3 s |
| monartofficial.com | 487      | 0      | 5.2 s |

PINK RESERVE reads 4. The browser cart reads 4. The counts match.

## The mode

The providers run as `vps-mutation` with `requiresProxy: true`.
The probes go through the webshare rotating proxy. The rotating proxy
gives a fresh IP per request. This keeps the shop cart fresh and the
VPS IP clean. The local IP also works. The MCP endpoint does not
challenge direct IPs.

## Watch out

- The old `/api/mcp` path dies on 31 Aug 2026. The replacement
  `/api/ucp/mcp` is live but broken as of today. It wants
  `meta.ucp-agent.profile` and fails with `profile_malformed`.
- The count is live, not frozen. Someone can buy between probes.
- The measureFetch wrapper must keep `status`, `ok` and `headers`
  when the response has no content-length. A spread of a Response
  object loses them. A regression test covers this.
