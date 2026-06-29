import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("export-to-sql", () => {
  it("does not write raw NUL bytes in sort keys", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(
      join(exportDir, "entities.jsonl"),
      `${JSON.stringify({
        id: "character:stillness:1",
        slug: "character-1-stillness",
        name: "Alpha",
        displayName: "Alpha",
        summary: "Fixture character.",
        entityType: "character",
        environment: "stillness",
        cycle: 6
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"));
    expect(sql.includes(0)).toBe(false);
    expect(sql.toString("utf8")).toContain("Alpha | character:stillness:1");
    expect(sql.toString("utf8")).not.toContain("BEGIN;");
    expect(sql.toString("utf8")).not.toContain("COMMIT;");
  });

  it("compacts oversized current entity bodies for D1 imports", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "current_entities.jsonl"),
      `${JSON.stringify({
        entity: {
          id: "character:stillness:oversized",
          slug: "oversized-stillness",
          name: "Oversized",
          displayName: "Oversized",
          entityType: "character",
          environment: "stillness",
          cycle: 6
        },
        facts: {
          source_event_kind: "character.created",
          system_id: "30000192",
          region_name: "Known Region"
        },
        derived: {
          profile: {
            metadataName: "Oversized"
          },
          payload: "x".repeat(220_000)
        }
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).toContain("d1Compacted");
    expect(sql).toContain("metadataName");
    expect(sql).toContain("Known Region");
    expect(sql).toContain("registry/latest/current_entities.jsonl");
    expect(sql).not.toContain("x".repeat(10_000));
  });

  it("uses exported entity names to repair placeholder current relation labels", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(
      join(exportDir, "entities.jsonl"),
      `${JSON.stringify({
        id: "tribe:stillness:1000167",
        slug: "tribe-1000167-stillness",
        name: "Clonebank 86",
        displayName: "Clonebank 86",
        entityType: "tribe",
        environment: "stillness",
        cycle: 6
      })}\n`
    );
    writeFileSync(
      join(exportDir, "current_entities.jsonl"),
      `${JSON.stringify({
        entity: {
          id: "character:stillness:2112092405",
          slug: "character-2112092405-stillness",
          name: "GoOdFellasAgent",
          displayName: "GoOdFellasAgent",
          entityType: "character",
          environment: "stillness",
          cycle: 6
        },
        facts: {
          character_address: "0xabc",
          source_event_kind: "character.created",
          tribe_id: 1000167
        },
        derived: {
          tribe: {
            entityId: "tribe:stillness:1000167",
            entityType: "tribe",
            displayName: "Tribe 1000167"
          }
        },
        outgoingRelations: [
          {
            id: "relation:character:stillness:2112092405:belongs_to:tribe:stillness:1000167",
            subjectEntityId: "character:stillness:2112092405",
            subjectEntityType: "character",
            subjectDisplayName: "GoOdFellasAgent",
            predicate: "belongs_to",
            objectEntityId: "tribe:stillness:1000167",
            objectEntityType: "tribe",
            objectDisplayName: "Tribe 1000167"
          }
        ]
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).toContain("Clonebank 86");
    expect(sql).not.toContain("Tribe 1000167");
  });

  it("does not import object-only legacy characters into current-state tables", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "current_entities.jsonl"),
      [
        {
          entity: {
            id: "character:stillness:2112077591",
            slug: "character-2112077591-stillness",
            name: "Cassius",
            displayName: "Cassius",
            entityType: "character",
            environment: "stillness",
            cycle: 6
          },
          facts: {
            character_address: "0xf09dfb4627f9144213d3c9a0390933b5febbe2f2bc959404d309d0538ea4fec4",
            metadata_name: "Cassius",
            package_id: "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c"
          }
        },
        {
          entity: {
            id: "character:stillness:2112099999",
            slug: "character-2112099999-stillness",
            name: "Cycle 6 Pilot",
            displayName: "Cycle 6 Pilot",
            entityType: "character",
            environment: "stillness",
            cycle: 6
          },
          facts: {
            character_address: "0x123",
            metadata_name: "Cycle 6 Pilot",
            source_event_kind: "character.created",
            source_event_id: "event:character-created"
          }
        }
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n"
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).not.toContain("character:stillness:2112077591");
    expect(sql).not.toContain("Cassius");
    expect(sql).toContain("character:stillness:2112099999");
    expect(sql).toContain("Cycle 6 Pilot");
  });

  it("does not import stale placeholder tribes into current-state tables", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "current_entities.jsonl"),
      [
        {
          entity: {
            id: "tribe:stillness:98000422",
            slug: "tribe-98000422-stillness",
            name: "Tribe 98000422",
            displayName: "Tribe 98000422",
            entityType: "tribe",
            environment: "stillness",
            cycle: 6
          },
          facts: {
            tribe_id: "98000422",
            source_event_kind: "character.created"
          }
        },
        {
          entity: {
            id: "tribe:stillness:1000167",
            slug: "tribe-1000167-stillness",
            name: "Clonebank 86",
            displayName: "Clonebank 86",
            entityType: "tribe",
            environment: "stillness",
            cycle: 6
          },
          facts: {
            tribe_id: "1000167",
            tag: "CO86"
          }
        }
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n"
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).not.toContain("tribe:stillness:98000422");
    expect(sql).not.toContain("Tribe 98000422");
    expect(sql).toContain("tribe:stillness:1000167");
    expect(sql).toContain("Clonebank 86");
  });

  it("does not mirror canonical entities into current-state tables", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(
      join(exportDir, "entities.jsonl"),
      `${JSON.stringify({
        id: "tribe:liminality:1000167",
        slug: "tribe-1000167-liminality",
        name: "Tribe 1000167",
        displayName: "Tribe 1000167",
        entityType: "tribe",
        environment: "stillness",
        cycle: 6
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).toContain("INSERT OR REPLACE INTO api_entities");
    expect(sql).not.toContain("INSERT OR REPLACE INTO api_current");
  });

  it("indexes semantic killmail fields from public export rows", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "killmails.jsonl"),
      `${JSON.stringify({
        id: "killmail:stillness:310",
        kind: "killmail",
        environment: "stillness",
        occurredAt: "2026-06-28T10:56:59.000Z",
        sourceIds: ["source:fixture"],
        system: { entityId: "system:stillness:30001001", entityType: "system", displayName: "ILC-7R7", confidence: "verified" },
        victim: { entityId: "character:stillness:victim", entityType: "character", displayName: "Victim Pilot", confidence: "verified" },
        killer: { entityId: "enemy:stillness:type:92096", entityType: "enemy", typeId: "92096", displayName: "Caird [NPC]", isNpc: true, confidence: "probable" },
        reporter: { entityType: "character", displayName: "Unknown", confidence: "unknown" },
        summaryText: "Caird [NPC] killed Victim Pilot"
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).toContain("system:stillness:30001001");
    expect(sql).toContain("character:stillness:victim");
    expect(sql).toContain("92096");
    expect(sql).toContain("Caird [NPC] killed Victim Pilot");
  });

  it("omits removed prototype sources from public indexes", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "sources.jsonl"),
      [
        {
          id: "source:tribe-identities:stillness",
          kind: "community_report",
          environment: "stillness",
          title: "Reviewed public tribe identity example"
        },
        {
          id: "source:datahub:types:stillness",
          kind: "datahub",
          environment: "stillness",
          title: "Public Datahub type metadata"
        },
        {
          id: "source:static-client:types:stillness",
          kind: "static_client_data",
          environment: "stillness",
          title: "Static-client type metadata"
        }
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n"
    );
    writeFileSync(
      join(exportDir, "facts.jsonl"),
      [
        { entityId: "item:stillness:42", key: "type_id", sourceId: "source:datahub:types:stillness", environment: "stillness" },
        { entityId: "item:stillness:type:42", key: "type_id", sourceId: "source:static-client:types:stillness", environment: "stillness" }
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n"
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).not.toContain("Reviewed public tribe identity example");
    expect(sql).not.toContain("Public Datahub type metadata");
    expect(sql).not.toContain("source:tribe-identities:stillness");
    expect(sql).not.toContain("source:datahub:types:stillness");
    expect(sql).toContain("source:static-client:types:stillness");
  });

  it("does not derive removed legacy cycles for older killmail rows", () => {
    const root = mkdtempSync(join(tmpdir(), "blackrelay-api-export-"));
    const exportDir = join(root, "export");
    const chunkDir = join(root, "chunks");
    mkdirSync(exportDir, { recursive: true });

    writeFileSync(join(exportDir, "catalog.json"), JSON.stringify({ schemaVersion: "registry.export.v1" }));
    writeFileSync(join(exportDir, "manifest.json"), JSON.stringify({ schemaVersion: "registry.export_manifest.v1" }));
    writeFileSync(join(exportDir, "entities.jsonl"), "");
    writeFileSync(
      join(exportDir, "killmails.jsonl"),
      `${JSON.stringify({
        id: "killmail:stillness:legacy",
        environment: "stillness",
        occurredAt: "2026-06-24T23:59:59.000Z",
        sourceIds: ["source:fixture"]
      })}\n`
    );

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "export-to-sql.mjs"),
        "--export-dir",
        exportDir,
        "--chunk-dir",
        chunkDir
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"), "utf8");
    expect(sql).toContain("'killmail:stillness:legacy', 'stillness', NULL, '2026-06-24T23:59:59.000Z'");
    expect(sql).not.toContain("'killmail:stillness:legacy', 'stillness', 5");
  });
});
