-- Ecommerce Pulse - add the marionis entity with its Meta Ads page id.
-- The shop has no firm data yet. The collector needs the entity row.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('marionis', 'Marionis', 'brand', NULL, NULL, NULL, NULL, '830663120135439');
