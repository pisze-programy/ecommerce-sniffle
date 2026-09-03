-- Ecommerce Pulse - Google Ads snapshots.
-- Daily raw data from the Ads Transparency Center BigQuery dataset.
-- The analytics module reads this data later.
-- Advertiser ids were resolved by hand in the Transparency Center UI.
-- One advertiser per domain. derichgallery runs US ads only, outside
-- the EEA scope of the dataset, so it stays empty on purpose.

ALTER TABLE entities ADD COLUMN google_advertiser_id TEXT;

CREATE TABLE IF NOT EXISTS google_ads (
  creative_id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL,
  entity_id TEXT,
  disclosed_name TEXT,
  format TEXT,
  topic TEXT,
  page_url TEXT,
  first_shown TEXT,
  last_shown TEXT,
  imp_lo INTEGER,
  imp_hi INTEGER,
  audience TEXT,
  surfaces TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_ads_entity ON google_ads (entity_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_advertiser ON google_ads (advertiser_id, last_seen DESC);

CREATE TABLE IF NOT EXISTS google_ad_days (
  day TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  imp_lo INTEGER NOT NULL,
  imp_hi INTEGER NOT NULL,
  PRIMARY KEY (day, creative_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ad_days_advertiser ON google_ad_days (advertiser_id, day);

UPDATE entities SET google_advertiser_id = 'AR10613569593844695041' WHERE id = 'laboratoriumpanidomu';
UPDATE entities SET google_advertiser_id = 'AR10850101757892100097' WHERE id = 'theodderside';
UPDATE entities SET google_advertiser_id = 'AR02624468714300375041' WHERE id = 'gymglamour';
UPDATE entities SET google_advertiser_id = 'AR18296250412522536961' WHERE id = 'icedstuff';
UPDATE entities SET google_advertiser_id = 'AR05111126874558300161' WHERE id = 'rever';
UPDATE entities SET google_advertiser_id = 'AR13839609621104295937' WHERE id = 'nago';
UPDATE entities SET google_advertiser_id = 'AR08078258172906700801' WHERE id = 'risky';
UPDATE entities SET google_advertiser_id = 'AR04836597633059389441' WHERE id = 'wkdzik';
UPDATE entities SET google_advertiser_id = 'AR00552899729948672001' WHERE id = 'godsavequeens';
UPDATE entities SET google_advertiser_id = 'AR15120398607125053441' WHERE id = 'dives-med';
UPDATE entities SET google_advertiser_id = 'AR09370252548214095873' WHERE id = 'dobrerzeczy';
UPDATE entities SET google_advertiser_id = 'AR05771715255822450689' WHERE id = 'hdrey-group';
UPDATE entities SET google_advertiser_id = 'AR01891244945637900289' WHERE id = 'icon-amsterdam';
UPDATE entities SET google_advertiser_id = 'AR01494687084735102977' WHERE id = 'premieresociety';
UPDATE entities SET google_advertiser_id = 'AR05788728506045169665' WHERE id = 'royalwatch';
UPDATE entities SET google_advertiser_id = 'AR14394729058871017473' WHERE id = 'wojanshop';
UPDATE entities SET google_advertiser_id = 'AR09877526823397490689' WHERE id = 'e-daag';
UPDATE entities SET google_advertiser_id = 'AR02480555544306253825' WHERE id = 'patandrub';
UPDATE entities SET google_advertiser_id = 'AR07798408660928954369' WHERE id = 'zerosklep';
UPDATE entities SET google_advertiser_id = 'AR15511961721710313473' WHERE id = 'beaumont';
