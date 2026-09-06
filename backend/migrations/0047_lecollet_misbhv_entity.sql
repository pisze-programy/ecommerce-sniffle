-- Ecommerce Pulse - add the lecollet and misbhv entities.
-- lecollet: LECOLLET MAYA BOHOSIEWICZ SKA, owner Maja Bohosiewicz.
-- misbhv: MISBHV Sp. z o.o., owner Natalia Maczek.
-- The Meta Ads Library page id for lecollet comes from the
-- view_all_page_id. The Google advertiser id comes from ad transparency.
-- The financials come from bizraport (manual harvest, browser).

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES
  ('lecollet', 'LECOLLET MAYA BOHOSIEWICZ SPÓŁKA KOMANDYTOWO-AKCYJNA', 'company', '0000961736', '380751186', '7010832970', 'https://www.bizraport.pl/krs/0000961736', '244050896340976', 'AR13214034886978961409'),
  ('misbhv', 'MISBHV Sp. z o.o.', 'company', '0000843876', '368958494', '6762541281', 'https://www.bizraport.pl/krs/0000843876/misbhv-spolka-z-ograniczona-odpowiedzialnoscia', '118835658163458', 'AR01550973644761464833');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'lecollet', 'instagram', 'lecollet', 'https://www.instagram.com/lecollet/'),
  ('entity', 'lecollet', 'facebook', 'TheLeCollet', 'https://www.facebook.com/TheLeCollet/'),
  ('entity', 'lecollet', 'linkedin', 'lecolletbrand', 'https://pl.linkedin.com/company/lecolletbrand'),
  ('entity', 'lecollet', 'tiktok', 'lecollet', 'https://www.tiktok.com/@lecollet'),
  ('entity', 'misbhv', 'instagram', 'misbhv', 'https://www.instagram.com/misbhv/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES
  ('maja-bohosiewicz', 'Maja Bohosiewicz', NULL),
  ('natalia-maczek', 'Natalia Maczek', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('person', 'maja-bohosiewicz', 'instagram', 'majabohosiewicz', 'https://www.instagram.com/majabohosiewicz/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES
  ('maja-bohosiewicz', 'lecollet', 'owner', 'właściciel', NULL, NULL),
  ('natalia-maczek', 'misbhv', 'owner', 'właściciel', NULL, NULL);

INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('lecollet', 2026, 10800000, 27000000, 5000000, 41700000, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('misbhv', 2026, 5900000, 16000000, -6700000, 11000000, '2026-09-06T00:00:00.000Z');