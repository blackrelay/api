type CurrentEntityRow = {
  entity?: {
    id?: string;
    entityType?: string;
    displayName?: string;
    name?: string;
    environment?: string;
    cycle?: number | null;
    updatedAt?: string;
  };
  facts?: Record<string, unknown>;
  outgoingRelations?: CurrentRelation[];
  incomingRelations?: CurrentRelation[];
  sourceIds?: string[];
  [key: string]: unknown;
};

type CurrentRelation = {
  id?: string;
  subjectEntityId?: string;
  objectEntityId?: string;
  predicate?: string;
  sourceId?: string;
  [key: string]: unknown;
};

export function dedupeCurrentCharacters(rows: unknown[]): unknown[] {
  const out: CurrentEntityRow[] = [];
  const byIdentity = new Map<string, number>();

  for (const row of rows) {
    if (!isCurrentEntityRow(row) || row.entity?.entityType !== "character") {
      out.push(row as CurrentEntityRow);
      continue;
    }
    const key = characterIdentityKey(row);
    if (!key) {
      out.push(row);
      continue;
    }
    const existingIndex = byIdentity.get(key);
    if (existingIndex === undefined) {
      byIdentity.set(key, out.length);
      out.push(row);
      continue;
    }
    const existing = out[existingIndex];
    if (!existing) {
      byIdentity.set(key, out.length);
      out.push(row);
      continue;
    }
    const winner = preferCharacterRow(existing, row);
    const loser = winner === existing ? row : existing;
    out[existingIndex] = mergeCurrentCharacterRows(winner, loser);
  }

  return out;
}

function isCurrentEntityRow(value: unknown): value is CurrentEntityRow {
  return typeof value === "object" && value !== null && typeof (value as CurrentEntityRow).entity === "object";
}

function characterIdentityKey(row: CurrentEntityRow): string {
  const address = stringFact(row, "character_address").toLowerCase();
  const name = String(row.entity?.displayName || row.entity?.name || "").trim().toLowerCase();
  const environment = String(row.entity?.environment || "").trim().toLowerCase();
  if (!address || !name) {
    return "";
  }
  return `${environment}:${address}:${name}`;
}

function preferCharacterRow(left: CurrentEntityRow, right: CurrentEntityRow): CurrentEntityRow {
  const leftScore = characterRowScore(left);
  const rightScore = characterRowScore(right);
  if (rightScore !== leftScore) {
    return rightScore > leftScore ? right : left;
  }
  const leftUpdated = Date.parse(String(left.entity?.updatedAt || ""));
  const rightUpdated = Date.parse(String(right.entity?.updatedAt || ""));
  if (Number.isFinite(leftUpdated) || Number.isFinite(rightUpdated)) {
    return (Number.isFinite(rightUpdated) ? rightUpdated : 0) > (Number.isFinite(leftUpdated) ? leftUpdated : 0) ? right : left;
  }
  return String(right.entity?.id || "") > String(left.entity?.id || "") ? right : left;
}

function characterRowScore(row: CurrentEntityRow): number {
  let score = 0;
  if (stringFact(row, "source_event_kind") || stringFact(row, "source_event_id") || stringFact(row, "transaction_digest")) {
    score += 1000;
  }
  const cycle = Number(row.entity?.cycle ?? 0);
  if (Number.isFinite(cycle)) {
    score += cycle * 10;
  }
  if (stringFact(row, "metadata_name")) {
    score += 3;
  }
  if (stringFact(row, "object_id")) {
    score += 1;
  }
  return score;
}

function mergeCurrentCharacterRows(winner: CurrentEntityRow, loser: CurrentEntityRow): CurrentEntityRow {
  return {
    ...winner,
    facts: mergeFacts(winner.facts, loser.facts),
    sourceIds: mergeStrings(winner.sourceIds, loser.sourceIds),
    outgoingRelations: mergeRelations(winner.outgoingRelations, loser.outgoingRelations, (relation) => relation.subjectEntityId === winner.entity?.id),
    incomingRelations: mergeRelations(winner.incomingRelations, loser.incomingRelations, (relation) => relation.objectEntityId === winner.entity?.id)
  };
}

function mergeFacts(primary: Record<string, unknown> | undefined, secondary: Record<string, unknown> | undefined): Record<string, unknown> {
  const merged = { ...(primary ?? {}) };
  for (const [key, value] of Object.entries(secondary ?? {})) {
    if (!(key in merged) || String(merged[key] ?? "").trim() === "") {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeStrings(primary: string[] | undefined, secondary: string[] | undefined): string[] {
  return [...new Set([...(primary ?? []), ...(secondary ?? [])].map((value) => value.trim()).filter(Boolean))].sort();
}

function mergeRelations(
  primary: CurrentRelation[] | undefined,
  secondary: CurrentRelation[] | undefined,
  keep: (relation: CurrentRelation) => boolean
): CurrentRelation[] {
  const seen = new Set<string>();
  const out: CurrentRelation[] = [];
  for (const relation of [...(primary ?? []), ...(secondary ?? [])]) {
    if (!keep(relation)) {
      continue;
    }
    const key = relation.id || `${relation.subjectEntityId}:${relation.predicate}:${relation.objectEntityId}:${relation.sourceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(relation);
  }
  return out;
}

function stringFact(row: CurrentEntityRow, key: string): string {
  const value = row.facts?.[key];
  return typeof value === "string" ? value.trim() : "";
}
