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
