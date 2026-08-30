-- Human names for products and variants. The id is the stable key.
-- The title is overwritten on every ingest. Missing titles keep the
-- previous one. They do not belong in every snapshot row.
ALTER TABLE products ADD COLUMN title TEXT;

CREATE TABLE IF NOT EXISTS variants (
  shop TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  PRIMARY KEY (shop, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_variants_shop_product ON variants (shop, product_id);
