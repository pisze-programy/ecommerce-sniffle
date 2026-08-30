-- Ecommerce Pulse - shop entities (harvested data)
-- Firms with KRS and social profiles. No persons yet.
-- The harvested state is tracked in docs/ENTITY-DATA.md.

INSERT OR IGNORE INTO entities (id, name, kind, krs, bizraport_url, meta_page_id)
VALUES
  ('nago', 'CLTHS S.A.', 'company', '0000735885', 'https://www.bizraport.pl/krs/0000735885', NULL),
  ('mushi', 'Mushi Sp. z o.o.', 'company', '0001123342', 'https://www.bizraport.pl/krs/0001123342', NULL),
  ('gymglamour', 'Gym Glamour Sp. z o.o.', 'company', '0001049978', 'https://www.bizraport.pl/krs/0001049978', NULL),
  ('wakenbake', 'Wakenbake Sp. z o.o.', 'company', '0000962607', 'https://www.bizraport.pl/krs/0000962607', NULL),
  ('wojanshop', 'Wojan Group sp. z o.o.', 'company', '0000933831', 'https://www.bizraport.pl/krs/0000933831', NULL),
  ('theodderside', 'The Odder Side sp. z o.o.', 'company', '0000983656', 'https://www.bizraport.pl/krs/0000983656', NULL),
  ('islandrecords', 'DDD sp. z o.o.', 'company', '0000074457', 'https://www.bizraport.pl/krs/0000074457', NULL),
  ('icedstuff', 'ICED STUFF Sp. z o.o.', 'company', '0001131880', 'https://www.bizraport.pl/krs/0001131880', NULL),
  ('emereedivine', 'Emeree Divine Sp. z o.o.', 'company', '0001198145', 'https://www.bizraport.pl/krs/0001198145', NULL),
  ('laboratoriumpanidomu', 'Laboratorium Pani Domu Sp. z o.o.', 'company', '0000645460', 'https://www.bizraport.pl/krs/0000645460', NULL),
  ('33mata', '33mata', 'company', '0001042259', 'https://www.bizraport.pl/krs/0001042259', NULL),
  ('papitoenergy', 'Papito Energy', 'company', '0001173436', 'https://www.bizraport.pl/krs/0001173436', NULL),
  ('risky', 'Risky', 'company', '0001111425', 'https://www.bizraport.pl/krs/0001111425', NULL),
  ('sanah', 'Sanah', 'company', '0000067517', 'https://www.bizraport.pl/krs/0000067517', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'nago', 'facebook', 'nago.clth', 'https://www.facebook.com/nago.clth'),
  ('entity', 'nago', 'instagram', 'nago_com', 'https://www.instagram.com/nago_com/'),
  ('entity', 'mushi', 'facebook', 'mushipl', 'https://www.facebook.com/mushipl'),
  ('entity', 'mushi', 'instagram', 'mushi_pl', 'https://www.instagram.com/mushi_pl/'),
  ('entity', 'gymglamour', 'facebook', 'gymglamour', 'https://www.facebook.com/gymglamour'),
  ('entity', 'gymglamour', 'instagram', 'gym_glamour', 'https://www.instagram.com/gym_glamour/'),
  ('entity', 'wakenbake', 'facebook', 'wakenbakepl', 'https://www.facebook.com/wakenbakepl'),
  ('entity', 'wakenbake', 'instagram', 'wakenbake_pl', 'https://www.instagram.com/wakenbake_pl/'),
  ('entity', 'wojanshop', 'instagram', 'wojanteam_pl', 'https://www.instagram.com/wojanteam_pl/'),
  ('entity', 'theodderside', 'facebook', 'odderside', 'https://www.facebook.com/odderside'),
  ('entity', 'theodderside', 'instagram', 'the_odderside', 'https://www.instagram.com/the_odderside/'),
  ('entity', 'islandrecords', 'facebook', 'islandrecordspolska', 'https://www.facebook.com/islandrecordspolska'),
  ('entity', 'islandrecords', 'instagram', 'islandrecordspolska', 'https://www.instagram.com/islandrecordspolska/'),
  ('entity', 'icedstuff', 'facebook', 'icedstuffofficial', 'https://www.facebook.com/icedstuffofficial'),
  ('entity', 'icedstuff', 'instagram', 'icedstuff', 'https://www.instagram.com/icedstuff/'),
  ('entity', 'emereedivine', 'instagram', 'emereedivine', 'https://www.instagram.com/emereedivine/'),
  ('entity', '33mata', 'facebook', '33pomiot.liryczny', 'https://www.facebook.com/33pomiot.liryczny'),
  ('entity', '33mata', 'instagram', '33mata', 'https://www.instagram.com/33mata/'),
  ('entity', 'papitoenergy', 'facebook', 'papito.energy', 'https://www.facebook.com/papito.energy'),
  ('entity', 'papitoenergy', 'instagram', 'papito.energy', 'https://www.instagram.com/papito.energy/'),
  ('entity', 'risky', 'facebook', 'pompateamofficial', 'https://www.facebook.com/pompateamofficial/'),
  ('entity', 'risky', 'instagram', 'risky_store_overthelimit', 'https://www.instagram.com/risky_store_overthelimit/'),
  ('entity', 'sanah', 'facebook', 'sanahmusic', 'https://www.facebook.com/sanahmusic'),
  ('entity', 'sanah', 'instagram', 'sanahmusic', 'https://www.instagram.com/sanahmusic/');
