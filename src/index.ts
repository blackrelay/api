/// <reference path="../worker-configuration.d.ts" />

import { emptyResponse, envelope, errorResponse, isPubliclyCacheable, jsonResponse, withCors, withHead, type ApiMeta } from "./http";
import { dedupeCurrentCharacters } from "./current";
import { currentCollectionEntityTypes, currentCollections, parseCycleScope, parseLimit, typedCollectionEntityTypes } from "./query";
import { ApiRepository } from "./repository";
import { readExportObject, r2Response } from "./r2";

const exportFiles = new Set([
  "manifest.json",
  "catalog.json",
  "entities.jsonl",
  "entities.jsonl.gz",
  "killmails.jsonl",
  "killmails.jsonl.gz",
  "sources.jsonl",
  "sources.jsonl.gz",
  "events.jsonl",
  "events.jsonl.gz",
  "sui_objects.jsonl",
  "sui_objects.jsonl.gz",
  "facts.jsonl",
  "facts.jsonl.gz",
  "relations.jsonl",
  "relations.jsonl.gz",
  "entity_sources.jsonl",
  "entity_sources.jsonl.gz",
  "source_artefacts.jsonl",
  "source_artefacts.jsonl.gz",
  "current_entities.jsonl",
  "current_entities.jsonl.gz",
  "current_relations.jsonl",
  "current_relations.jsonl.gz",
  "ops_freshness.json",
  "ops_cursors.json",
  "ops_sui_coverage.json",
  "ops_source_gaps.json"
]);

const documentedEndpoints = [
  "/v1/health",
  "/v1/ready",
  "/v1/metrics",
  "/metrics",
  "/v1/search",
  "/v1/entities",
  "/v1/entities/{idOrSlug}",
  "/v1/entities/{idOrSlug}/facts",
  "/v1/entities/{idOrSlug}/relations",
  "/v1/entities/{idOrSlug}/sources",
  "/v1/entities/{idOrSlug}/history",
  "/v1/types",
  "/v1/types/{typeID}",
  "/v1/current/characters",
  "/v1/current/tribes",
  "/v1/current/assemblies",
  "/v1/current/gates",
  "/v1/current/storage",
  "/v1/current/turrets",
  "/v1/current/regions",
  "/v1/current/constellations",
  "/v1/current/items",
  "/v1/current/materials",
  "/v1/current/enemies",
  "/v1/current/recipes",
  "/v1/current/blueprints",
  "/v1/current/ships",
  "/v1/current/structures",
  "/v1/current/systems",
  "/v1/current/routes",
  "/v1/current/ownership",
  "/v1/current/route-edges",
  "/v1/events",
  "/v1/events/{id}",
  "/v1/killmails",
  "/v1/killmails/{id}",
  "/v1/killmails/{id}/raw",
  "/v1/systems",
  "/v1/systems/{idOrSlug}",
  "/v1/characters",
  "/v1/characters/{idOrSlug}",
  "/v1/tribes",
  "/v1/tribes/{idOrSlug}",
  "/v1/assemblies",
  "/v1/assemblies/{idOrSlug}",
  "/v1/gates",
  "/v1/gates/{idOrSlug}",
  "/v1/regions",
  "/v1/regions/{idOrSlug}",
  "/v1/constellations",
  "/v1/constellations/{idOrSlug}",
  "/v1/items",
  "/v1/items/{idOrSlug}",
  "/v1/materials",
  "/v1/materials/{idOrSlug}",
  "/v1/enemies",
  "/v1/enemies/{idOrSlug}",
  "/v1/recipes",
  "/v1/recipes/{idOrSlug}",
  "/v1/blueprints",
  "/v1/blueprints/{idOrSlug}",
  "/v1/ships",
  "/v1/ships/{idOrSlug}",
  "/v1/structures",
  "/v1/structures/{idOrSlug}",
  "/v1/sources",
  "/v1/sources/{id}",
  "/v1/artefacts/{id}",
  "/v1/ops/freshness",
  "/v1/ops/cursors",
  "/v1/ops/sui-coverage",
  "/v1/ops/source-gaps",
  "/v1/exports/{file}"
] as const;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return withCors(withHead(request, await handleCachedRequest(request, env, ctx)), request);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "unhandled request error", error: error instanceof Error ? error.message : String(error) }));
      return withCors(errorResponse("internal_error", "Internal server error.", meta(env), 500), request);
    }
  }
} satisfies ExportedHandler<Env>;

