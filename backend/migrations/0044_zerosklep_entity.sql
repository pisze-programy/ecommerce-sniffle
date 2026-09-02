-- Ecommerce Pulse - add the zerosklep entity.
-- The firm is Kanal Zero S.A.
-- Krzysztof Stanowski is the owner.
-- The Meta Ads Library page id comes from the view_all_page_id.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('zerosklep', 'Kanał Zero S.A.', 'company', '0001080111', '527441101', '7011183752', 'https://www.bizraport.pl/krs/0001080111/kanal-zero-spolka-akcyjna', '121906524350211');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'zerosklep', 'instagram', 'oficjalnezero', 'https://www.instagram.com/oficjalnezero/'),
  ('entity', 'zerosklep', 'facebook', 'oficjalnezeroo', 'https://www.facebook.com/oficjalnezeroo/'),
  ('entity', 'zerosklep', 'youtube', 'KanalZeroPL', 'https://www.youtube.com/@KanalZeroPL');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('krzysztof-stanowski', 'Krzysztof Stanowski', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'krzysztof-stanowski', 'instagram', 'krzysztof.stanowski', 'https://www.instagram.com/krzysztof.stanowski/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('krzysztof-stanowski', 'zerosklep', 'owner', 'właściciel', NULL, NULL);
