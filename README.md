# Ecommerce Pulse

Track stock and price for e-commerce shops, every day.

See [docs/README.md](./docs/README.md).

## Quick start

```
npm install
npm run build -w packages/providers
npm test
npm run typecheck
```

## Structure

- `packages/providers` - shared providers, config, types, logger
- `backend` - Cloudflare Worker (GETs + API + storage)
- `orchestrator` - VPS runner (mutations through the proxy)
- `docs` - documentation

## VPS

The VPS has 256 MB RAM and 0 swap. It shares RAM with another cron.

NEVER run `npm install` on the VPS. It dies of out-of-memory.

Build on the developer machine. Copy the built folder and the
`node_modules` to the VPS. Then run `node dist/index.js`.

## Rules

- TypeScript strict. No `any`, no `as unknown`.
- No `??` or `||` shortcuts.
- One logger for every `try/catch`.
- Unit tests cover happy path, edge cases, mixed and wrong calls.
- No Polish comments. No undocumented code.
