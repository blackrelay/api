# Black Relay API

Black Relay API is the public Cloudflare Worker for `api.blackrelay.network`.

The Registry on the VPS remains the source of truth. This Worker serves public read traffic from:
- D1 query indexes generated from Registry export bundles
- R2 export artefacts published by Registry

The Worker does not index Sui, call the World API or create canonical records.

## Development

Once you have configured Cloudflare and setup your D1 database you **MUST** change `database_id` in wrangler.jsonc

Install dependencies:
```sh
pnpm install
```

Windows:
```powershell
pnpm install
```

Generate Worker binding types after editing `wrangler.jsonc`:
```sh
pnpm cf:types
```

Windows:
```powershell
pnpm cf:types
```

Run checks:
```sh
pnpm typecheck
pnpm test
pnpm build
```

Windows:
```powershell
pnpm typecheck
pnpm test
pnpm build
```

## D1 Import Flow

Generate an export from `repo/registry` then convert it into D1 SQL:
```sh
pnpm export:sql -- --export-dir ../registry/exports/cycle6-latest --out ./tmp/seed.sql
pnpm exec wrangler d1 execute blackrelay_api --local --file ./tmp/seed.sql
```

Windows:
```powershell
pnpm export:sql -- --export-dir ..\registry\exports\cycle6-latest --out .\tmp\seed.sql
pnpm exec wrangler d1 execute blackrelay_api --local --file .\tmp\seed.sql
```

Apply migrations:
```sh
pnpm exec wrangler d1 migrations apply blackrelay_api --local
```

Windows:
```powershell
pnpm exec wrangler d1 migrations apply blackrelay_api --local
```

For remote D1 imports, generate chunked SQL and disable explicit transactions:
```sh
pnpm export:sql -- --export-dir ./tmp/api-export-current --chunk-dir ./tmp/api-seed-chunks --chunk-max-bytes 16000000 --no-transactions
```

Windows:
```powershell
pnpm export:sql -- --export-dir .\tmp\api-export-current --chunk-dir .\tmp\api-seed-chunks --chunk-max-bytes 16000000 --no-transactions
```

The importer compacts oversized current-state rows for D1. Full source evidence remains in R2 exports.

## R2 Layout

The Worker reads export objects from:
```text
registry/latest/manifest.json
registry/latest/catalog.json
registry/latest/entities.jsonl
registry/latest/entities.jsonl.gz
registry/latest/killmails.jsonl
registry/latest/sources.jsonl
registry/latest/events.jsonl
registry/latest/events.jsonl.gz
registry/latest/sui_objects.jsonl
registry/latest/sui_objects.jsonl.gz
registry/latest/facts.jsonl
registry/latest/facts.jsonl.gz
registry/latest/relations.jsonl
registry/latest/entity_sources.jsonl
registry/latest/source_artefacts.jsonl
registry/latest/current_entities.jsonl
registry/latest/current_entities.jsonl.gz
registry/latest/current_relations.jsonl
registry/latest/ops_freshness.json
registry/latest/ops_cursors.json
registry/latest/ops_sui_coverage.json
registry/latest/ops_source_gaps.json
```

`EXPORT_PREFIX` controls the prefix. The default is `registry`.

Use `wrangler r2 object put --remote` for production uploads. Very large raw artefacts can exceed Wrangler's remote upload limit. Publish those through R2's S3-compatible multipart upload path when S3 credentials are available or publish a same-name gzip artefact such as `facts.jsonl.gz`.

When a `.jsonl` export object is missing and a matching `.jsonl.gz` object exists, the Worker serves the compressed artefact from the original `.jsonl` route with `Content-Encoding: gzip`. Query routes backed by D1 remain usable even when a raw export artefact still needs multipart publication.

## Public Routes

Implemented in this repo:
```text
GET /v1/health
GET /v1/ready
GET /v1/metrics
GET /metrics
GET /v1/search
GET /v1/entities
GET /v1/entities/{idOrSlug}
GET /v1/entities/{idOrSlug}/facts
GET /v1/entities/{idOrSlug}/relations
GET /v1/entities/{idOrSlug}/sources
GET /v1/entities/{idOrSlug}/history
GET /v1/types
GET /v1/types/{typeID}
GET /v1/current/characters
GET /v1/current/tribes
GET /v1/current/assemblies
GET /v1/current/gates
GET /v1/current/storage
GET /v1/current/turrets
GET /v1/current/regions
GET /v1/current/constellations
GET /v1/current/items
GET /v1/current/materials
GET /v1/current/enemies
GET /v1/current/recipes
GET /v1/current/blueprints
GET /v1/current/ships
GET /v1/current/structures
GET /v1/current/systems
GET /v1/current/routes
GET /v1/current/ownership
GET /v1/current/route-edges
GET /v1/events
GET /v1/events/{id}
GET /v1/killmails
GET /v1/killmails/{id}
GET /v1/killmails/{id}/raw
GET /v1/systems
GET /v1/systems/{idOrSlug}
GET /v1/characters
GET /v1/characters/{idOrSlug}
GET /v1/tribes
GET /v1/tribes/{idOrSlug}
GET /v1/assemblies
GET /v1/assemblies/{idOrSlug}
GET /v1/gates
GET /v1/gates/{idOrSlug}
GET /v1/regions
GET /v1/regions/{idOrSlug}
GET /v1/constellations
GET /v1/constellations/{idOrSlug}
GET /v1/items
GET /v1/items/{idOrSlug}
GET /v1/materials
GET /v1/materials/{idOrSlug}
GET /v1/enemies
GET /v1/enemies/{idOrSlug}
GET /v1/recipes
GET /v1/recipes/{idOrSlug}
GET /v1/blueprints
GET /v1/blueprints/{idOrSlug}
GET /v1/ships
GET /v1/ships/{idOrSlug}
GET /v1/structures
GET /v1/structures/{idOrSlug}
GET /v1/sources
GET /v1/sources/{id}
GET /v1/artefacts/{id}
GET /v1/ops/freshness
GET /v1/ops/cursors
GET /v1/ops/sui-coverage
GET /v1/ops/source-gaps
GET /v1/exports/{file}
```

The route surface is intentionally read-only.

## Cloudflare Resources

Create these before deployment:
```sh
pnpm exec wrangler d1 create blackrelay_api
pnpm exec wrangler r2 bucket create blackrelay-registry-exports
```

Windows:
```powershell
pnpm exec wrangler d1 create blackrelay_api
pnpm exec wrangler r2 bucket create blackrelay-registry-exports
```

Update `wrangler.jsonc` with the real D1 `database_id` before deploying.
