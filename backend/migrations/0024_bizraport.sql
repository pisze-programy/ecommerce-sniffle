-- Ecommerce Pulse - bizraport financials.
-- One row per entity. The current report year overwrites the row.

CREATE TABLE IF NOT EXISTS entity_financials (
  entity_id TEXT PRIMARY KEY,
  year INTEGER,
  assets REAL,
  revenue REAL,
  net_profit REAL,
  valuation REAL,
  fetched_at TEXT
);
