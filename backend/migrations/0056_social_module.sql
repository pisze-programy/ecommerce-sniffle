-- Ecommerce Pulse - Instagram module, second version.
-- The source is inflact.com. See docs/INSTAGRAM.md.
-- The module stores a small poster image, not a video.
-- The permalink is permanent. The media URL expires.

-- The post rows gain the permalink and the engagement counts.
ALTER TABLE social_posts ADD COLUMN permalink TEXT;
ALTER TABLE social_posts ADD COLUMN likes INTEGER;
ALTER TABLE social_posts ADD COLUMN comments INTEGER;
ALTER TABLE social_posts ADD COLUMN video_views INTEGER;

-- A story row marks a video story. The module stores the poster only.
ALTER TABLE social_stories ADD COLUMN is_video INTEGER NOT NULL DEFAULT 0;

-- The reel rows. A reel is a video post with view counts.
CREATE TABLE IF NOT EXISTS social_reels (
  platform TEXT NOT NULL,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shortcode TEXT NOT NULL,
  permalink TEXT,
  taken_at TEXT NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  play_count INTEGER,
  video_view_count INTEGER,
  media_url TEXT,
  r2_key TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (platform, id)
);

CREATE INDEX IF NOT EXISTS idx_social_reels_user
  ON social_reels (platform, user_id, taken_at DESC);

-- The daily profile snapshot. One row for each profile and each day.
CREATE TABLE IF NOT EXISTS social_profile_days (
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  handle TEXT NOT NULL,
  followers INTEGER,
  uploads INTEGER,
  avg_likes INTEGER,
  avg_comments INTEGER,
  engagement REAL,
  posts_per_day REAL,
  posts_per_week REAL,
  score INTEGER,
  is_verified INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  ad_reel_price REAL,
  ad_post_price REAL,
  ad_story_price REAL,
  country TEXT,
  keywords TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (platform, user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_social_profile_days_day
  ON social_profile_days (platform, day DESC);
