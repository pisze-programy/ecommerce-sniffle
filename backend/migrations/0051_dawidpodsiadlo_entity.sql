-- Ecommerce Pulse - add the dawidpodsiadlo entity.
-- The shop is the artist Dawid Podsiadlo, a 1:1 artist brand.
-- The operator is Merchbox Maciej Rabeko Piotr Zawadzki Sp. jawna,
-- ul. Krakowiakow 53 bud. 7, 02-255 Warszawa, NIP 5223252333.
-- It has no KRS and no bizraport report.
-- The Meta Ads Library page id comes from view_all_page_id.
-- The shop runs no Google Ads.
-- Socials come from the shop footer.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('dawidpodsiadlo', 'Dawid Podsiadło', 'brand', NULL, NULL, '5223252333', NULL, '555550131146307');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'dawidpodsiadlo', 'instagram', 'dylanwishop', 'https://www.instagram.com/dylanwishop/'),
  ('entity', 'dawidpodsiadlo', 'facebook', 'podsiadlo.dawid', 'https://www.facebook.com/podsiadlo.dawid/'),
  ('entity', 'dawidpodsiadlo', 'youtube', 'official_dawid_podsiadlo', 'https://www.youtube.com/@official_dawid_podsiadlo');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('dawid-podsiadlo', 'Dawid Podsiadło', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('person', 'dawid-podsiadlo', 'instagram', 'dylanwishop', 'https://www.instagram.com/dylanwishop/'),
  ('person', 'dawid-podsiadlo', 'facebook', 'podsiadlo.dawid', 'https://www.facebook.com/podsiadlo.dawid/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('dawid-podsiadlo', 'dawidpodsiadlo', 'owner', 'artysta 1:1', NULL, NULL);
