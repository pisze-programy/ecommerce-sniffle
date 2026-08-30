# STATE.md

This file tells you where the project is now.

## What the system does

Ecommerce Pulse checks stock and price for e-commerce shops.
It does this every day.
One provider knows one shop.
One provider covers stock at 100%:

- exact count where the shop tracks stock
- 1 when a product is buyable
- 0 when a product is sold out

## How it runs

Two layers use the same providers.

1. Cloudflare Worker (`backend`).
   It does GET work only.
   It stores snapshots in D1.
   It serves the dashboard.
   It does no mutations.

2. VPS orchestrator (`orchestrator`).
   It does mutations through the residential proxy.
   It runs on a small VPS (256 MB, no swap).
   It shares RAM with another cron.
   It must exit before out-of-memory.

The worker cannot use the proxy.
This is why mutations run on the VPS.

## Storage

- D1: snapshots, events, daily stats, products, names
- KV: cursors and per-shop state

## What works today

- 49 shops in the config.
  Every shop has an explicit currency (PLN, EUR, or USD).
  The dashboard converts to PLN at display time.
- Product and variant names.
  Migration `0008_names.sql` added them.
  The backfill ran for all 31 active shops.
- The dashboard is a Tabler page.
  It has:
  - a dashboard with a shops table
  - a shop page with a summary, price chart, day picker
  - changes for morning and evening (sortable, collapsible)
  - a stock table (search, filter, sort)
  - low-stock, price-drop, and top-seller views
- Numeric columns sort by number, not by text.
- The morning and evening changes are collapsed by default.
- The type filter shows counts summed from both seeds.
- Tests: 807 pass, 1 fails.
  The failure is a known date flake in a dashboard test.
- Typecheck passes.

## Deploy status

- The worker is live at:
  `https://ecommerce-sniffle-backend.dev-4cb.workers.dev`
- The VPS orchestrator lives on host `frog`:
  `/home/frog/ecommerce-sniffle/orchestrator/dist`
- Deploy uses `scp` (rsync is not on the VPS).
- Never run `npm install` on the VPS. It dies of OOM.
- Apply migrations with `wrangler d1 execute --file=...`.
  Do not use `d1 migrations apply`. It replays old steps and fails.

## What is next

The entities pilot is built and live.
The data models are in `ENTITIES.md`.
The harvested firm data is in `ENTITY-DATA.md`.
Entities live in D1 (migrations `0009_entities.sql`, `0011_shops.sql`).
The shop page shows the entity sections (Podmiot, Powiązania) and the Social card.
The Podmiot card shows bizraport financials (aktywa, przychód, zysk, wartość)
with the caption 'Dane z Bizraport'. The data is a manual browser backfill.
The social scraper is a manual admin trigger for now.
18 shops have an entity with a KRS and social profiles.

Remaining work:

1. The Meta Ads scraper.
   It uses the public Meta Ad Library.
   It shows active ads, countries, and dates.
   We estimate cost and CPA:
   - cost = impressions / 1000 x CPM range (15-30 PLN for PL beauty)
   - CPA = cost / units sold
     Blocked on the Meta app review.

2. The social scraper cron.
   It is a manual trigger now.
   It becomes a daily cron on the PRO plan.

3. Facebook posts and stories.
   They need a separate provider.

4. The OpenRouter daily summary and TikTok and Google Ads.
   They are deferred.

## Known limits

- One test fails on a date boundary.
- Media compression is not decided yet.
- The OpenRouter daily summary is deferred.
- TikTok and Google Ads are deferred.
