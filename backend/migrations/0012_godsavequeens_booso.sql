-- Ecommerce Pulse - godsavequeens and booso entities
-- godsavequeens: GSQ Sp. z o.o.
-- booso: sole trader DwaKa Agnieszka Kalita (no KRS).

INSERT OR IGNORE INTO entities (id, name, kind, krs, regon, nip, bizraport_url, meta_page_id)
VALUES
  ('godsavequeens', 'GSQ Sp. z o.o.', 'company', '0000658570', NULL, NULL, 'https://www.bizraport.pl/krs/0000658570', NULL),
  ('booso', 'DwaKa Agnieszka Kalita', 'soleTrader', NULL, '146867817', '9482470759', NULL, NULL);

INSERT OR IGNORE INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'godsavequeens', 'instagram', 'godsavequeens_official', 'https://www.instagram.com/godsavequeens_official/'),
  ('entity', 'godsavequeens', 'facebook', 'GodSaveQueensCom', 'https://www.facebook.com/GodSaveQueensCom/'),
  ('entity', 'booso', 'facebook', 'boosobooso', 'https://www.facebook.com/boosobooso/'),
  ('entity', 'booso', 'instagram', 'booso.pl', 'https://www.instagram.com/booso.pl/');
