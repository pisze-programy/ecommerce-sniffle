-- Ecommerce Pulse - normalize person relations to the fixed role set.
-- Roles: owner (Właściciel), ambassador (Ambasador), firm (Firma).
-- The label column is kept for the DB but never read by the UI.

UPDATE person_relations SET role = 'firm', label = 'Firma'
WHERE label IN ('JDG', 'artystka 1:1');

UPDATE person_relations SET role = 'ambassador', label = 'Ambasador'
WHERE label IN ('influ', 'ambasador') OR role IN ('influencer', 'ambassador');

UPDATE person_relations SET role = 'owner', label = 'Właściciel'
WHERE role IN ('owner', 'founder')
   OR label IN ('właściciel', 'prezes', 'wspólnik', 'wspólnik 25%', 'współzałożycielka', 'współtwórca', 'założyciel');
