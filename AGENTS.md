# AGENTS.md

This file is the single source of truth for how to work in this repo.
Read it before any change.

## Project

Ecommerce Pulse tracks stock and price for e-commerce shops, every day.
One provider knows one shop.
Providers are shared by the Cloudflare Worker and the VPS orchestrator.

## Language

Write all code, docs, comments, and commit messages in ASD-STE100
Simplified Technical English. Use short sentences. Use one idea per
sentence. Say one thing only. Do not add filler words. No AI slop.
No Polish comments.

## Rules (must)

- TypeScript strict.
- No `any`. No `as unknown`.
- No `??`. No `||`. Use ternary or if.
- One logger for every `try/catch`.
- No empty catch. Every catch binds the error and logs it.
- The logger is the only way to report errors.
- One JSON line per log record.
- No temporary files. No garbage files.
- No undocumented code.
- Write tests for every change.
- No shortcuts. No "it should work".

## No shortcuts (must)

- Test every change end-to-end on the real system before deploy.
- End-to-end means the exact path the system runs:
  cron -> run.sh -> executor -> claim -> ingest -> snapshot.
- Never claim a change is tested without a proof of the full path.
- Unit tests alone are not enough. They never catch deploy-path errors.
- Prove it. Do not say "it should work".

## Tests (must)

Unit tests cover:

- happy path
- edge cases
- mixed calls
- incorrect calls

Every catch path has a test. The test asserts the log record.
This proves the error is seen, not swallowed.

Tests must pass before any deploy. Run: `npm test`.
Typecheck before any change: `npm run typecheck`.

## Architecture

Two layers use the same providers.

1. Cloudflare Worker (`backend`):
   - GET-only work
   - stores snapshots in D1
   - exposes the API
   - does NOT do mutations

2. VPS orchestrator (`orchestrator`):
   - does mutations (the risky work)
   - mutations go through the webshare residential proxy
   - does NOT use tailscale
   - runs on a 256 MB VPS with 0 swap, shares RAM with panperyskop
   - must exit gracefully before out-of-memory, never kill another cron
   - NEVER run npm install on the VPS. It dies of OOM. Copy the
     built folder and the node_modules from the developer machine.

The CF worker cannot use a residential proxy. This is why mutations run
on the VPS. The VPS IP stays clean.

## Providers

- `cf-get`: runs on the Cloudflare Worker. GETs only.
- `vps-mutation`: runs on the VPS. Mutations through the proxy.
- `requiresProxy: true` means the provider needs webshare.

One provider gives 100% stock coverage:

- exact count where the shop tracks stock
- 1 when available (buyable)
- 0 when sold out

## Storage

- D1: snapshots and events (queryable history)
- KV: cursors and per-shop state

## Secrets

Never put secrets in the repo.
Webshare proxy and captcha keys come from environment variables.

## Commands

```
npm install
npm run build -w packages/providers
npm run build -w orchestrator
npm test
npm run typecheck
```

Backend deploy:

```
cd backend
npx wrangler deploy
```

VPS orchestrator (1:1 mirror, no Docker):

```
cd orchestrator
npx tsup
# copy the folder and the node_modules to the VPS
# NEVER run npm install on the VPS. It dies of OOM.
# on the VPS: node dist/index.js
```
