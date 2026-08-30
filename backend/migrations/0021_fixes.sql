-- Ecommerce Pulse - link and name corrections.

UPDATE socials
SET handle = 'RubenOnuha', url = 'https://www.youtube.com/@RubenOnuha'
WHERE owner_kind = 'person' AND owner_id = 'ruben-onuha' AND platform = 'youtube';

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'agnieszka-kalita', 'facebook', 'agnieszka.kalita.1', 'https://www.facebook.com/agnieszka.kalita.1/');

UPDATE persons SET name = 'Tomasz Klata' WHERE id = 'tomekklata';
