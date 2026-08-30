-- Ecommerce Pulse - fix the risky Meta Ads page id.
-- The old id 197155313699047 was wrong. The correct id is 116090821593717.
-- The old data belongs to the wrong page. Remove it.

DELETE FROM meta_ads WHERE page_id = '197155313699047';
DELETE FROM meta_ad_days WHERE page_id = '197155313699047';
UPDATE entities SET meta_page_id = '116090821593717' WHERE id = 'risky';
