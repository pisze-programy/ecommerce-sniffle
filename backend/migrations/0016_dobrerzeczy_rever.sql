-- Ecommerce Pulse - dobrerzeczy (foundation), rever (sole trader),
-- and risky facebook correction (pompateam is an owner, not the brand).

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES
  ('dobrerzeczy', 'Fundacja dobrerzeczy', 'foundation', '0000535327', NULL, NULL, 'https://www.bizraport.pl/krs/0000535327', NULL),
  ('rever', 'Anytry', 'soleTrader', NULL, '363561958', '8691956359', NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'dobrerzeczy', 'instagram', 'dobrerzeczy', 'https://www.instagram.com/dobrerzeczy/'),
  ('entity', 'dobrerzeczy', 'facebook', 'dobrerzeczytm', 'https://www.facebook.com/dobrerzeczytm/'),
  ('entity', 'rever', 'facebook', 'rever.kids.woman', 'https://www.facebook.com/rever.kids.woman'),
  ('entity', 'rever', 'instagram', 'rever.com.pl', 'https://www.instagram.com/rever.com.pl'),
  ('entity', 'rever', 'tiktok', 'rever.com.pl', 'https://www.tiktok.com/@rever.com.pl'),
  ('entity', 'rever', 'youtube', 'revercompl', 'https://www.youtube.com/@revercompl');

DELETE FROM socials
WHERE owner_kind = 'entity' AND owner_id = 'risky' AND platform = 'facebook' AND handle = 'pompateamofficial';
