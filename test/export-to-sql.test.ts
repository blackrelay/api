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
        chunkDir,
        "--no-transactions"
      ],
      { cwd: process.cwd(), stdio: "pipe" }
    );

    const sql = readFileSync(join(chunkDir, "0000.sql"));
    expect(sql.includes(0)).toBe(false);
    expect(sql.toString("utf8")).toContain("Alpha | character:stillness:1");
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
});
