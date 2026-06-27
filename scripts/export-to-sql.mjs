#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const exportDir = args["export-dir"] ?? args.dir;
const out = args.out;

if (!exportDir || !out) {
  console.error("Usage: pnpm export:sql -- --export-dir <registry-export-dir> --out <seed.sql>");
  process.exit(2);
}

const statements = [
  "BEGIN;",
  "DELETE FROM api_documents;",
  "DELETE FROM api_entities;",
  "DELETE FROM api_sources;",
  "DELETE FROM api_events;",
  "DELETE FROM api_killmails;",
  "DELETE FROM api_current;",
  "DELETE FROM api_facts;",
  "DELETE FROM api_relations;",
  "DELETE FROM api_entity_sources;",
  "DELETE FROM api_artefacts;",
  "DELETE FROM api_source_gaps;"
];

for (const fileName of ["catalog.json", "manifest.json"]) {
  const path = join(exportDir, fileName);
  const body = readFileSync(path, "utf8");
  statements.push(
    insert("api_documents", {
      path: fileName,
      body_json: minifyJSON(body),
      content_type: "application/json",
      sha256: sha256(body)
    })
  );
}

await readJSONL(join(exportDir, "entities.jsonl"), (row) => {
  const entity = parseRow(row);
  const search = [entity.id, entity.slug, entity.name, entity.displayName, entity.summary, entity.entityType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  statements.push(
    insert("api_entities", {
      id: entity.id,
      slug: entity.slug,
      name: entity.displayName ?? entity.name,
      entity_type: entity.entityType,
      environment: entity.environment,
      cycle: entity.cycle ?? null,
      body_json: JSON.stringify(entity),
      search_text: search,
      sort_key: `${entity.name ?? entity.id}\u0000${entity.id}`
    })
  );
  const collection = collectionForEntityType(entity.entityType);
  if (collection) {
    statements.push(
      insert("api_current", {
        collection,
        id: entity.id,
        environment: entity.environment,
        cycle: entity.cycle ?? null,
        body_json: JSON.stringify(entity),
        search_text: search,
        sort_key: `${entity.name ?? entity.id}\u0000${entity.id}`
      })
    );
  }
});

await readOptionalJSONL(join(exportDir, "sources.jsonl"), (row) => {
  const source = parseRow(row);
  statements.push(
    insert("api_sources", {
      id: source.id,
      source_kind: source.sourceKind ?? source.kind ?? null,
      environment: source.environment ?? null,
      body_json: JSON.stringify(source),
      sort_key: `${source.sourceKind ?? source.kind ?? ""}\u0000${source.id}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "events.jsonl"), (row) => {
  const event = parseRow(row);
  statements.push(
    insert("api_events", {
      id: event.id,
      kind: event.kind,
      environment: event.environment,
      cycle: event.cycle ?? cycleForTimestamp(event.occurredAt),
      occurred_at: event.occurredAt,
      package_id: event.packageId ?? null,
      module: event.module ?? null,
      transaction_digest: event.transactionDigest ?? null,
      source_id: event.sourceId ?? null,
      body_json: JSON.stringify(event)
    })
  );
});

await readOptionalJSONL(join(exportDir, "facts.jsonl"), (row) => {
  const fact = parseRow(row);
  statements.push(
    insert("api_facts", {
      entity_id: fact.entityId,
      fact_key: fact.key,
      source_id: fact.sourceId,
      environment: fact.environment,
      cycle: fact.cycle ?? null,
      body_json: JSON.stringify(fact),
      sort_key: `${fact.key}\u0000${fact.sourceId}\u0000${fact.entityId}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "relations.jsonl"), (row) => {
  const relation = parseRow(row);
  const id = relation.id ?? relationID(relation);
  statements.push(
    insert("api_relations", {
      id,
      subject_entity_id: relation.subjectEntityId,
      predicate: relation.predicate,
      object_entity_id: relation.objectEntityId,
      source_id: relation.sourceId,
      environment: relation.environment,
      body_json: JSON.stringify(relation),
      sort_key: `${relation.predicate}\u0000${relation.objectEntityId}\u0000${relation.sourceId}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "entity_sources.jsonl"), (row) => {
  const item = parseRow(row);
  const source = item.source ?? item;
  const entityId = item.entityId ?? item.entity_id;
  if (!entityId || !source?.id) {
    return;
  }
  statements.push(
    insert("api_entity_sources", {
      entity_id: entityId,
      source_id: source.id,
      body_json: JSON.stringify(source),
      sort_key: `${source.kind ?? ""}\u0000${source.id}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "source_artefacts.jsonl"), (row) => {
  const artefact = parseRow(row);
  statements.push(
    insert("api_artefacts", {
      id: artefact.id,
      source_id: artefact.sourceId,
      source_kind: artefact.sourceKind ?? artefact.kind ?? null,
      environment: artefact.environment,
      artefact_kind: artefact.artefactKind ?? artefact.kind ?? null,
      sha256: artefact.sha256 ?? null,
      body_json: JSON.stringify(artefact),
      sort_key: `${artefact.extractedAt ?? artefact.createdAt ?? ""}\u0000${artefact.id}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "current_entities.jsonl"), (row) => {
  const current = parseRow(row);
  const entity = current.entity ?? current;
  const collection = collectionForEntityType(entity.entityType);
  if (!collection) {
    return;
  }
  const search = currentSearchText(current, entity);
  statements.push(
    insertOrReplace("api_current", {
      collection,
      id: entity.id,
      environment: entity.environment,
      cycle: entity.cycle ?? null,
      body_json: JSON.stringify(current),
      search_text: search,
      sort_key: `${entity.displayName ?? entity.name ?? entity.id}\u0000${entity.id}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "current_relations.jsonl"), (row) => {
  const relation = parseRow(row);
  const collection = relationCollection(relation);
  if (!collection) {
    return;
  }
  const id = relation.id ?? relationID(relation);
  const search = [relation.subjectEntityId, relation.subjectDisplayName, relation.predicate, relation.objectEntityId, relation.objectDisplayName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  statements.push(
    insertOrReplace("api_current", {
      collection,
      id,
      environment: relation.environment,
      cycle: relation.cycle ?? null,
      body_json: JSON.stringify(relation),
      search_text: search,
      sort_key: `${relation.subjectDisplayName ?? relation.subjectEntityId}\u0000${relation.objectDisplayName ?? relation.objectEntityId}\u0000${id}`
    })
  );
});

await readOptionalJSONL(join(exportDir, "killmails.jsonl"), (row) => {
  const killmail = parseRow(row);
  statements.push(
    insert("api_killmails", {
      id: killmail.id,
      environment: killmail.environment,
      cycle: cycleForTimestamp(killmail.occurredAt),
      occurred_at: killmail.occurredAt,
      system_id: killmail.systemId ?? null,
      victim_character_id: killmail.victimCharacterId ?? null,
      killer_character_id: killmail.killerCharacterId ?? null,
      killer_type_id: killmail.killerTypeId ?? null,
      reporter_character_id: killmail.reporterCharacterId ?? null,
      npc: killmail.killerTypeId ? 1 : 0,
      body_json: JSON.stringify(killmail)
    })
  );
});

for (const item of [
  ["ops_freshness.json", "ops/freshness.json"],
  ["ops_cursors.json", "ops/cursors.json"],
  ["ops_sui_coverage.json", "ops/sui-coverage.json"],
  ["ops_source_gaps.json", "ops/source-gaps.json"]
]) {
  const [fileName, documentPath] = item;
  await readOptionalJSON(join(exportDir, fileName), (body) => {
    statements.push(
      insert("api_documents", {
        path: documentPath,
        body_json: minifyJSON(body),
        content_type: "application/json",
        sha256: sha256(body)
      })
    );
    if (fileName === "ops_source_gaps.json") {
      for (const gap of rowsFromDocument(body)) {
        statements.push(
          insert("api_source_gaps", {
            id: gap.id,
            kind: gap.kind,
            category: gap.category ?? "",
            severity: gap.severity,
            environment: gap.environment ?? null,
            count: gap.count ?? 0,
            body_json: JSON.stringify(gap)
          })
        );
      }
    }
  });
}

statements.push("COMMIT;");
writeFileSync(out, `${statements.join("\n")}\n`, "utf8");
console.log(`Wrote ${out}`);

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const arg = values[i];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = values[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "1";
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

async function readOptionalJSONL(path, onRow) {
  try {
    await readJSONL(path, onRow);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function readOptionalJSON(path, onDocument) {
  try {
    onDocument(readFileSync(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function readJSONL(path, onRow) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) {
      onRow(line);
    }
  }
}

function parseRow(row) {
  return JSON.parse(row);
}

function minifyJSON(value) {
  return JSON.stringify(JSON.parse(value));
}

function insert(table, values) {
  const columns = Object.keys(values);
  const sqlValues = columns.map((column) => sqlLiteral(values[column]));
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${sqlValues.join(", ")});`;
}

function insertOrReplace(table, values) {
  const columns = Object.keys(values);
  const sqlValues = columns.map((column) => sqlLiteral(values[column]));
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${sqlValues.join(", ")});`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cycleForTimestamp(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return null;
  }
  if (time >= Date.parse("2026-06-25T09:00:00Z")) {
    return 6;
  }
  if (time >= Date.parse("2026-03-11T09:00:00Z")) {
    return 5;
  }
  return null;
}

function relationID(relation) {
  return `relation:${relation.subjectEntityId}:${relation.predicate}:${relation.objectEntityId}:${relation.sourceId}`;
}

function rowsFromDocument(body) {
  const parsed = JSON.parse(body);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.data)) {
    return parsed.data;
  }
  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }
  return [];
}

function currentSearchText(current, entity) {
  return [
    entity.id,
    entity.slug,
    entity.name,
    entity.displayName,
    entity.summary,
    entity.entityType,
    current.derived?.profile?.metadataName,
    current.derived?.profile?.tag,
    current.derived?.tribe?.displayName,
    current.derived?.owner?.displayName,
    current.derived?.system?.displayName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function relationCollection(relation) {
  if (relation.predicate === "owned_by") {
    return "ownership";
  }
  if (relation.predicate === "links_to" || relation.predicate === "observed_between") {
    return "route-edges";
  }
  return undefined;
}

function collectionForEntityType(entityType) {
  return {
    character: "characters",
    tribe: "tribes",
    assembly: "assemblies",
    gate: "gates",
    storage: "storage",
    turret: "turrets",
    region: "regions",
    constellation: "constellations",
    item: "items",
    material: "materials",
    enemy: "enemies",
    recipe: "recipes",
    blueprint: "blueprints",
    ship: "ships",
    structure: "structures",
    system: "systems",
    route: "routes"
  }[entityType];
}
