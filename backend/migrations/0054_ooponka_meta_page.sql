-- Ecommerce Pulse - fix the ooponka Meta Ads Library page id.
-- The first value came from a facebook.com/profile.php?id= URL. It is a
-- profile, not a page. The Ads Library API answered HTTP 400
-- "Invalid Page ID" for the whole batch of ten page ids.
-- 790350214172751 is the view_all_page_id from the Ads Library.

UPDATE entities SET meta_page_id = '790350214172751' WHERE id = 'ooponka';
