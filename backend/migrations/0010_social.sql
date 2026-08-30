-- Ecommerce Pulse - social scraper
-- Daily Instagram posts and stories. No backfill, no history updates.

CREATE TABLE IF NOT EXISTS social_profiles (
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  full_name TEXT,
  PRIMARY KEY (platform, user_id)
);

CREATE TABLE IF NOT EXISTS social_posts (
  platform TEXT NOT NULL,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shortcode TEXT NOT NULL,
  media_type TEXT NOT NULL,
  is_reel INTEGER NOT NULL DEFAULT 0,
  taken_at TEXT NOT NULL,
  caption TEXT,
  media_urls TEXT NOT NULL,
  is_paid_partnership INTEGER NOT NULL DEFAULT 0,
  is_commercial INTEGER NOT NULL DEFAULT 0,
  tagged_users TEXT NOT NULL,
  r2_key TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (platform, id)
);

CREATE TABLE IF NOT EXISTS social_stories (
  platform TEXT NOT NULL,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_urls TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  expiring_at TEXT NOT NULL,
  is_paid_partnership INTEGER NOT NULL DEFAULT 0,
  is_commercial INTEGER NOT NULL DEFAULT 0,
  has_cta_sticker INTEGER NOT NULL DEFAULT 0,
  mentions TEXT NOT NULL,
  r2_key TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (platform, id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user
  ON social_posts (platform, user_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_stories_user
  ON social_stories (platform, user_id, taken_at DESC);
