#!/usr/bin/env node
// Recompute daily_stats from stored events. Uses the corrected aggregation
// and the per-shop sanity cap. Run from the developer machine.
//
//   cd backend
//   BACKEND_URL=... INGEST_SECRET=... node scripts/recompute-daily-stats.mjs
//   # limit to one shop:
//   SHOPS=wkdzik.pl node scripts/recompute-daily-stats.mjs
const backend = process.env.BACKEND_URL;
const secret = process.env.INGEST_SECRET;
if (backend === undefined || secret === undefined) {
  console.error('BACKEND_URL and INGEST_SECRET are required');
  process.exit(1);
}

const shopsParam = process.env.SHOPS;
const body = shopsParam === undefined ? {} : { shops: shopsParam.split(',').map((entry) => entry.trim()) };

const res = await fetch(`${backend}/admin/recompute-daily-stats`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('status', res.status);
console.log(await res.text());
