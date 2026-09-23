-- Ecommerce Pulse - Karol Słuszniak, the ICED STUFF owner.
-- The person holds the prezes zarządu role.
-- The instagram handle is swooshniak.
-- The data is hand-edited. See docs/ENTITY-DATA.md.

INSERT OR IGNORE INTO persons (id, name, linkedin_url)
VALUES ('karol-sluszniak', 'Karol Słuszniak', NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('person', 'karol-sluszniak', 'instagram', 'swooshniak', 'https://www.instagram.com/swooshniak/');

INSERT OR IGNORE INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES ('karol-sluszniak', 'icedstuff', 'owner', 'prezes zarządu', NULL, NULL);
