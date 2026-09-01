-- Ecommerce Pulse - add the patandrub entity.
-- The firm is ECOIDEA sp. z o.o. sp.k.
-- Kinga Rusin is the owner.
-- The Meta Ads Library page id comes from the view_all_page_id.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('patandrub', 'ECOIDEA sp. z o.o. sp.k.', 'company', '0000896840', '388848376', '7011031663', 'https://www.bizraport.pl/krs/0000896840/ecoidea-spolka-z-ograniczona-odpowiedzialnoscia-spolka-jawna', '314299585704');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'patandrub', 'instagram', 'patandrub', 'https://www.instagram.com/patandrub/'),
  ('entity', 'patandrub', 'facebook', 'patandrub', 'https://www.facebook.com/patandrub/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('kinga-rusin', 'Kinga Rusin', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'kinga-rusin', 'instagram', 'kingarusin', 'https://www.instagram.com/kingarusin/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('kinga-rusin', 'patandrub', 'owner', 'właściciel', NULL, NULL);
