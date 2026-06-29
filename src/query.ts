export type EntityRow = {
  id: string;
  slug: string;
  name: string;
  entity_type: string;
  environment: string;
  cycle: number | null;
  body_json: string;
  sort_key: string;
};

export type SourceRow = {
  id: string;
  body_json: string;
};

export type EventRow = {
  id: string;
  body_json: string;
  occurred_at: string;
};

export type KillmailRow = {
  id: string;
  body_json: string;
  occurred_at: string;
};

export type CurrentRow = {
  id: string;
  body_json: string;
  sort_key: string;
};

export type FactRow = {
  entity_id: string;
  body_json: string;
};

export type RelationRow = {
  id: string;
  body_json: string;
};

export type ArtefactRow = {
  id: string;
  body_json: string;
};

export type SourceGapRow = {
  id: string;
  body_json: string;
};

export type ListOptions = {
  environment: string;
  cycles: CycleScope;
  q?: string | undefined;
  profile?: string | undefined;
  limit: number;
  cursor?: string | undefined;
};

export type CycleScope = {
  mode: "current" | "list";
  cycles: number[];
  includeUncycled: boolean;
  invalid?: string | undefined;
};

export const typedCollectionEntityTypes: Record<string, string> = {
  characters: "character",
  tribes: "tribe",
  systems: "system",
  assemblies: "assembly",
  gates: "gate",
  regions: "region",
  constellations: "constellation",
  items: "item",
  materials: "material",
  enemies: "enemy",
  recipes: "recipe",
  blueprints: "blueprint",
  ships: "ship",
  structures: "structure"
};

export const currentCollections = new Set([
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
]);

export const currentCollectionEntityTypes: Record<string, string> = {
  characters: "character",
  tribes: "tribe",
  assemblies: "assembly",
  gates: "gate",
  storage: "storage",
  turrets: "turret",
  regions: "region",
  constellations: "constellation",
  items: "item",
  materials: "material",
  enemies: "enemy",
  recipes: "recipe",
  blueprints: "blueprint",
  ships: "ship",
  structures: "structure",
  systems: "system",
  routes: "route"
};

export const currentEntityFallbackCollections = new Set([
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
  "routes"
]);

export function parseLimit(value: string | null, defaultLimit = 50, maxLimit = 200): number {
  if (!value) {
    return defaultLimit;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }
  return Math.min(parsed, maxLimit);
}

export function parseCycleScope(value: string | null, currentCycle: number): CycleScope {
  const raw = value?.trim() ?? "";
  if (!raw || raw.toLowerCase() === "current") {
    return { mode: "current", cycles: [currentCycle], includeUncycled: true };
  }

  const parts = raw.split(",").map((part) => part.trim());
  const cycles: number[] = [];
  for (const part of parts) {
    const parsed = Number.parseInt(part, 10);
    if (!part || !Number.isInteger(parsed) || parsed !== currentCycle || String(parsed) !== part) {
      return {
        mode: "current",
        cycles: [currentCycle],
        includeUncycled: true,
        invalid: `Unsupported cycle scope "${raw}". Use current or ${currentCycle}.`
      };
    }
    cycles.push(parsed);
  }
  return { mode: "list", cycles: [...new Set(cycles)], includeUncycled: false };
}

export type DecodedCursor = {
  key: string;
  id?: string | undefined;
};

export function decodeCursor(value: string | undefined): DecodedCursor | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
    try {
      const parsed = JSON.parse(decoded) as Partial<DecodedCursor>;
      if (typeof parsed.key === "string" && parsed.key) {
        return {
          key: parsed.key,
          id: typeof parsed.id === "string" && parsed.id ? parsed.id : undefined
        };
      }
    } catch {
      // Older API cursors encoded only the sort key as plain text.
    }
    return decoded ? { key: decoded } : undefined;
  } catch {
    return undefined;
  }
}

export function encodeCursor(key: string, id?: string): string {
  return btoa(JSON.stringify({ key, ...(id ? { id } : {}) }));
}

export function parseJSONRows<T extends { body_json: string }>(rows: T[]): unknown[] {
  return rows.map((row) => JSON.parse(row.body_json) as unknown);
}

export function buildCycleWhere(scope: CycleScope, columnName = "cycle"): { sql: string; params: unknown[] } {
  const placeholders = scope.cycles.map(() => "?").join(", ");
  if (scope.includeUncycled) {
    return {
      sql: ` AND (${columnName} IN (${placeholders}) OR ${columnName} IS NULL)`,
      params: scope.cycles
    };
  }
  return {
    sql: ` AND ${columnName} IN (${placeholders})`,
    params: scope.cycles
  };
}

export function likeNeedle(q: string | undefined): string | undefined {
  const trimmed = q?.trim();
  if (!trimmed) {
    return undefined;
  }
  return `%${trimmed.toLowerCase()}%`;
}
