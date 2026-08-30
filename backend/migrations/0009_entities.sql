-- Ecommerce Pulse - entity graph
-- Companies, persons, social links and relations.
-- The data is hand-edited in D1. The report layer reads it.

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  krs TEXT,
  regon TEXT,
  nip TEXT,
  bizraport_url TEXT,
  meta_page_id TEXT,
  cpm_min REAL,
  cpm_max REAL
);

CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  linkedin_url TEXT
);

CREATE TABLE IF NOT EXISTS socials (
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (owner_kind, owner_id, platform, handle)
);

CREATE TABLE IF NOT EXISTS person_relations (
  person_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  from_day TEXT,
  to_day TEXT,
  PRIMARY KEY (person_id, entity_id, role, from_day)
);

CREATE TABLE IF NOT EXISTS entity_relations (
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  from_day TEXT,
  to_day TEXT,
  PRIMARY KEY (from_entity_id, to_entity_id, type, from_day)
);

-- Pilot seed. See docs/ENTITIES.md.

INSERT INTO entities (id, name, kind, krs, bizraport_url, meta_page_id)
VALUES
  ('hdrey-group', 'Hdrey Group Sp. z o.o.', 'company', '0000683399', 'https://www.bizraport.pl/krs/0000683399/hdrey-group-spolka-z-ograniczona-odpowiedzialnoscia', '129962510193438'),
  ('dives-med', 'Dives Sp. z o.o.', 'company', '0000875646', 'https://www.bizraport.pl/krs/0000875646/dives-spolka-z-ograniczona-odpowiedzialnoscia', NULL),
  ('forcer', 'Forcer Sp. z o.o.', 'company', '0001134950', 'https://www.bizraport.pl/krs/0001134950/forcer-spolka-z-ograniczona-odpowiedzialnoscia', '528691826989201'),
  ('infini', 'INFINI Premium Filler', 'brand', NULL, NULL, NULL);

INSERT INTO persons (id, name, linkedin_url)
VALUES
  ('rafal-afanasjef', 'Rafał Afanasjef', 'https://www.linkedin.com/in/rafal-afanasjef-13078a210/'),
  ('karolina-pisarek', 'Karolina Pisarek', NULL);

INSERT INTO socials (owner_kind, owner_id, platform, handle, url)
VALUES
  ('entity', 'hdrey-group', 'instagram', 'hdrey_pl', 'https://www.instagram.com/hdrey_pl'),
  ('entity', 'hdrey-group', 'facebook', 'hdreypl', 'https://www.facebook.com/hdreypl'),
  ('entity', 'dives-med', 'instagram', 'divesmed_pl', 'https://www.instagram.com/divesmed_pl'),
  ('entity', 'dives-med', 'facebook', 'divesmedpolska', 'https://www.facebook.com/divesmedpolska'),
  ('entity', 'forcer', 'facebook', '61569223094545', 'https://www.facebook.com/61569223094545'),
  ('entity', 'forcer', 'instagram', 'forcerofficial', 'https://www.instagram.com/forcerofficial'),
  ('person', 'karolina-pisarek', 'instagram', 'karolina_pisarek', 'https://www.instagram.com/karolina_pisarek/'),
  ('person', 'karolina-pisarek', 'facebook', '100044181591844', 'https://www.facebook.com/p/Karolina-Pisarek-100044181591844/');

INSERT INTO person_relations (person_id, entity_id, role, label, from_day, to_day)
VALUES
  ('rafal-afanasjef', 'hdrey-group', 'owner', 'właściciel', NULL, NULL),
  ('rafal-afanasjef', 'dives-med', 'owner', 'właściciel', NULL, NULL),
  ('rafal-afanasjef', 'infini', 'founder', 'założyciel', NULL, NULL),
  ('karolina-pisarek', 'hdrey-group', 'influencer', 'influ', NULL, NULL),
  ('karolina-pisarek', 'hdrey-group', 'ambassador', 'ambasador', NULL, NULL),
  ('karolina-pisarek', 'forcer', 'owner', 'właściciel', NULL, NULL);
