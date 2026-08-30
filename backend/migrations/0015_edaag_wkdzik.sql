-- Ecommerce Pulse - e-daag, wkdzik entities and emereedivine facebook.
-- e-daag: Ledrin Sp. z o.o. (brand DAAG).
-- wkdzik: WK Sp. z o.o. with facebook, instagram, youtube, tiktok.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES
  ('e-daag', 'Ledrin Sp. z o.o.', 'company', '0000085721', NULL, NULL, 'https://www.bizraport.pl/krs/0000085721', NULL),
  ('wkdzik', 'WK Sp. z o.o.', 'company', '0000646549', NULL, NULL, 'https://www.bizraport.pl/krs/0000646549', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'emereedivine', 'facebook', 'emereedivine', 'https://www.facebook.com/emereedivine/'),
  ('entity', 'wkdzik', 'facebook', 'wkdzikpl', 'https://www.facebook.com/wkdzikpl'),
  ('entity', 'wkdzik', 'instagram', 'wkdzik', 'https://www.instagram.com/wkdzik/'),
  ('entity', 'wkdzik', 'youtube', 'wkdzikpl', 'https://www.youtube.com/@wkdzikpl'),
  ('entity', 'wkdzik', 'tiktok', 'wkdzik.pl', 'https://www.tiktok.com/@wkdzik.pl');
