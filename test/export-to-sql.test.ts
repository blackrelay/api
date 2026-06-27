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
    expect(sql).toContain("registry/latest/current_entities.jsonl");
    expect(sql).not.toContain("x".repeat(10_000));
  });
});
