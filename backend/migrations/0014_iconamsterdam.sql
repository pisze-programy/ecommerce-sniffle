-- Ecommerce Pulse - icon-amsterdam entity.
-- IWON GLOBAL LLC, a foreign firm without a KRS.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('icon-amsterdam', 'IWON GLOBAL LLC', 'company', NULL, NULL, NULL, NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'icon-amsterdam', 'instagram', 'icon', 'https://www.instagram.com/icon/'),
  ('entity', 'icon-amsterdam', 'facebook', 'iconamsterdam.official', 'https://www.facebook.com/iconamsterdam.official/');
