-- Backfill: copy the product url from rows that have it to null rows
-- of the same shop and product. The same product appears across snapshots,
-- so later snapshots carry the url after the ingest fix.
UPDATE snapshots
SET product_url = (
  SELECT s2.product_url
  FROM snapshots s2
  WHERE s2.shop = snapshots.shop
    AND s2.product_id = snapshots.product_id
    AND s2.product_url IS NOT NULL
  LIMIT 1
)
WHERE snapshots.product_url IS NULL;
