-- Ecommerce Pulse - foreign firms, mualasklep, friendzstore, and updates.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES
  ('derichgallery', 'Derich Gallery', 'company', NULL, NULL, NULL, NULL, NULL),
  ('monartofficial', 'Mon Art Official', 'company', NULL, NULL, NULL, NULL, NULL),
  ('mualasklep', 'Muala sp. z o.o.', 'company', NULL, NULL, NULL, NULL, NULL),
  ('friendzstore', 'Friendzstore Sp. z o.o.', 'company', '0001185078', NULL, NULL, 'https://www.bizraport.pl/krs/0001185078', NULL),
  ('premieresociety', 'Premiere sp. z o.o.', 'company', '0000160814', NULL, NULL, 'https://www.bizraport.pl/krs/0000160814', NULL);

UPDATE entities
SET krs = '0000820197', name = 'Dives Med Poland Sp. z o.o.', bizraport_url = 'https://www.bizraport.pl/krs/0000820197'
WHERE id = 'dives-med';

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'derichgallery', 'instagram', 'derichgallery', 'https://www.instagram.com/derichgallery/'),
  ('entity', 'derichgallery', 'facebook', '61573287702730', 'https://www.facebook.com/profile.php?id=61573287702730'),
  ('entity', 'derichgallery', 'youtube', 'DerichGallery', 'https://www.youtube.com/@DerichGallery'),
  ('entity', 'monartofficial', 'facebook', 'www.monartofficial', 'https://www.facebook.com/www.monartofficial/'),
  ('entity', 'monartofficial', 'instagram', 'mon.art.official', 'https://www.instagram.com/mon.art.official/'),
  ('entity', 'sanah', 'youtube', 'UCqTRe9EIv0apJgPqkng-Gtw', 'https://www.youtube.com/channel/UCqTRe9EIv0apJgPqkng-Gtw'),
  ('entity', 'sanah', 'tiktok', 'sanah', 'https://www.tiktok.com/@sanah'),
  ('entity', 'wojanshop', 'tiktok', 'wojanteam_pl', 'https://www.tiktok.com/@wojanteam_pl'),
  ('entity', 'wojanshop', 'youtube', 'WojanGames', 'https://www.youtube.com/c/WojanGames'),
  ('entity', 'mualasklep', 'instagram', 'muala_sklep', 'https://www.instagram.com/muala_sklep'),
  ('entity', 'mualasklep', 'tiktok', 'ksiazulo', 'https://www.tiktok.com/@ksiazulo'),
  ('entity', 'mualasklep', 'youtube', 'ksiazulo', 'https://www.youtube.com/@ksiazulo'),
  ('entity', 'islandrecords', 'instagram', 'modelkiontop', 'https://www.instagram.com/modelkiontop'),
  ('entity', 'islandrecords', 'facebook', 'modelkiontop', 'https://www.facebook.com/modelkiontop/'),
  ('entity', 'premieresociety', 'instagram', 'premieresociety', 'https://www.instagram.com/premieresociety/'),
  ('entity', 'premieresociety', 'facebook', 'premieresociety', 'https://www.facebook.com/premieresociety/');

UPDATE socials
SET handle = 'wojanteam_pl', url = 'https://www.instagram.com/wojanteam_pl/'
WHERE owner_kind = 'entity' AND owner_id = 'wojanshop' AND platform = 'instagram';
