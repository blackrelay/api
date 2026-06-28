#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const exportDir = args["export-dir"] ?? args.dir;
const out = args.out;
const chunkDir = args["chunk-dir"];
const chunkMaxBytes = parseByteSize(args["chunk-max-bytes"] ?? "8000000");
const transactions = args["no-transactions"] !== "1";
const sortSeparator = " | ";
const maxD1BodyJSONBytes = 30_000;
const entityDisplayByID = new Map();
const tribeDisplayByToken = new Map();

if (!exportDir || (!out && !chunkDir)) {
  console.error("Usage: pnpm export:sql -- --export-dir <registry-export-dir> --out <seed.sql>");
  console.error("   or: pnpm export:sql -- --export-dir <registry-export-dir> --chunk-dir <seed-sql-dir> [--chunk-max-bytes <bytes>] [--no-transactions]");
  process.exit(2);
}

async function main() {
  const writer = new SQLWriter({ out, chunkDir, chunkMaxBytes, transactions });
  const statements = {
    push: (...values) => {
      for (const value of values) {
        writer.write(value);
      }
    }
  };

  statements.push(
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
  );

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
  registerEntityDisplay(entity);
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
      sort_key: sortKey(entity.name ?? entity.id, entity.id)
    })
  );
});

await readOptionalJSONL(join(exportDir, "sources.jsonl"), (row) => {
  const source = parseRow(row);
  statements.push(
    insert("api_sources", {
      id: source.id,
      source_kind: source.sourceKind ?? source.kind ?? null,
      environment: source.environment ?? null,
      body_json: JSON.stringify(source),
      sort_key: sortKey(source.sourceKind ?? source.kind ?? "", source.id)
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
      sort_key: sortKey(fact.key, fact.sourceId, fact.entityId)
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
      sort_key: sortKey(relation.predicate, relation.objectEntityId, relation.sourceId)
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
      sort_key: sortKey(source.kind ?? "", source.id)
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
      sort_key: sortKey(artefact.extractedAt ?? artefact.createdAt ?? "", artefact.id)
    })
  );
});

await readOptionalJSONL(join(exportDir, "current_entities.jsonl"), (row) => {
  const current = enrichCurrent(parseRow(row));
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
      body_json: currentBodyJSON(current, entity),
      search_text: search,
      sort_key: sortKey(entity.displayName ?? entity.name ?? entity.id, entity.id)
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
      sort_key: sortKey(relation.subjectDisplayName ?? relation.subjectEntityId, relation.objectDisplayName ?? relation.objectEntityId, id)
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

  writer.close();
  console.log(writer.summary());
}

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

function parseByteSize(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1_000_000) {
    throw new Error("--chunk-max-bytes must be at least 1000000");
  }
  return parsed;
}

class SQLWriter {
  constructor({ out, chunkDir, chunkMaxBytes, transactions }) {
    this.out = out;
    this.chunkDir = chunkDir;
    this.chunkMaxBytes = chunkMaxBytes;
    this.transactions = transactions;
    this.buffer = [];
    this.bufferBytes = 0;
    this.chunkIndex = 0;
    this.chunkBytes = 0;
    this.files = [];

    if (this.chunkDir) {
      mkdirSync(this.chunkDir, { recursive: true });
      rmSync(this.chunkDir, { recursive: true, force: true });
      mkdirSync(this.chunkDir, { recursive: true });
      this.openChunk();
    } else {
      writeFileSync(this.out, "", "utf8");
      if (this.transactions) {
        this.writeRaw("BEGIN;\n");
      }
    }
  }

  write(statement) {
    const line = `${statement}\n`;
    const transactionOverhead = this.transactions ? "BEGIN;\nCOMMIT;\n".length : 0;
    if (this.chunkDir && this.chunkBytes > 0 && this.chunkBytes + Buffer.byteLength(line) + transactionOverhead > this.chunkMaxBytes) {
      this.closeChunk();
      this.openChunk();
    }
    this.writeRaw(line);
  }

  close() {
    if (this.chunkDir) {
      this.closeChunk();
    } else {
      if (this.transactions) {
        this.writeRaw("COMMIT;\n");
      }
      this.flush();
    }
  }

