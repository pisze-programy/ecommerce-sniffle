-- Ecommerce Pulse - add the royaljewellery entity.
-- The sole trader is Katarzyna Zimniak. The firm is a JDG.
-- The brand is related to royalwatch (same family, two shops).
-- The Meta Ads Library page id comes from the view_all_page_id.

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES ('royaljewellery', 'Royal Jewellery Katarzyna Zimniak', 'soleTrader', NULL, '369869812', '7343259385', NULL, '114264844925188');

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'royaljewellery', 'instagram', 'royaljewellerypl', 'https://www.instagram.com/royaljewellerypl/'),
  ('entity', 'royaljewellery', 'facebook', '100090264923773', 'https://www.facebook.com/p/ROYAL-Jewellery-100090264923773/');

INSERT OR IGNORE INTO entity_relations (from_entity_id, to_entity_id, type, label, from_day, to_day)
VALUES ('royalwatch', 'royaljewellery', 'related', 'marki powiązane', NULL, NULL);
