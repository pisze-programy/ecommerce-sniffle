-- Ecommerce Pulse - add the Instagram handle for e-daag and friendzstore.
-- These two shops had no Instagram link. The other shops have one.
-- The handle is the value the social scraper reads.
-- daag__torebki belongs to Ledrin Sp. z o.o. (brand DAAG).
-- friendz1515 belongs to Friendzstore Sp. z o.o.

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'e-daag', 'instagram', 'daag__torebki', 'https://www.instagram.com/daag__torebki/'),
  ('entity', 'friendzstore', 'instagram', 'friendz1515', 'https://www.instagram.com/friendz1515/');