  summary() {
    if (this.chunkDir) {
      return `Wrote ${this.files.length} SQL chunk(s) to ${this.chunkDir}`;
    }
    return `Wrote ${this.out}`;
  }

  openChunk() {
    const name = `${String(this.chunkIndex).padStart(4, "0")}.sql`;
    this.currentPath = join(this.chunkDir, name);
    this.files.push(this.currentPath);
    this.chunkIndex += 1;
    this.chunkBytes = 0;
    writeFileSync(this.currentPath, "", "utf8");
    if (this.transactions) {
      this.writeRaw("BEGIN;\n");
    }
  }

  closeChunk() {
    if (this.transactions) {
      this.writeRaw("COMMIT;\n");
    }
    this.flush();
  }

  writeRaw(value) {
    const bytes = Buffer.byteLength(value);
    this.buffer.push(value);
    this.bufferBytes += bytes;
    this.chunkBytes += bytes;
    if (this.bufferBytes >= 1_000_000) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length === 0) {
      return;
    }
    appendFileSync(this.chunkDir ? this.currentPath : this.out, this.buffer.join(""), "utf8");
    this.buffer = [];
    this.bufferBytes = 0;
  }
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
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${sqlValues.join(", ")});`;
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

function sortKey(...parts) {
  return parts.map((part) => String(part ?? "")).join(sortSeparator);
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

function registerEntityDisplay(entity) {
  const id = String(entity.id ?? "").trim();
  const displayName = String(entity.displayName ?? entity.name ?? "").trim();
  if (!id || !displayName) {
    return;
  }
  entityDisplayByID.set(id, displayName);
  if (entity.entityType === "tribe" && !isPlaceholderDisplay("tribe", displayName)) {
    const token = entityToken(id) || String(entity.tribeId ?? "").trim();
    const environment = String(entity.environment ?? "").trim();
    if (token && environment) {
      tribeDisplayByToken.set(`${environment}:${token}`, displayName);
    }
  }
}

function enrichCurrent(current) {
  const enriched = JSON.parse(JSON.stringify(current));
  const enrichedEntity = enriched.entity ?? enriched;
  const entityType = String(enrichedEntity.entityType ?? "");
  const entityDisplay = resolveDisplayName(String(enrichedEntity.id ?? ""), entityType, String(enrichedEntity.displayName ?? enrichedEntity.name ?? ""));
  if (entityDisplay) {
    enrichedEntity.displayName = entityDisplay;
    enrichedEntity.name = entityDisplay;
  }
  for (const key of ["tribe", "owner", "system"]) {
    const related = enriched.derived?.[key];
    if (!related || typeof related !== "object") {
      continue;
    }
    const display = resolveDisplayName(String(related.entityId ?? ""), String(related.entityType ?? key), String(related.displayName ?? ""));
    if (display) {
      related.displayName = display;
    }
  }
  for (const key of ["outgoingRelations", "incomingRelations"]) {
    if (!Array.isArray(enriched[key])) {
      continue;
    }
    for (const relation of enriched[key]) {
      const subjectDisplay = resolveDisplayName(
        String(relation.subjectEntityId ?? ""),
        String(relation.subjectEntityType ?? ""),
        String(relation.subjectDisplayName ?? "")
      );
      if (subjectDisplay) {
        relation.subjectDisplayName = subjectDisplay;
      }
      const objectDisplay = resolveDisplayName(
        String(relation.objectEntityId ?? ""),
        String(relation.objectEntityType ?? ""),
        String(relation.objectDisplayName ?? "")
      );
      if (objectDisplay) {
        relation.objectDisplayName = objectDisplay;
      }
    }
  }
  return enriched;
}

function resolveDisplayName(id, entityType, currentDisplay) {
  const exact = entityDisplayByID.get(id);
  if (exact && (!currentDisplay || isPlaceholderDisplay(entityType, currentDisplay))) {
    return exact;
  }
  if (entityType === "tribe") {
    const token = entityToken(id);
    const environment = entityEnvironment(id);
    const tribeDisplay = token && environment ? tribeDisplayByToken.get(`${environment}:${token}`) : undefined;
    if (tribeDisplay && (!currentDisplay || isPlaceholderDisplay(entityType, currentDisplay))) {
      return tribeDisplay;
    }
  }
  return currentDisplay;
}

function isPlaceholderDisplay(entityType, value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return true;
  }
  if (entityType === "tribe") {
    return /^Tribe \d+$/i.test(text);
  }
  if (entityType === "system") {
    return /^System \d+$/i.test(text);
  }
  if (entityType === "item" || entityType === "material") {
    return /^Input type \d+$/i.test(text);
  }
  return false;
}

function entityToken(id) {
  const index = id.lastIndexOf(":");
  return index >= 0 ? id.slice(index + 1) : id;
}

function entityEnvironment(id) {
  const parts = id.split(":");
  return parts.length >= 3 ? parts[1] : "";
}

function currentBodyJSON(current, entity) {
  const body = JSON.stringify(current);
  if (Buffer.byteLength(body) <= maxD1BodyJSONBytes) {
    return body;
  }
  const compact = {
    entity,
    facts: compactObject(current.facts, { maxKeys: 120, maxString: 800, maxArray: 32 }),
    derived: compactObject(current.derived, { maxKeys: 80, maxString: 800, maxArray: 24 }),
    sourceIds: compactStringArray(current.sourceIds, 80),
    outgoingRelations: compactRelations(current.outgoingRelations),
    incomingRelations: compactRelations(current.incomingRelations),
    d1Compacted: true,
    compactReason: "current row exceeded D1 statement size limits",
    fullRecordExport: "registry/latest/current_entities.jsonl"
  };
  let compactBody = JSON.stringify(removeEmptyFields(compact));
  if (Buffer.byteLength(compactBody) <= maxD1BodyJSONBytes) {
    return compactBody;
  }

  compact.outgoingRelations = undefined;
  compact.incomingRelations = undefined;
  compactBody = JSON.stringify(removeEmptyFields(compact));
  if (Buffer.byteLength(compactBody) <= maxD1BodyJSONBytes) {
    return compactBody;
  }

  compact.facts = compactObject(current.facts, { maxKeys: 48, maxString: 300, maxArray: 12 });
  compact.derived = compactObject(current.derived, { maxKeys: 32, maxString: 300, maxArray: 12 });
  return JSON.stringify(removeEmptyFields(compact));
}

function compactRelations(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const usefulPredicates = new Set([
    "belongs_to",
    "owned_by",
    "located_in",
    "located_at",
    "deployed_in",
    "observed_in",
    "links_to",
    "observed_between",
    "occurred_in",
    "victim",
    "killer",
    "reported_by"
  ]);
  return value
    .filter((relation) => usefulPredicates.has(String(relation?.predicate ?? "")))
    .slice(0, 32)
    .map((relation) =>
      removeEmptyFields({
        id: relation.id,
        subjectEntityId: relation.subjectEntityId,
        subjectEntityType: relation.subjectEntityType,
        subjectDisplayName: relation.subjectDisplayName,
        predicate: relation.predicate,
        objectEntityId: relation.objectEntityId,
        objectEntityType: relation.objectEntityType,
        objectDisplayName: relation.objectDisplayName,
        sourceId: relation.sourceId,
        confidence: relation.confidence,
        environment: relation.environment,
        cycle: relation.cycle
      })
    );
}

function compactObject(value, options, depth = 0) {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length > options.maxString ? `${value.slice(0, options.maxString)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, options.maxArray).map((item) => compactObject(item, options, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value !== "object" || depth >= 4) {
    return undefined;
  }
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, options.maxKeys)) {
    const compacted = compactObject(item, options, depth + 1);
    if (compacted !== undefined) {
      out[key] = compacted;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function compactStringArray(value, limit) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].sort().slice(0, limit);
  return out.length === 0 ? undefined : out;
}

function removeEmptyFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) {
      continue;
    }
    if (Array.isArray(item) && item.length === 0) {
      continue;
    }
    if (!Array.isArray(item) && typeof item === "object" && Object.keys(item).length === 0) {
      continue;
    }
    out[key] = item;
  }
  return out;
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

await main();
