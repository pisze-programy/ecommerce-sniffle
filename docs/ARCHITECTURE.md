# Architecture

This document explains the whole flow. It uses Simplified Technical English.

## Goal

Track stock and price for e-commerce shops.
Every day, for every product, we store:

- current price and regular price
- availability and exact stock quantity where the shop tracks it

We detect changes over time: sales, restocks, promotions.

## Two execution layers

The system has two layers.

1. Cloudflare Worker (the `backend` folder)
2. VPS orchestrator (the `orchestrator` folder)

Both layers use the SAME providers from `packages/providers`.
The providers are the single source of truth for shop logic.

### Cloudflare Worker (CF)

The CF worker does:

- GET-only work (safe, never blocked):
  - Shopify products.json
  - Shoper catalog list
  - web shops (rever, dobrerzeczy, royalwatch)
- stores snapshots in D1
- exposes the API: health, latest, changes, promotions

The CF worker does NOT do mutations (no basket reveal, no cart probe).
The CF worker does NOT seed the stock baseline.

### VPS orchestrator (VPS)

The VPS orchestrator runs on a small VPS.
It does MUTATIONS (the risky work):

- Shoper basket-reveal (exact stock)
- Shopify cart-probe (exact stock)

It also does `vps-get` work:

- Shopify embedded JSON enrichment (forcer, misbhv)
  The shop rate-limits bursts, so the fetches pace at 1 per second.
  A full catalog needs about 9 minutes. The VPS has the long window.

Mutations go through a residential proxy (webshare).
The VPS sends the revealed stock to the CF worker.
It POSTs a snapshot to `BACKEND_URL/ingest` with a bearer secret.
The CF worker stores it in D1 and runs the diff.

The orchestrator is agnostic. It does not know about Cloudflare.
It only needs a URL and a secret. It can be copied to another VPS
and run as-is.

## Why this split

Research showed:

- Pure GET requests never trigger a block.
- Basket mutations trigger a per-IP block.
- A CF worker cannot use a residential proxy.

So the split is:

- CF worker: the queue broker + the GET-only shops.
- VPS: the executor. Mutations through the proxy. The VPS IP stays clean.

## The task queue

The Cloudflare worker is the broker. It holds the tasks in D1.

- The cron at 04:00 and 16:00 enqueues one task per provider per window.
- A worker claims a task. The claim is atomic. One task per shop runs
  at a time (per-shop in-flight).
- The worker leases the task for 30 minutes. If the worker dies, the
  lease expires and the task comes back to the queue.
- A finished task becomes `done`. A failed task comes back to the
  queue after a 10 minute backoff.
- After three attempts a task goes to the dead letter queue (DLQ).
  The DLQ is where masked problems are investigated.
- A task that produces masked variants is NOT stored. It fails. The
  last good snapshot stays in the database. No null quantity is ever
  written.

## The VPS executor

The VPS runs one worker loop:

1. It claims a task from the queue (vps-get or vps-mutation).
2. It checks memory. If memory is low it exits gracefully.
3. It executes the provider at its own pace.
4. It checks the snapshot for masked variants.
5. If zero masked it stores the snapshot and completes the task.
6. If any masked it fails the task. The task retries later.

The worker processes one task at a time. Each run is bounded by the
cron timeout. Tasks that do not finish are reclaimed and retried.

## Flow for one day

1. The CF cron runs at 04:00 and 16:00.
2. The CF worker enqueues the tasks for the window and reaps leases.
3. The CF worker runs the GET-only shops directly (rever, royalwatch,
   mushi, premieresociety).
4. The VPS executor polls the queue and drains the tasks.
5. The executor does basket reveals and cart probes through the proxy.
6. The executor sends the snapshots to `BACKEND_URL/ingest`.
7. The CF worker stores both snapshot kinds in D1.
8. The diff step compares today with the last snapshot.
9. The diff emits events: price change, stock change, new, removed.

## Providers

A provider knows one shop.

Each provider has:

- a config (how it runs, how often, where it is called)
- a `fetchCatalog()` method (GET)
- an optional `revealStock()` method (mutation)

The config decides the execution mode:

- `cf-get`: runs on the CF worker (GETs only)
- `vps-get`: runs on the VPS (GETs only, direct, for rate-limited shops)
- `vps-mutation`: runs on the VPS (mutations through the proxy)

See [PROVIDERS.md](./PROVIDERS.md).

## Storage

- D1: snapshots and events (queryable history)
- KV: cursors and per-shop state

## The single logger

Every `try/catch` in the code logs through the single logger.
The logger writes one JSON line per record.
This is the only way the app reports errors.

## Test policy

Unit tests cover:

- happy path
- edge cases
- mixed calls
- incorrect calls

Tests must run green before any deploy.
