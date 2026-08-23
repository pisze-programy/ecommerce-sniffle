-- Ecommerce Pulse - initial schema
-- Stores snapshots, daily stats and diff events.

CREATE TABLE IF NOT EXISTS snapshots (
  shop TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  window TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER,
  price REAL,
  regular_price REAL,
  available INTEGER NOT NULL,
  PRIMARY KEY (shop, snapshot_at, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product
  ON snapshots (shop, product_id, snapshot_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_latest
  ON snapshots (shop, snapshot_at);

CREATE TABLE IF NOT EXISTS daily_stats (
  shop TEXT NOT NULL,
  day TEXT NOT NULL,
  units_sold INTEGER NOT NULL,
  revenue REAL NOT NULL,
  restocked INTEGER NOT NULL,
  sold_out_count INTEGER NOT NULL,
  promotion_count INTEGER NOT NULL,
  masked_count INTEGER NOT NULL,
  PRIMARY KEY (shop, day)
);

CREATE TABLE IF NOT EXISTS events (
  shop TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  from_quantity INTEGER,
  to_quantity INTEGER,
  from_price REAL,
  to_price REAL,
  units INTEGER NOT NULL,
  confidence TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_shop_day
  ON events (shop, day);
