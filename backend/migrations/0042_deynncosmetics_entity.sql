-- Ecommerce Pulse - add the deynncosmetics entity.
-- The firm is DEYNN COSMETICS P.S.A.
-- Marita Surma Majewska is the owner.
-- The Meta Ads Library page id comes from the view_all_page_id.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('deynncosmetics', 'DEYNN COSMETICS P.S.A.', 'company', '0001035392', '524943500', '7543359772', 'https://www.bizraport.pl/krs/0001035392', '108186435635330');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'deynncosmetics', 'instagram', 'deynn.cosmetics', 'https://www.instagram.com/deynn.cosmetics/'),
  ('entity', 'deynncosmetics', 'facebook', '100093690332518', 'https://www.facebook.com/p/DEYNN-NAILS-100093690332518/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('marita-surma-majewska', 'Marita Surma Majewska', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'marita-surma-majewska', 'instagram', 'deynn', 'https://www.instagram.com/deynn/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('marita-surma-majewska', 'deynncosmetics', 'owner', 'właściciel', NULL, NULL);
