# Ecommerce Pulse - Documentation

This folder documents the whole system.

## Contents

- [ARCHITECTURE.md](./ARCHITECTURE.md) - The whole flow: CF worker, VPS orchestrator, shared providers, storage.
- [PROVIDERS.md](./PROVIDERS.md) - The 14 providers and the config that controls them.
- [DEPLOYMENT.md](./DEPLOYMENT.md) - How to build and deploy the CF worker and the VPS orchestrator.

## Repo layout

```
ecommerce-sniffle/
  packages/providers/   shared providers, config, types, logger (source of truth)
  backend/              Cloudflare Worker (GET pipeline + API + storage)
  orchestrator/         VPS runner (mutations: basket-reveal, cart-probe)
  docs/                 this documentation
  _internal/            research notes (gitignored)
```
