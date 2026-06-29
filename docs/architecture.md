# Architecture

Black Relay API is an edge read layer.
```text
Registry VPS
  PostgreSQL canonical store
  Sui / World API / static-client importers
  export writer

Cloudflare
  R2 canonical public export artefacts
  D1 public query indexes
  Worker public API
```

The API Worker treats D1 rows as a disposable query index. R2 keeps the export artefacts that explain which Registry snapshot produced the public data.

The Worker applies Cloudflare Rate Limit bindings to uncached public reads. These limits protect Worker, D1 and R2 budgets; they do not define data ownership and they do not make the API private.

## Data Ownership

The Registry owns canonical data and provenance. The API repo owns:
- Worker routing
- D1 read indexes
- R2 export delivery
- public cache headers
- public request limits
- deployment configuration

It does not own source normalisation, Sui indexing, World API fetching, static-client decoding or manual review.

## Provenance Routes

Registry exports include JSONL files for facts, relations, entity-source links, source artefacts and current-state records. The D1 import script indexes those files into route-specific tables:
- `api_facts` for `/v1/entities/{idOrSlug}/facts`
- `api_relations` for `/v1/entities/{idOrSlug}/relations`
- `api_entity_sources` for `/v1/entities/{idOrSlug}/sources`
- `api_artefacts` for `/v1/artefacts/{id}`
- `api_current` for `/v1/current/{collection}`

History responses are assembled from the entity row plus its indexed facts, relations and sources. The Worker does not generate new provenance.

## Operations Documents

Registry exports flat operations documents so the export verifier can keep rejecting nested paths:
- `ops_freshness.json`
- `ops_cursors.json`
- `ops_sui_coverage.json`
- `ops_source_gaps.json`

The import script stores those as D1 documents under their public route paths, such as `ops/sui-coverage.json`.

## Failure Model

`/v1/health` only proves the Worker is executing.

`/v1/ready` checks D1 and the latest R2 manifest pointer. It reports degraded when the Worker can reach D1 but no latest R2 manifest exists.

Source completeness is reported by Registry-generated documents and source-gap endpoints. The Worker does not claim stronger completeness than the artefacts provide.
