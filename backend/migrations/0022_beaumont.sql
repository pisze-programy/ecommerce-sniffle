-- Ecommerce Pulse - beaumont entity.
-- Stone Fashion Group, an Amsterdam group without a KRS.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('beaumont', 'Stone Fashion Group', 'company', NULL, NULL, NULL, NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'beaumont', 'facebook', 'BeaumontAmsterdam', 'https://www.facebook.com/BeaumontAmsterdam/'),
  ('entity', 'beaumont', 'instagram', 'beaumont_amsterdam', 'https://www.instagram.com/beaumont_amsterdam/'),
  ('entity', 'beaumont', 'tiktok', 'beaumont_amsterdam', 'https://www.tiktok.com/@beaumont_amsterdam'),
  ('entity', 'beaumont', 'linkedin', 'beaumont-amsterdam', 'https://www.linkedin.com/company/beaumont-amsterdam');
