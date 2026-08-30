#!/usr/bin/env node
// Fetch every shop catalog and push its product and variant names to the
// backend. Prints the measured counts per shop. Run from the developer
// machine. The catalog fetch is the exact path the system runs.
//
//   cd backend
//   BACKEND_URL=... INGEST_SECRET=... node scripts/backfill-names.mjs
//   # limit to one shop:
//   SHOPS=icon-amsterdam.com node scripts/backfill-names.mjs
import { createDefaultRegistry, buildLogger } from '@ecommerce-sniffle/providers';

const backend = process.env.BACKEND_URL;
const secret = process.env.INGEST_SECRET;
if (backend === undefined || secret === undefined) {
  console.error('BACKEND_URL and INGEST_SECRET are required');
  process.exit(1);
}

const shopsParam = process.env.SHOPS;
const only = shopsParam === undefined ? null : new Set(shopsParam.split(',').map((entry) => entry.trim()));

const registry = createDefaultRegistry();
const logger = buildLogger();

let ok = 0;
let failed = 0;
for (const module of registry.modules) {
  if (!module.config.enabled) {
    continue;
  }
  if (only !== null && !only.has(module.config.domain)) {
    continue;
  }
  const provider = module.build({ logger, directFetch: fetch });
  try {
    const catalog = await provider.fetchCatalog();
    const products = [];
    const variants = [];
    let variantsTotal = 0;
    for (const product of catalog.products) {
      const title = typeof product.title === 'string' ? product.title.trim() : '';
      if (title.length > 0) {
        products.push({ productId: product.id, url: product.url, title });
      }
      for (const variant of product.variants) {
        variantsTotal += 1;
        const vTitle = typeof variant.title === 'string' ? variant.title.trim() : '';
        if (vTitle.length > 0 && vTitle !== 'default' && vTitle !== 'Default Title') {
          variants.push({ productId: product.id, variantId: variant.id, title: vTitle });
        }
      }
    }
    const res = await fetch(`${backend}/admin/upsert-names`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: module.config.domain, products, variants }),
    });
    const response = await res.text();
    console.log(
      JSON.stringify({
        shop: module.config.domain,
        platform: module.config.platform,
        products: catalog.products.length,
        titledProducts: products.length,
        variants: variantsTotal,
        usefulVariants: variants.length,
        sample: products[0] === undefined ? null : products[0].title,
        status: res.status,
        response,
      })
    );
    if (res.ok) {
      ok += 1;
    } else {
      failed += 1;
    }
  } catch (error) {
    failed += 1;
    console.log(JSON.stringify({ shop: module.config.domain, platform: module.config.platform, error: String(error) }));
  }
}
console.log(JSON.stringify({ summary: true, ok, failed }));
