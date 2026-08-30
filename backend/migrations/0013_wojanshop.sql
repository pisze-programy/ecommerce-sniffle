-- Ecommerce Pulse - wojanshop social corrections.
-- Correct IG handle and add the Facebook page.

UPDATE socials
SET handle = 'wojanteam_p', url = 'https://www.instagram.com/wojanteam_p/'
WHERE owner_kind = 'entity' AND owner_id = 'wojanshop' AND platform = 'instagram';

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES ('entity', 'wojanshop', 'facebook', 'wojanyt', 'https://www.facebook.com/wojanyt/');
