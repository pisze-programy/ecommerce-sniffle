import { ALL_MODULES, createLogger, consoleSink, createRegistry } from "@ecommerce-sniffle/providers";
import { aggregateDaily, diffSnapshots } from "@ecommerce-sniffle/analysis";

function variantToState(productId, variant) {
  return {
    productId,
    variantId: variant.id,
    quantity: variant.quantity,
    price: variant.price.amount,
    regularPrice: variant.regularPrice === null ? null : variant.regularPrice.amount,
    available: variant.available,
  };
}

function catalogToSnapshot(catalog, window, snapshotAt) {
  const variants = [];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variants.push(variantToState(product.id, variant));
    }
  }
  return { shop: catalog.domain, snapshotAt, window, variants };
}

const logger = createLogger(consoleSink);
const registry = createRegistry(ALL_MODULES);
const rever = registry.getModule("rever").build({ logger });

logger.info("dryrun.rever.fetch", {});
const catalog = await rever.fetchCatalog();

let variants = 0;
let withExactQty = 0;
let unavailable = 0;
let priceSum = 0;
for (const product of catalog.products) {
  for (const variant of product.variants) {
    variants += 1;
    if (variant.quantity !== null) {
      withExactQty += 1;
    }
    if (!variant.available) {
      unavailable += 1;
    }
    if (variant.price.amount > 0) {
      priceSum += 1;
    }
  }
}

logger.info("dryrun.rever.coverage", {
  products: catalog.products.length,
  variants,
  withExactQty,
  unavailable,
  withPrice: priceSum,
});

const snapshotAt = new Date().toISOString();
const snapshot = catalogToSnapshot(catalog, "evening", snapshotAt);
logger.info("dryrun.rever.seed", { shop: snapshot.shop, variants: snapshot.variants.length });

// second run: simulate a sale of 2 units on the first tracked variant with qty > 2
const secondCatalog = structuredClone(catalog);
let modified = false;
for (const product of secondCatalog.products) {
  for (const variant of product.variants) {
    if (variant.quantity !== null && variant.quantity > 2) {
      variant.quantity = variant.quantity - 2;
      modified = true;
      break;
    }
  }
  if (modified) {
    break;
  }
}
const secondSnapshot = catalogToSnapshot(secondCatalog, "morning", new Date().toISOString());
const events = diffSnapshots(snapshot, secondSnapshot);
const day = snapshotAt.slice(0, 10);
const stats = aggregateDaily({ shop: snapshot.shop, day, events });

logger.info("dryrun.rever.diff", {
  events: events.length,
  firstEventType: events.length === 0 ? null : events[0].type,
  unitsSold: stats.unitsSold,
  revenue: stats.revenue,
});

console.log("\nDAILY_STATS", JSON.stringify(stats, null, 2));
