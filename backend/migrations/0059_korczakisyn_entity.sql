-- Ecommerce Pulse - add the korczakisyn entity.
-- "Korczak i Syn" is a sole trader (JDG). No KRS, no bizraport.
-- The shop sells fur clothes. It runs since 1983.
-- The address is ul. Targowa 45, 34-400 Nowy Targ.
-- The Meta Ads Library page id comes from the view_all_page_id.
-- The Google advertiser id comes from ad transparency.
-- The owner is Agnieszka Korczak (the JDG name). No other persons.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id, google_advertiser_id)
VALUES ('korczakisyn', 'Korczak i Syn', 'soleTrader', NULL, NULL, '7351164067', NULL, '102753834451504', 'AR12761931717275549697');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'korczakisyn', 'instagram', 'korczakisyn.furs', 'https://www.instagram.com/korczakisyn.furs/'),
  ('entity', 'korczakisyn', 'facebook', 'korczakisyn', 'https://www.facebook.com/korczakisyn/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('agnieszka-korczak', 'Agnieszka Korczak', NULL);

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('agnieszka-korczak', 'korczakisyn', 'owner', 'właściciel', NULL, NULL);
