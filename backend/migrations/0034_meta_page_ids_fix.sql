-- Ecommerce Pulse - Meta Ads page ids corrected by hand.
-- The user verified these page ids manually.

UPDATE entities SET meta_page_id = '570949689437938' WHERE id = 'derichgallery';
UPDATE entities SET meta_page_id = '1391555270923932' WHERE id = 'forcer';
UPDATE entities SET meta_page_id = '874522592419062' WHERE id = 'icon-amsterdam';
UPDATE entities SET meta_page_id = '106464751419083' WHERE id = 'royalwatch';
-- SKOLIMoficjalnie: we do not track its ads.
-- This is a decision, not a gap. Do not re-add without asking.
UPDATE entities SET meta_page_id = NULL WHERE id = 'sklepskolim';
