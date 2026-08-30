-- Ecommerce Pulse - Meta Ads page ids filled by hand.
-- The user verified these pages manually.
-- Shops that we do not track ads for lose their page id.

UPDATE entities SET meta_page_id = '1519901994992512' WHERE id = 'beaumont';
UPDATE entities SET meta_page_id = '109748315469254' WHERE id = 'dobrerzeczy';
UPDATE entities SET meta_page_id = '116086326898893' WHERE id = 'monartofficial';
UPDATE entities SET meta_page_id = '615115091694097' WHERE id = 'mualasklep';
UPDATE entities SET meta_page_id = '1597769753863797' WHERE id = 'nago';
UPDATE entities SET meta_page_id = '923578254349971' WHERE id = 'rever';
UPDATE entities SET meta_page_id = '197155313699047' WHERE id = 'risky';
UPDATE entities SET meta_page_id = '613781125410769' WHERE id = 'sanah';
UPDATE entities SET meta_page_id = '869005663179143' WHERE id = 'wojanshop';

-- We do not track ads for these shops.
-- This is a decision, not a gap.
-- We exclude them on purpose. Do not re-add them without asking.
UPDATE entities SET meta_page_id = NULL WHERE id = 'infini';
UPDATE entities SET meta_page_id = NULL WHERE id = 'mushi';
UPDATE entities SET meta_page_id = NULL WHERE id = 'fagata';
UPDATE entities SET meta_page_id = NULL WHERE id = 'marionis';