async function handleCachedRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "GET") {
    return handleRequest(request, env);
  }
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }
  const response = await handleRequest(request, env);
  if (isPubliclyCacheable(response)) {
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  }
  return response;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return emptyResponse({ status: 204 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("method_not_allowed", "Only GET and HEAD are supported by the public API.", meta(env), 405);
  }

  const url = new URL(request.url);
  const path = trimPath(url.pathname);
  const parts = path.split("/").filter(Boolean);
  const repository = new ApiRepository(env.DB);
  const apiMeta = meta(env);

  if (parts.length === 0 || path === "v1") {
    return jsonResponse(envelope(rootDocument(env), apiMeta));
  }
  if (path === "metrics") {
    return new Response(await repository.metrics(), {
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
  if (parts[0] !== "v1") {
    return errorResponse("not_found", "Route not found.", apiMeta, 404);
  }

  if (parts[1] === "health" && parts.length === 2) {
    return jsonResponse(envelope({ status: "ok", time: new Date().toISOString() }, apiMeta), {}, "no-store");
  }

  if (parts[1] === "ready" && parts.length === 2) {
    await repository.ping();
    const manifest = await readExportObject(env.EXPORTS, env.EXPORT_PREFIX, "manifest.json");
    return jsonResponse(envelope({ status: manifest ? "ready" : "degraded", r2LatestManifest: Boolean(manifest) }, apiMeta), {
      status: manifest ? 200 : 503
    }, "no-store");
  }

  if (parts[1] === "metrics" && parts.length === 2) {
    return new Response(await repository.metrics(), {
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  if (parts[1] === "exports" && parts.length === 3 && exportFiles.has(parts[2] ?? "")) {
    const exportPath = parts[2] ?? "";
    const object = await readExportObject(env.EXPORTS, env.EXPORT_PREFIX, exportPath);
    if (!object && exportPath.endsWith(".jsonl")) {
      const compressed = await readExportObject(env.EXPORTS, env.EXPORT_PREFIX, `${exportPath}.gz`);
      if (compressed) {
        return r2Response(compressed, "public, max-age=60, s-maxage=300", {
          "content-type": "application/x-ndjson; charset=utf-8",
          "content-encoding": "gzip",
          "vary": "Accept-Encoding"
        });
      }
    }
    if (!object) {
      return errorResponse("not_found", "Export object not found.", apiMeta, 404);
    }
    return r2Response(object);
  }

  if (parts[1] === "exports" && parts[2] === "catalog.json" && parts.length === 3) {
    const catalog = await repository.document("catalog.json");
    if (!catalog) {
      return errorResponse("not_found", "Catalog document not found.", apiMeta, 404);
    }
    return jsonResponse(catalog);
  }

  if ((parts[1] === "entities" || parts[1] === "search") && parts.length === 2) {
    const page = await repository.listEntities(listOptions(url, env));
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "entities" && parts.length === 3) {
    const entity = await repository.getEntity(decodeURIComponent(parts[2] ?? ""));
    if (!entity) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(entity, apiMeta));
  }

  if (parts[1] === "entities" && parts.length === 4 && parts[3] === "facts") {
    const page = await repository.listEntityFacts(decodeURIComponent(parts[2] ?? ""));
    if (!page) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(page.data, apiMeta));
  }

  if (parts[1] === "entities" && parts.length === 4 && parts[3] === "relations") {
    const page = await repository.listEntityRelations(decodeURIComponent(parts[2] ?? ""));
    if (!page) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(page.data, apiMeta));
  }

  if (parts[1] === "entities" && parts.length === 4 && parts[3] === "sources") {
    const page = await repository.listEntitySources(decodeURIComponent(parts[2] ?? ""));
    if (!page) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(page.data, apiMeta));
  }

  if (parts[1] === "entities" && parts.length === 4 && parts[3] === "history") {
    const history = await repository.getEntityHistory(decodeURIComponent(parts[2] ?? ""));
    if (!history) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(history, apiMeta));
  }

  if (parts[1] === "current" && parts.length === 3 && currentCollections.has(parts[2] ?? "")) {
    const collection = parts[2] ?? "";
    const page = await repository.listCurrent(collection, listOptions(url, env));
    if (collection === "characters") {
      page.data = dedupeCurrentCharacters(page.data);
    }
    if (page.data.length === 0 && currentCollectionEntityTypes[collection]) {
      const fallback = await repository.listEntities({ ...listOptions(url, env), entityType: currentCollectionEntityTypes[collection] });
      return jsonResponse(envelope(fallback.data, apiMeta, fallback.nextCursor));
    }
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "types" && parts.length === 2) {
    const page = await repository.listEntities(listOptions(url, env));
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "types" && parts.length === 3) {
    const entity = await repository.getStaticType(decodeURIComponent(parts[2] ?? ""));
    if (!entity) {
      return errorResponse("not_found", "Static type not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(entity, apiMeta));
  }

  if (parts[1] && typedCollectionEntityTypes[parts[1]] && parts.length === 2) {
    const page = await repository.listEntities({ ...listOptions(url, env), entityType: typedCollectionEntityTypes[parts[1]] });
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] && typedCollectionEntityTypes[parts[1]] && parts.length === 3) {
    const entity = await repository.getEntity(decodeURIComponent(parts[2] ?? ""), typedCollectionEntityTypes[parts[1]]);
    if (!entity) {
      return errorResponse("not_found", "Entity not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(entity, apiMeta));
  }

  if (parts[1] === "sources" && parts.length === 2) {
    const page = await repository.listSources(environment(url, env), parseLimit(url.searchParams.get("limit")));
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "sources" && parts.length === 3) {
    const source = await repository.getSource(decodeURIComponent(parts[2] ?? ""));
    if (!source) {
      return errorResponse("not_found", "Source not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(source, apiMeta));
  }

  if (parts[1] === "artefacts" && parts.length === 3) {
    const artefact = await repository.getArtefact(decodeURIComponent(parts[2] ?? ""));
    if (!artefact) {
      return errorResponse("not_found", "Artefact not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(artefact, apiMeta));
  }

  if (parts[1] === "events" && parts.length === 2) {
    const page = await repository.listEvents({
      ...listOptions(url, env),
      kind: optional(url, "kind"),
      module: optional(url, "module"),
      packageId: optional(url, "package_id"),
      transactionDigest: optional(url, "transaction_digest"),
      sourceId: optional(url, "source_id")
    });
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "events" && parts.length === 3) {
    const event = await repository.getEvent(decodeURIComponent(parts[2] ?? ""));
    if (!event) {
      return errorResponse("not_found", "Event not found.", apiMeta, 404);
    }
    return jsonResponse(envelope(event, apiMeta));
  }

  if (parts[1] === "killmails" && parts.length === 2) {
    const page = await repository.listKillmails({
      ...listOptions(url, env),
      system: optional(url, "system"),
      victim: optional(url, "victim"),
      killer: optional(url, "killer"),
      reporter: optional(url, "reporter"),
      npc: optional(url, "npc")
    });
    return jsonResponse(envelope(page.data, apiMeta, page.nextCursor));
  }

  if (parts[1] === "killmails" && parts.length >= 3 && parts.length <= 4) {
    const killmail = await repository.getKillmail(decodeURIComponent(parts[2] ?? ""));
    if (!killmail) {
      return errorResponse("not_found", "Killmail not found.", apiMeta, 404);
    }
    if (parts[3] === "raw" && typeof killmail === "object" && killmail && "raw" in killmail) {
      return jsonResponse(envelope((killmail as { raw?: unknown }).raw ?? killmail, apiMeta));
    }
    if (!parts[3]) {
      return jsonResponse(envelope(killmail, apiMeta));
    }
  }

  if (parts[1] === "ops" && parts[2] === "source-gaps" && parts.length === 3) {
    const page = await repository.listSourceGaps(environment(url, env));
    return jsonResponse(envelope(page.data, apiMeta));
  }

  if (parts[1] === "ops" && parts.length === 3 && ["freshness", "cursors", "sui-coverage"].includes(parts[2] ?? "")) {
    const document = await repository.document(`ops/${parts[2]}.json`);
    if (!document) {
      return errorResponse("not_found", "Operations document not found.", apiMeta, 404);
    }
    return jsonResponse(document);
  }

  return errorResponse("not_found", "Route not found.", apiMeta, 404);
}

function trimPath(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, "");
}

function meta(env: Env): ApiMeta {
  return {
    registry: env.REGISTRY_ID,
    apiVersion: env.API_VERSION
  };
}

function environment(url: URL, env: Env): string {
  return url.searchParams.get("environment")?.trim() || env.DEFAULT_ENVIRONMENT;
}

function currentCycle(env: Env): number {
  const parsed = Number.parseInt(env.CURRENT_CYCLE, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 6;
}

function listOptions(url: URL, env: Env) {
  return {
    environment: environment(url, env),
    cycles: parseCycleScope(url.searchParams.get("cycles") ?? url.searchParams.get("cycle"), currentCycle(env)),
    q: optional(url, "q"),
    limit: parseLimit(url.searchParams.get("limit")),
    cursor: optional(url, "cursor")
  };
}

function optional(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function rootDocument(env: Env): Record<string, unknown> {
  return {
    name: "Black Relay Public API",
    version: env.API_VERSION,
    source: "Registry exports indexed into D1 and preserved in R2.",
    defaultEnvironment: env.DEFAULT_ENVIRONMENT,
    currentCycle: Number.parseInt(env.CURRENT_CYCLE, 10),
    endpoints: documentedEndpoints
  };
}
