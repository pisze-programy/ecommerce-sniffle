-- Ecommerce Pulse - the Facebook social module.
-- The profile day gains the talking-about count of a Facebook page.
-- The report shows the value in the score slot for a facebook row.
-- See docs/FACEBOOK.md.

ALTER TABLE social_profile_days ADD COLUMN talking_about INTEGER;
