-- One row per product per shop. The url is a stable property of the
-- product, so it does not belong in every snapshot row.
CREATE TABLE IF NOT EXISTS products (
  shop TEXT NOT NULL,
  product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (shop, product_id)
);

-- Backfill from the snapshots that already carry the url.
INSERT OR IGNORE INTO products (shop, product_id, url)
SELECT DISTINCT shop, product_id, product_url
FROM snapshots
WHERE product_url IS NOT NULL;
