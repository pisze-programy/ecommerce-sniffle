-- Ecommerce Pulse - resolved firm names and remaining shop entities.

UPDATE entities SET name = 'Papito Vibe Jarząbkowski' WHERE id = 'papitoenergy';
UPDATE entities SET name = 'Risky sp. z o.o.' WHERE id = 'risky';

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES
  ('sklepskolim', 'Skolim sp. z o.o.', 'company', '0000701824', NULL, NULL, 'https://www.bizraport.pl/krs/0000701824', NULL),
  ('brokies', 'Brookes sp. z o.o.', 'company', '0000624657', NULL, NULL, 'https://www.bizraport.pl/krs/0000624657', NULL),
  ('berecords', 'Baila Ella Records sp. z o.o.', 'company', '0001003456', NULL, NULL, 'https://www.bizraport.pl/krs/0001003456', NULL),
  ('fagata', 'Agata Fąk', 'soleTrader', NULL, NULL, '5252864292', NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'sklepskolim', 'instagram', 'sklepskolim.pl', 'https://www.instagram.com/sklepskolim.pl/'),
  ('entity', 'brokies', 'instagram', 'brokies.wrld', 'https://www.instagram.com/brokies.wrld/'),
  ('entity', 'brokies', 'youtube', 'brokies2727', 'https://www.youtube.com/@brokies2727'),
  ('entity', 'fagata', 'facebook', '100081290535607', 'https://www.facebook.com/p/Agata-F%C4%85k-100081290535607/'),
  ('entity', 'fagata', 'instagram', 'fagataaa', 'https://www.instagram.com/fagataaa/');
