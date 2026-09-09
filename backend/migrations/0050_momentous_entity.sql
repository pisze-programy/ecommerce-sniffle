-- Ecommerce Pulse - add the momentous entity.
-- Momentous is a US brand (human performance supplements).
-- It has no KRS, REGON or NIP. There is no Polish registry link.
-- The Meta Ads Library page id comes from the view_all_page_id.
-- The Google advertiser id comes from ad transparency.
-- No owner is known. No financials exist on bizraport.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES ('momentous', 'Momentous', 'brand', NULL, NULL, NULL, NULL, '1448870495145917', 'AR03507643268873584641');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'momentous', 'instagram', 'live.momentous', 'https://www.instagram.com/live.momentous/'),
  ('entity', 'momentous', 'facebook', 'livemomentous', 'https://www.facebook.com/livemomentous'),
  ('entity', 'momentous', 'youtube', 'live.momentous', 'https://www.youtube.com/@live.momentous');