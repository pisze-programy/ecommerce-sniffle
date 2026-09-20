-- Ecommerce Pulse - add the ooponka entity.
-- Ooponka spolka z ograniczona odpowiedzialnoscia, Staszow,
-- ul. gen. Wladyslawa Sikorskiego 17, 28-200 Staszow.
-- KRS 0001188067, NIP 5273176746, REGON 542443568.
-- The bizraport report exists for the KRS.
-- The Meta Ads Library page id comes from the view_all_page_id.
-- The Google advertiser id comes from ad transparency.
-- The owner is Patrycja Wasala-Oponowicz, wiceprezes zarzadu.
-- The same person owns the wasalaa shop.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES ('ooponka', 'Ooponka sp. z o.o.', 'company', '0001188067', '542443568', '5273176746', 'https://www.bizraport.pl/krs/0001188067/ooponka-spolka-z-ograniczona-odpowiedzialnoscia', '61581750957333', 'AR17884307600808345601');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'ooponka', 'instagram', 'ooponka', 'https://www.instagram.com/ooponka/'),
  ('entity', 'ooponka', 'facebook', '61581750957333', 'https://www.facebook.com/profile.php?id=61581750957333');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('patrycja-wasala-oponowicz', 'ooponka', 'owner', 'właściciel', NULL, NULL);
