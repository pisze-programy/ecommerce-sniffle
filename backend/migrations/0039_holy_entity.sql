-- Ecommerce Pulse - add the holy entity.
-- The shop tracks on Instagram and a Facebook group.
-- No firm data and no Meta Ads page id yet.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('holy', 'Holy', 'brand', NULL, NULL, NULL, NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'holy', 'instagram', 'holysquad.pl', 'https://www.instagram.com/holysquad.pl/');
