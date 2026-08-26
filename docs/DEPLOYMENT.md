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
2. Copy `node_modules` (only `undici`, about 2.4 MB) from the
   developer machine. NEVER run `npm install` on the VPS. The VPS
   has 256 MB RAM and 0 swap. `npm install` dies of out-of-memory
   and can kill the other cron job on the same VPS.
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

### VPS cron (executor)

The VPS runs one worker. The worker polls the Cloudflare queue for
tasks and executes one task at a time. Each run is bounded by the
`timeout`. A task that does not finish is reclaimed by the queue
after its lease expires and retried later.

```
10,40 4-8 * * * flock -n /tmp/ecp-exec.lock timeout 1500 /path/to/orchestrator/run.sh >> /var/log/ecp.log 2>&1
10,40 16-20 * * * flock -n /tmp/ecp-exec2.lock timeout 1500 /path/to/orchestrator/run.sh >> /var/log/ecp.log 2>&1
```

The worker runs every 30 minutes inside the morning window
(04:10-08:40) and the evening window (16:10-20:40). It drains the
queue until it is empty or the timeout hits. The `flock` prevents two
worker runs at once. The queue lives on the Cloudflare worker in D1.

### Cloudflare cron (queue broker)

The Cloudflare worker enqueues one task per enabled provider per
window. It also reaps expired leases and moves exhausted tasks to the
dead letter queue.

```
[triggers]
crons = ["0 4 * * *", "0 16 * * *"]
```

The morning cron at 04:00 enqueues the morning tasks. The evening
cron at 16:00 enqueues the evening tasks. The worker drains each
window twice a day.

A task that produces masked variants is NOT stored. The task fails and
comes back to the queue after a 10 minute backoff. After three
attempts the task goes to the dead letter queue for investigation.
The last good snapshot stays in the database.

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

NEVER run `npm install` or `npm ci` on the VPS. The install step
needs more memory than the VPS has. It dies of out-of-memory.
Copy the built folder and the `node_modules` from the developer
machine instead.

Verify the block with this command on the VPS:

```
/home/frog/check-npm-block.sh
```

The script lives in `orchestrator/check-npm-block.sh` in the repo.
It proves that `npm install` is blocked and that other npm commands
still work.

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
