# Performance

This file shows how fast each provider runs. It also shows how much
webshare traffic each provider uses per cron run.

## The main problem

The VPS has only 256 MB of RAM. It shares this RAM with panperyskop.
An out-of-memory kill stops the executor. This is forbidden.

A reused connection uses one exit IP. The shop throttles that IP.
Then requests get a 429. This slows the provider down.

The cart probe opens a new connection for each request now. A new
connection uses a new exit IP. The shop does not throttle a fresh IP.
The probe runs parallel with 12 workers.

## How to read the table

The "call" column shows the request type.
The "place" column shows where the provider runs: CF or VPS.
The "time" column shows the measured time or an estimate.
The "webshare" column shows the traffic per cron run.

Measured times come from the task usage logs.
The estimate is 0.6 seconds per product for the embedded shops.

## The table

### Cloudflare Worker, no webshare

| Provider         | Call                | Time   | Webshare |
| ---------------- | ------------------- | ------ | -------- |
| rever            | WooCommerce html GET| ~30 s  | 0        |
| royalwatch       | WooCommerce html GET| ~30 s  | 0        |
| mushi            | custom html GET     | ~10 s  | 0        |
| premieresociety  | custom html GET     | ~1 min | 0        |

### VPS, direct IP, cookie only via webshare

| Provider         | Call                    | Time     | Webshare |
| ---------------- | ----------------------- | -------- | -------- |
| forcer           | Shopify embedded GET    | 214 s    | ~2.5 KB  |
| nago             | Shopify embedded GET    | 273 s    | ~2.5 KB  |
| misbhv           | Shopify embedded GET    | ~16 min  | ~2.5 KB  |
| gymglamour       | Shopify embedded GET    | ~34 min  | ~2.5 KB  |
| noo-ma           | Shopify embedded GET    | ~13 min  | ~2.5 KB  |
| montiel          | Shopify embedded GET    | disabled |          |
| magdabutrym      | Shopify embedded GET    | disabled |          |
| shapellx         | Storefront API GraphQL  | ~1-2 min | 0        |
| bloozie          | products.json GET       | ~1 min   | 0        |
| foodsbyann       | custom web GET          | 228 s    | 0        |
| dobrerzeczy      | Nuxt payload GET        | 3 s      | 0        |
| lexon            | Magento embedded GET    | 35 s     | ~8.5 KB  |
| influcenter      | Magento embedded GET    | disabled |          |

montiel is disabled. The shop is gone. Its products.json returns 401
from every IP. influcenter is disabled. Its shop blocked the VPS IP.

### VPS, proxy, webshare

| Provider         | Call                    | Time     | Webshare |
| ---------------- | ----------------------- | -------- | -------- |
| godssavequeens   | Shopify cart probe      | 276 s    | ~232 KB  |
| derichgallery    | Shopify cart probe      | 14 s     | ~10 KB   |
| theodderside     | Shopify cart probe      | ~5-8 min | ~500 KB  |
| monartofficial   | Shopify cart probe      | ~2-3 min | ~250 KB  |
| osmpower         | Shoper basket reveal    | 106 s    | ~422 KB  |
| emereedivine     | Shoper basket reveal    | 29 s     | ~227 KB  |
| wkdzik           | Shoper basket reveal    | 349 s    | ~1264 KB |
| sklepskolim      | Shoper basket reveal    | 433 s    | ~1863 KB |
| e-daag           | Shoper basket reveal    | ~2-3 min | ~400 KB  |
| laboratoriumpanidomu | Prestashop cart reveal | 57 s   | ~163 KB  |
| phlov            | Prestashop cart reveal  | 543 s    | ~528 KB  |

## Totals per cron pass

The full pass takes about 2.5 to 3 hours.
The executor runs tasks one after another.
The slowest shops are gymglamour, misbhv, noo-ma, phlov, sklepskolim.

The webshare traffic is about 5.5 to 6 MB per pass.
The biggest users are sklepskolim, wkdzik, phlov, osmpower.

The VPS IP is exposed to 13 direct shops. influcenter blocked the VPS
IP. This is a risk. The proxy manager logs every call and its route.
The "via" field shows "proxy" for webshare and "direct" for the VPS IP.

## Where we can gain

Three providers use the old pattern. They reuse one connection.
They run sequential. We can apply the same fix as the cart probe.

| Provider            | Current time | Estimated time after fix |
| ------------------- | ------------ | ------------------------ |
| gymglamour          | ~34 min      | ~5-8 min                 |
| misbhv              | ~16 min      | ~3-4 min                 |
| noo-ma              | ~13 min      | ~2-3 min                 |
| phlov               | 543 s        | ~60-90 s                 |
| shoper basket       | ~2-7 min     | ~1-2 min                 |

The same pattern applies everywhere. Open a new connection for each
request. Run requests in parallel. This gives four to eight times
more speed.

## The OOM problem

Option A. Dynamic concurrency.

The concurrency changes with the free memory. The value stays between
1 and 12. This is safe on 256 MB. It costs nothing.

Option B. A second VPS with 1 GB of RAM.

A bigger VPS allows more concurrent workers. The OOM risk goes away.
It costs money.

Recommendation: use option A now. Plan option B later.

## Separate problems

magdabutrym is disabled. It buffers too much memory. It caused an
out-of-memory kill. Fix the buffering before you enable it.

montiel is disabled. Its shop is gone. Its products.json returns 401
from every IP.

magdabutrym is disabled. It buffers too much memory.

influcenter is disabled. Its shop blocked the VPS IP.

## The 429 block is per connection, not per IP

This discovery came from wkdzik. The shop rate-limits the connections.

A reused keep-alive connection triggers the block. The shop returns
429 when many requests reuse one connection. The request headers do
not matter. The HTTP protocol (1.1 or 2) does not matter. A fresh
cookie does not release the block.

A fresh connection per request avoids the block. The same rate with
fresh connections returns zero 429. The webshare is not needed for
this. The VPS IP stays safe with fresh connections.

### The evidence (local test, no proxy)

| Connection mode | Result |
| --------------- | ------ |
| Reused keep-alive, concurrency 25 | 12-24% requests get 429 |
| Fresh connection per request, concurrency 25 | 0% requests get 429 |
| curl (fresh connection per request) | 0% requests get 429 |
| Different headers or HTTP version | no change |

### The rule

The mutations must use a fresh connection per request. The module
createFreshFetch does this. The catalog GETs may reuse connections.

The safe concurrency is 8. The full wkdzik pass with fresh connections
ran at zero 429 over 1203 requests.

## Option explosion prevention

Some shops expose huge option matrices. sklepskolim has an Etui
product with 1276 combinations (Marka x Model). The old reveal probed
every combination. One stock id got 2438 attempts in a single run.
This risked a VPS IP block.

The reveal now caps the combos per product. The cap is 200. A product
over the cap probes the first 200 combos and logs an explosion
warning. It stops early after 15 consecutive empty adds. The log
record is "basketreveal.option explosion".

The config may exclude stock ids per provider. The field is
excludedStockIds. The reveal skips them. sklepskolim excludes the
Etui product (5054). The shop runs three times faster.

The nested pools multiply the concurrency. The product pool (8) times
the combo pool (8) equals 64 concurrent requests. Some shops answer
with 429. The fix is a global concurrency budget. Not done yet.
