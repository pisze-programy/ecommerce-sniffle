# Ecommerce Pulse - Documentation

This folder documents the whole system.

## Contents

- [ARCHITECTURE.md](./ARCHITECTURE.md) - The whole flow: CF worker, VPS orchestrator, shared providers, storage.
- [STATE.md](./STATE.md) - Where the project is now and what is next.
- [ENTITIES.md](./ENTITIES.md) - The data models for the entity graph (companies, persons, social, ads).
- [PROVIDERS.md](./PROVIDERS.md) - The 16 providers and the config that controls them.
- [DEPLOYMENT.md](./DEPLOYMENT.md) - How to build and deploy the CF worker and the VPS orchestrator.
- [PROBING.md](./PROBING.md) - How to discover the stock source for a new shop.

## Repo layout

```
ecommerce-sniffle/
  packages/providers/   shared providers, config, types, logger (source of truth)
  backend/              Cloudflare Worker (GET pipeline + API + storage)
  orchestrator/         VPS runner (mutations: basket-reveal, cart-probe)
  docs/                 this documentation
  _internal/            research notes (gitignored)
```
