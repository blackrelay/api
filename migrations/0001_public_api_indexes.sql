CREATE TABLE IF NOT EXISTS api_documents (
  path TEXT PRIMARY KEY,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  content_type TEXT NOT NULL DEFAULT 'application/json',
  sha256 TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS api_entities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  cycle INTEGER,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  search_text TEXT NOT NULL,
  sort_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_entities_list
  ON api_entities(environment, entity_type, cycle, sort_key, id);

CREATE INDEX IF NOT EXISTS idx_api_entities_slug
  ON api_entities(slug);

CREATE TABLE IF NOT EXISTS api_sources (
  id TEXT PRIMARY KEY,
  source_kind TEXT,
  environment TEXT,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  sort_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_sources_list
  ON api_sources(environment, source_kind, sort_key, id);

CREATE TABLE IF NOT EXISTS api_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  environment TEXT NOT NULL,
  cycle INTEGER,
  occurred_at TEXT NOT NULL,
  package_id TEXT,
  module TEXT,
  transaction_digest TEXT,
  source_id TEXT,
  body_json TEXT NOT NULL CHECK (json_valid(body_json))
);

CREATE INDEX IF NOT EXISTS idx_api_events_list
  ON api_events(environment, cycle, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_api_events_filters
  ON api_events(kind, module, package_id, transaction_digest);

CREATE TABLE IF NOT EXISTS api_killmails (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  cycle INTEGER,
  occurred_at TEXT NOT NULL,
  system_id TEXT,
  victim_character_id TEXT,
  killer_character_id TEXT,
  killer_type_id TEXT,
  reporter_character_id TEXT,
  npc INTEGER NOT NULL DEFAULT 0,
  body_json TEXT NOT NULL CHECK (json_valid(body_json))
);

CREATE INDEX IF NOT EXISTS idx_api_killmails_list
  ON api_killmails(environment, cycle, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_api_killmails_filters
  ON api_killmails(system_id, victim_character_id, killer_character_id, killer_type_id, reporter_character_id, npc);

CREATE TABLE IF NOT EXISTS api_current (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  environment TEXT NOT NULL,
  cycle INTEGER,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  search_text TEXT NOT NULL,
  sort_key TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS idx_api_current_list
  ON api_current(collection, environment, cycle, sort_key, id);

CREATE TABLE IF NOT EXISTS api_facts (
  entity_id TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  cycle INTEGER,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  sort_key TEXT NOT NULL,
  PRIMARY KEY (entity_id, fact_key, source_id)
);

CREATE INDEX IF NOT EXISTS idx_api_facts_entity
  ON api_facts(entity_id, sort_key);

CREATE TABLE IF NOT EXISTS api_relations (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_entity_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  sort_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_relations_subject
  ON api_relations(subject_entity_id, predicate, object_entity_id);

CREATE INDEX IF NOT EXISTS idx_api_relations_object
  ON api_relations(object_entity_id, predicate, subject_entity_id);

CREATE TABLE IF NOT EXISTS api_entity_sources (
  entity_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  sort_key TEXT NOT NULL,
  PRIMARY KEY (entity_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_api_entity_sources_entity
  ON api_entity_sources(entity_id, sort_key);

CREATE TABLE IF NOT EXISTS api_artefacts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_kind TEXT,
  environment TEXT NOT NULL,
  artefact_kind TEXT,
  sha256 TEXT,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  sort_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_artefacts_source
  ON api_artefacts(source_id, environment, sort_key);

CREATE TABLE IF NOT EXISTS api_source_gaps (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  environment TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  body_json TEXT NOT NULL CHECK (json_valid(body_json))
);

CREATE INDEX IF NOT EXISTS idx_api_source_gaps_list
  ON api_source_gaps(environment, severity, kind);
