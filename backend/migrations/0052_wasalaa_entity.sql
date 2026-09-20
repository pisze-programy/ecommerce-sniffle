-- Ecommerce Pulse - add the wasalaa entity.
-- The shop is the brand Wasalaa. The operator is a Polish JDG:
-- Patrycja Wasala-Oponowicz, NIP 8661719790, REGON 385966879.
-- It has no KRS and no bizraport report.
-- The Meta Ads Library page id comes from view_all_page_id.
-- The Google advertiser id comes from ad transparency.
-- The shop runs two brand IG accounts and one owner IG account.
-- Socials come from the shop footer and the profiles.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES ('wasalaa', 'Wasala Patrycja Wąsala-Oponowicz', 'soleTrader', NULL, '385966879', '8661719790', NULL, '109794583925124', 'AR06925566766877769729');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'wasalaa', 'instagram', 'wasalaa', 'https://www.instagram.com/wasalaa/'),
  ('entity', 'wasalaa', 'instagram', 'wasalaa_andline', 'https://www.instagram.com/wasalaa_andline/'),
  ('entity', 'wasalaa', 'facebook', '100051046609286', 'https://www.facebook.com/profile.php?id=100051046609286'),
  ('entity', 'wasalaa', 'youtube', 'WASALAA', 'https://www.youtube.com/@WASALAA'),
  ('entity', 'wasalaa', 'tiktok', 'wasalaa', 'https://www.tiktok.com/@wasalaa');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('patrycja-wasala-oponowicz', 'Patrycja Wąsala-Oponowicz', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'patrycja-wasala-oponowicz', 'instagram', 'oponka_z_wasem', 'https://www.instagram.com/oponka_z_wasem/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('patrycja-wasala-oponowicz', 'wasalaa', 'owner', 'właściciel', NULL, NULL);
