import { describe, expect, it } from "vitest";
import {
  buildCycleWhere,
  currentCollections,
  currentEntityFallbackCollections,
  decodeCursor,
  encodeCursor,
  parseCycleScope,
  parseLimit,
  typedCollectionEntityTypes
} from "../src/query";

describe("query helpers", () => {
  it("defaults missing cycles to the current cycle and uncycled compatibility rows", () => {
    expect(parseCycleScope(null, 6)).toEqual({
      mode: "current",
      cycles: [6],
      includeUncycled: true
    });
    expect(parseCycleScope("current", 6)).toEqual({
      mode: "current",
      cycles: [6],
      includeUncycled: true
    });
  });

  it("accepts only the current cycle from explicit cycle lists", () => {
    expect(parseCycleScope("6,6", 6)).toEqual({
      mode: "list",
      cycles: [6],
      includeUncycled: false
    });
    expect(parseCycleScope("5", 6)).toEqual({
      mode: "current",
      cycles: [6],
      includeUncycled: true,
      invalid: 'Unsupported cycle scope "5". Use current or 6.'
    });
    expect(parseCycleScope("all", 6)).toEqual({
      mode: "current",
      cycles: [6],
      includeUncycled: true,
      invalid: 'Unsupported cycle scope "all". Use current or 6.'
    });
  });

  it("builds a cycle predicate for current cycle compatibility", () => {
    expect(buildCycleWhere(parseCycleScope("current", 6))).toEqual({
      sql: " AND (cycle IN (?) OR cycle IS NULL)",
      params: [6]
    });
  });

  it("bounds public list limits", () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit("500")).toBe(200);
    expect(parseLimit("bad")).toBe(50);
  });

  it("round-trips page cursors with sort key and row id", () => {
    expect(decodeCursor(encodeCursor("Alpha | character:1", "character:1"))).toEqual({
      key: "Alpha | character:1",
      id: "character:1"
    });
  });

  it("accepts legacy plain sort-key cursors", () => {
    expect(decodeCursor(btoa("Alpha | character:1"))).toEqual({
      key: "Alpha | character:1"
    });
  });

  it("registers the public typed and current collection routes", () => {
    expect(typedCollectionEntityTypes.systems).toBe("system");
    expect(typedCollectionEntityTypes.tribes).toBe("tribe");
    expect(typedCollectionEntityTypes.characters).toBe("character");
    expect(typedCollectionEntityTypes.constellations).toBe("constellation");

    for (const collection of [
      "characters",
      "tribes",
      "assemblies",
      "gates",
      "storage",
      "turrets",
      "regions",
      "constellations",
      "items",
      "materials",
      "enemies",
      "recipes",
      "blueprints",
      "ships",
      "structures",
      "systems",
      "routes",
      "ownership",
      "route-edges"
    ]) {
      expect(currentCollections.has(collection)).toBe(true);
    }
  });

  it("does not allow canonical entity fallback for current identities", () => {
    expect(currentEntityFallbackCollections.has("characters")).toBe(false);
    expect(currentEntityFallbackCollections.has("tribes")).toBe(false);
    expect(currentEntityFallbackCollections.has("materials")).toBe(true);
    expect(currentEntityFallbackCollections.has("systems")).toBe(true);
  });
});
