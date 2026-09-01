-- Ecommerce Pulse - add the dresscodecrew entity.
-- The firm is Phantom Label sp. z o.o.
-- Mikolaj Baginski is the owner.
-- The Meta Ads Library page id comes from the view_all_page_id.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('dresscodecrew', 'Phantom Label sp. z o.o.', 'company', '0000968463', '521840047', '5213965801', 'https://www.bizraport.pl/krs/0000968463/phantom-label-spolka-z-ograniczona-odpowiedzialnoscia', '110159488399890');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'dresscodecrew', 'instagram', 'dresscode.crew', 'https://www.instagram.com/dresscode.crew/'),
  ('entity', 'dresscodecrew', 'tiktok', 'dresscode.crew', 'https://www.tiktok.com/@dresscode.crew'),
  ('entity', 'dresscodecrew', 'facebook', 'DRESSCODE.PARTY1', 'https://www.facebook.com/DRESSCODE.PARTY1/');

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('mikolaj-baginski', 'Mikołaj Bagiński', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'mikolaj-baginski', 'instagram', 'bginsky', 'https://www.instagram.com/bginsky/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('mikolaj-baginski', 'dresscodecrew', 'owner', 'właściciel', NULL, NULL);
