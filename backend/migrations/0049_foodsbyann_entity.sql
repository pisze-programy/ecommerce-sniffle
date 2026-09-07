-- Ecommerce Pulse - add the foodsbyann entity.
-- The firm is Levann Sp. z o.o. Anna Lewandowska is the owner.
-- The Meta Ads Library page id comes from the view_all_page_id.
-- The Google advertiser id comes from ad transparency.
-- The financials come from bizraport (manual harvest, browser).

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES ('foodsbyann', 'Levann Sp. z o.o.', 'company', '0000897526', '363642355', '5242793099', 'https://www.bizraport.pl/krs/0000897526/levann-spolka-z-ograniczona-odpowiedzialnoscia', '1697470517161613', 'AR01055549785643155457');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'foodsbyann', 'instagram', 'foods_by_ann', 'https://www.instagram.com/foods_by_ann/'),
  ('entity', 'foodsbyann', 'facebook', 'FoodsByAnn', 'https://www.facebook.com/FoodsByAnn/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('anna-lewandowska', 'Anna Lewandowska', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'anna-lewandowska', 'instagram', 'annalewandowska', 'https://www.instagram.com/annalewandowska/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('anna-lewandowska', 'foodsbyann', 'owner', 'właściciel', NULL, NULL);

INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('foodsbyann', 2026, 8500000, 30700000, 1100000, 27300000, '2026-09-07T00:00:00.000Z');