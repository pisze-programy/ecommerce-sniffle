-- Ecommerce Pulse - meta ads snapshots.
-- Daily raw data from the Meta Ad Library API.
-- The analytics module reads this data later.

CREATE TABLE IF NOT EXISTS meta_ads (
  ad_archive_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  entity_id TEXT,
  ad_creation_time TEXT,
  start_date TEXT,
  stop_date TEXT,
  creative_body TEXT,
  link_title TEXT,
  link_caption TEXT,
  link_description TEXT,
  publisher_platforms TEXT,
  languages TEXT,
  eu_total_reach INTEGER,
  reach_by_location TEXT,
  reach_breakdown TEXT,
  target_ages TEXT,
  target_gender TEXT,
  target_locations TEXT,
  beneficiary_payers TEXT,
  creative_hash TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_entity ON meta_ads (entity_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_page ON meta_ads (page_id, last_seen DESC);

CREATE TABLE IF NOT EXISTS meta_ad_days (
  day TEXT NOT NULL,
  ad_archive_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  eu_total_reach INTEGER NOT NULL,
  PRIMARY KEY (day, ad_archive_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_days_page ON meta_ad_days (page_id, day);
