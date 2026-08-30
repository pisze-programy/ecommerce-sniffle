-- Ecommerce Pulse - fix the forcer Meta Ads page id.
-- The old id 1391555270923932 was the event agency fource.pl.
-- It runs concert ads (Jimmy Carr, Take That), not the shop.
-- The correct id is the ForcerOfficial page with the shop ads.

UPDATE entities SET meta_page_id = '528691826989201' WHERE id = 'forcer';
