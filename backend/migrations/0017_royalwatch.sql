-- Ecommerce Pulse - royalwatch entity and laboratoriumpanidomu profiles.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('royalwatch', 'Royal Watch sp. z o.o.', 'company', '0001225829', NULL, NULL, 'https://www.bizraport.pl/krs/0001225829', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'royalwatch', 'facebook', 'royalwatch.luksusowezegarki', 'https://www.facebook.com/royalwatch.luksusowezegarki/'),
  ('entity', 'royalwatch', 'instagram', 'royalwatch.pl', 'https://www.instagram.com/royalwatch.pl/'),
  ('entity', 'laboratoriumpanidomu', 'facebook', 'LaboratoriumPaniDomu', 'https://www.facebook.com/LaboratoriumPaniDomu/'),
  ('entity', 'laboratoriumpanidomu', 'instagram', 'laboratorium.pani.domu', 'https://www.instagram.com/laboratorium.pani.domu/'),
  ('entity', 'laboratoriumpanidomu', 'youtube', 'laboratoriumpanidomu', 'https://www.youtube.com/@laboratoriumpanidomu');
