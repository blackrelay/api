# Black Relay API

Black Relay API is the public Cloudflare Worker for `api.blackrelay.network`.

The Registry on the VPS remains the source of truth. This Worker serves public read traffic from:
- D1 query indexes generated from Registry export bundles
- R2 export artefacts published by Registry

The Worker does not index Sui, call the World API or create canonical records.

## Development

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
registry/latest/killmails.jsonl
registry/latest/sources.jsonl
registry/latest/events.jsonl
registry/latest/sui_objects.jsonl
registry/latest/facts.jsonl
registry/latest/relations.jsonl
registry/latest/entity_sources.jsonl
registry/latest/source_artefacts.jsonl
registry/latest/current_entities.jsonl
registry/latest/current_relations.jsonl
registry/latest/ops_freshness.json
registry/latest/ops_cursors.json
registry/latest/ops_sui_coverage.json
registry/latest/ops_source_gaps.json
```

`EXPORT_PREFIX` controls the prefix. The default is `registry`.

Use `wrangler r2 object put --remote` for production uploads. Very large artefacts can exceed Wrangler's remote upload limit; publish those through R2's S3-compatible multipart upload path and keep the manifest and object set aligned. Query routes backed by D1 remain usable even when a raw export artefact still needs multipart publication.

## Public Routes

Implemented in this repo:
```text
GET /v1/health
GET /v1/ready
GET /v1/metrics
GET /v1/entities
GET /v1/entities/{idOrSlug}
GET /v1/entities/{idOrSlug}/facts
GET /v1/entities/{idOrSlug}/relations
GET /v1/entities/{idOrSlug}/sources
GET /v1/entities/{idOrSlug}/history
GET /v1/search
GET /v1/types
GET /v1/types/{typeID}
GET /v1/current/{collection}
GET /v1/{typedCollection}
GET /v1/{typedCollection}/{idOrSlug}
GET /v1/events
GET /v1/events/{id}
GET /v1/killmails
GET /v1/killmails/{id}
GET /v1/killmails/{id}/raw
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
