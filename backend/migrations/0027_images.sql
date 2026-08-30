-- Ecommerce Pulse - images for entities and persons.
-- R2 keys for the shop logo, the shop background and the person avatar.

ALTER TABLE entities ADD COLUMN logo_key TEXT;
ALTER TABLE entities ADD COLUMN bg_key TEXT;
ALTER TABLE persons ADD COLUMN avatar_key TEXT;
