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

- CF worker: GETs only. Safe.
- VPS: mutations through the proxy. The VPS IP stays clean.

## Flow for one day

1. The CF worker cron runs at 04:00 and 16:00.
2. The CF worker fetches catalogs and prices (GETs).
3. The VPS orchestrator runs at 04:30 and 04:45.
4. The VPS does basket reveals and cart probes (through the proxy).
5. The VPS POSTs the revealed snapshots to `BACKEND_URL/ingest`.
6. The CF worker stores both snapshot kinds in D1.
7. The diff step compares today with the last snapshot.
8. The diff emits events: price change, stock change, new, removed.

## Providers

A provider knows one shop.

Each provider has:

- a config (how it runs, how often, where it is called)
- a `fetchCatalog()` method (GET)
- an optional `revealStock()` method (mutation)

The config decides the execution mode:

- `cf-get`: runs on the CF worker (GETs only)
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
