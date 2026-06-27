import { describe, expect, it } from "vitest";
import { buildCycleWhere, currentCollections, parseCycleScope, parseLimit, typedCollectionEntityTypes } from "../src/query";

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

  it("parses explicit cycle lists without uncycled compatibility rows", () => {
    expect(parseCycleScope("5,6,6", 6)).toEqual({
      mode: "list",
      cycles: [5, 6],
      includeUncycled: false
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
});
