-- Ecommerce Pulse - add the acewarsaw entity.
-- The shop tracks on Instagram and Facebook.
-- The Meta Ads Library page id comes from the Instagram page.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('acewarsaw', 'ACE Warsaw', 'brand', NULL, NULL, NULL, NULL, '847684541765646');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'acewarsaw', 'instagram', 'acewarsaw', 'https://www.instagram.com/acewarsaw/'),
  ('entity', 'acewarsaw', 'facebook', '61583978096440', 'https://www.facebook.com/profile.php?id=61583978096440');
