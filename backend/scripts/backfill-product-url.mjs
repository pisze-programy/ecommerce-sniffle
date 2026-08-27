#!/usr/bin/env node
// One-time backfill: store product_url in the snapshots for the numeric-id
// platforms (shopify, shoper). Run from the developer machine (the local
// IP reaches every shop API). The html/woocommerce shops use the url as the
// product id, so they need no backfill.
//
//   cd backend
//   BACKEND_URL=... INGEST_SECRET=... node scripts/backfill-product-url.mjs
import { PROVIDERS } from '@ecommerce-sniffle/providers';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.ok) {
      return res.json();
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  return null;
}

async function shopifyUrls(domain) {
  const map = new Map();
  let page = 1;
  while (page <= 100) {
    const data = await fetchJson(`https://${domain}/products.json?limit=250&page=${page}`);
    if (data === null) {
      break;
    }
    for (const product of data.products ?? []) {
      map.set(String(product.id), `https://${domain}/products/${product.handle}`);
    }
    if ((data.products ?? []).length < 250) {
      break;
    }
    page += 1;
  }
  return map;
}

async function shoperUrls(domain) {
  const map = new Map();
  let offset = 0;
  while (true) {
    const data = await fetchJson(`https://${domain}/webapi/front/pl_PL/products/PLN/list?limit=50&offset=${offset}`);
    if (data === null) {
      break;
    }
    const list = data.list ?? [];
    for (const product of list) {
      if (product.url !== undefined) {
        map.set(String(product.id), product.url);
      }
    }
    if (list.length < 50 || offset + list.length >= (data.count ?? 0)) {
      break;
    }
    offset += list.length;
  }
  return map;
}

const backend = process.env.BACKEND_URL;
const secret = process.env.INGEST_SECRET;
if (backend === undefined || secret === undefined) {
  console.error('BACKEND_URL and INGEST_SECRET are required');
  process.exit(1);
}

const entries = [];
for (const config of PROVIDERS) {
  if (!config.enabled) {
    continue;
  }
  let map;
  if (config.platform === 'shopify') {
    map = await shopifyUrls(config.domain);
  } else if (config.platform === 'shoper') {
    map = await shoperUrls(config.domain);
  } else {
    continue;
  }
  for (const [productId, url] of map) {
    entries.push({ shop: config.domain, productId, url });
  }
  console.log(`${config.id}: ${map.size} urls`);
}

if (entries.length === 0) {
  console.log('no entries');
  process.exit(0);
}

const res = await fetch(`${backend}/backfill/product-url`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ entries }),
});
console.log('status', res.status);
console.log(await res.text());
