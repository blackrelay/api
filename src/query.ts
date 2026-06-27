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
  limit: number;
  cursor?: string | undefined;
};

export type CycleScope = {
  mode: "current" | "all" | "list";
  cycles: number[];
  includeUncycled: boolean;
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
  if (!value || value === "current") {
    return { mode: "current", cycles: [currentCycle], includeUncycled: true };
  }
  if (value === "all") {
    return { mode: "all", cycles: [], includeUncycled: true };
  }
  const cycles = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isInteger(part) && part > 0);
  if (cycles.length === 0) {
    return { mode: "current", cycles: [currentCycle], includeUncycled: true };
  }
  return { mode: "list", cycles: [...new Set(cycles)], includeUncycled: false };
}

export function decodeCursor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

export function encodeCursor(value: string): string {
  return btoa(value);
}

export function parseJSONRows<T extends { body_json: string }>(rows: T[]): unknown[] {
  return rows.map((row) => JSON.parse(row.body_json) as unknown);
}

export function buildCycleWhere(scope: CycleScope, columnName = "cycle"): { sql: string; params: unknown[] } {
  if (scope.mode === "all") {
    return { sql: "", params: [] };
  }
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
