# Performance

This file explains how fast each provider runs and where we can gain speed.

## The main problem

The VPS has only 256 MB of RAM. It shares this RAM with panperyskop.
An out-of-memory kill stops the executor. This is forbidden.

The proxy reuses one connection for many requests. A reused connection
uses one exit IP. The shop throttles that IP. Then requests get a 429.
This slows the provider down.

## The fix for the cart probe

The cart probe now opens a new connection for each request. A new
connection uses a new exit IP. The shop does not throttle a fresh IP.
The probe runs parallel with 12 workers.

Measured result on godssavequeens:

- before: the task never finished in the 25 minute window
- after: 276 seconds, 1917 variants, zero masked

Measured result on derichgallery:

- 14 seconds, 58 variants, zero masked

The same fix can speed up other providers. See the table below.

## Measured times

The numbers come from the task usage logs.

| Provider            | Type                 | Time   | Request count | Note              |
| ------------------- | -------------------- | ------ | ------------- | ----------------- |
| phlov               | prestashop cart      | 615 s  | 252           | slowest, big win  |
| godssavequeens      | shopify cart         | 276 s  |               | fixed             |
| forcer              | shopify embedded     | 214 s  | 2             | big win           |
| foodsbyann          | custom web           | 228 s  | 120           | 4.7 MB response   |
| osmpower            | shoper basket        | 129 s  | 329           | big win           |
| laboratoriumpanidomu| prestashop cart      | 57 s   | 130           |                   |
| lexon               | magento embedded     | 35 s   | 3             |                   |
| emereedivine        | shoper basket        | 29 s   | 91            |                   |
| derichgallery       | shopify cart         | 14 s   |               | fixed             |
| dobrerzeczy         | custom web           | 3 s    | 3             |                   |

The whole morning pass takes about 40 to 60 minutes now.
The executor runs tasks one after another.

## Where we can gain

Three providers use the old pattern. They reuse one connection.
They run sequential. We can apply the same fix.

| Provider            | Current time | Estimated time after fix |
| ------------------- | ------------ | ------------------------ |
| prestashop (phlov)  | 615 s        | 60 to 90 s               |
| shoper basket       | 129 s        | 30 to 40 s               |
| shopify embedded    | 214 s        | about 60 s               |
| foodsbyann          | 228 s        | about 80 s               |

The pattern is the same everywhere. A reused connection uses one IP.
The shop throttles that IP. Open a new connection for each request.
Then each request uses a fresh IP. Run requests in parallel.
This gives four to eight times more speed.

## The OOM problem

Two options exist.

Option A. Dynamic concurrency.

The concurrency changes with the free memory. The formula is:
concurrency = free MB divided by 20. The value stays between 1 and 12.
This is safe on 256 MB. It costs nothing. It limits the gain to about
five to eight concurrent workers.

Option B. A second VPS with 1 GB of RAM.

A bigger VPS allows 12 to 24 concurrent workers. The OOM risk goes away.
It costs money. It needs configuration.

Recommendation: use option A now. Plan option B later.

## Separate problem

magdabutrym eats too much memory. It buffers the product page responses.
It caused an out-of-memory kill. It is skipped for now. Fix the buffering
separately.
