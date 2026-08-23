# Deployment

This document explains how to build and deploy.
It uses Simplified Technical English.

## Build once, on the developer machine

Run from the repo root:

```
npm install
npm run build -w packages/providers
npm run build -w orchestrator
npm test
npm run typecheck
```

## Cloudflare Worker (backend)

The worker bundles its own source at deploy time.

```
cd backend
npx wrangler deploy
```

Dry run without uploading:

```
npx wrangler deploy --dry-run --outdir dist
```

## VPS orchestrator

The orchestrator builds a self-contained bundle in `orchestrator/dist/`.
The bundle includes the shared providers.

```
cd orchestrator
npx tsup
```

### Copy to the VPS (1:1 mirror)

No Docker. The VPS runs Node only.

1. Copy the `orchestrator` folder to the VPS.
2. On the VPS: `npm ci --omit=dev` (installs `undici`).
3. Create a `.env` file next to the orchestrator with the proxy URL:

```
WEBSHARE_URL=http://user:pass@p.webshare.io:80
CAPTCHA_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BACKEND_URL=https://ecommerce-sniffle-backend.<account>.workers.dev
INGEST_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The values are secrets. Do not put them in the repo.
`CAPTCHA_KEY` is the 2captcha API key. It is used only when a shop
shows a solvable Turnstile widget. A missing key disables solving.
`BACKEND_URL` and `INGEST_SECRET` point the orchestrator at the ingest
endpoint. The secret must match the one set with
`wrangler secret put INGEST_SECRET`.

4. Create a launcher `run.sh` in the orchestrator folder:

```
#!/bin/sh
set -e
cd /path/to/orchestrator
if [ -f ../.env ]; then
  . ../.env
fi
if [ -n "$WEBSHARE_URL" ]; then
  export HTTPS_PROXY="$WEBSHARE_URL"
  export NODE_USE_ENV_PROXY="1"
fi
export CAPTCHA_KEY
export BACKEND_URL
export INGEST_SECRET
exec node dist/index.js
```

`NODE_USE_ENV_PROXY` makes Node route every fetch through the proxy.
`export CAPTCHA_KEY` passes the 2captcha key to the Node process.
`export BACKEND_URL` and `export INGEST_SECRET` pass the ingest target.
Mutations go through the webshare residential proxy.
The launcher holds no secrets.

5. Run the launcher: `./run.sh`.

The bundle is agnostic. It does not depend on Cloudflare.
Copy it to any other VPS and it runs the same way.

### VPS cron

Add cron lines on the VPS. Use `flock` to prevent two runs at once.
Use `timeout` to cap each run. Use `MUTATION_SHOPS` to split the shops
so every run fits the timeout. The value is a comma-separated list of
provider ids. An empty value runs all mutation shops.

```
30 4 * * * flock -n /tmp/ecp-cron.lock timeout 600 MUTATION_SHOPS=booso,gymglamour,hdrey,wakenbake /path/to/orchestrator/run.sh >> /var/log/ecp.log 2>&1
45 4 * * * flock -n /tmp/ecp-cron2.lock timeout 600 MUTATION_SHOPS=arustamian,e-daag,emereedivine,sklepskolim,wkdzik /path/to/orchestrator/run.sh >> /var/log/ecp.log 2>&1
```

The cart-probe shops run at 04:30. The basket-reveal shops run at 04:45.
Each pass fits in the 10 minute timeout.

### Memory limit on the VPS

The VPS has a 250 MB RAM limit and shares RAM with another cron job.
The orchestrator protects itself:

- it checks available memory before each provider
- it exits gracefully when memory is below 60 MB
- it never lets the OS kill the other job

The orchestrator stays well below the limit:

- Node.js baseline: about 20 MB
- no browser, no docker, no heavy libraries
- sequential processing, one product at a time

## Storage bindings

Add D1 and KV bindings to `backend/wrangler.toml` before the first real deploy.

```
[[d1_databases]]
binding = "DB"
database_name = "ecommerce-sniffle"
database_id = "..."

[[kv_namespaces]]
binding = "STATE"
id = "..."
```
