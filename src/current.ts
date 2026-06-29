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
  subjectEntityType?: string;
  subjectDisplayName?: string;
  objectEntityId?: string;
  objectEntityType?: string;
  objectDisplayName?: string;
  predicate?: string;
  sourceId?: string;
  [key: string]: unknown;
};

type RelatedEntity = {
  entityId?: string;
  entityType?: string;
  displayName?: string;
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

export function hasCurrentCycleCharacterEvidence(row: unknown): boolean {
  if (!isCurrentEntityRow(row) || row.entity?.entityType !== "character") {
    return true;
  }
  return Boolean(stringFact(row, "source_event_kind") || stringFact(row, "source_event_id") || stringFact(row, "transaction_digest"));
}

export function dedupeCurrentTribes(rows: unknown[]): unknown[] {
  const out: CurrentEntityRow[] = [];
  const byIdentity = new Map<string, number>();

  for (const row of rows) {
    if (!isCurrentEntityRow(row) || row.entity?.entityType !== "tribe") {
      out.push(row as CurrentEntityRow);
      continue;
    }
    const key = tribeIdentityKey(row);
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
    const winner = preferTribeRow(existing, row);
    const loser = winner === existing ? row : existing;
    out[existingIndex] = mergeCurrentTribeRows(winner, loser);
  }

  return out;
}

export function needsTribeLabelRepair(rows: unknown[]): boolean {
  for (const row of rows) {
    if (!isCurrentEntityRow(row)) {
      continue;
    }
    if (row.entity?.entityType === "tribe" && isPlaceholderTribeDisplay(String(row.entity?.displayName ?? row.entity?.name ?? ""))) {
      return true;
    }
    const derivedTribe = relatedEntity(row, "tribe");
    if (derivedTribe && isPlaceholderTribeDisplay(String(derivedTribe.displayName ?? ""))) {
      return true;
    }
    for (const relation of [...(row.outgoingRelations ?? []), ...(row.incomingRelations ?? [])]) {
      if (relationIsTribe(relation, "subject") && isPlaceholderTribeDisplay(String(relation.subjectDisplayName ?? ""))) {
        return true;
      }
      if (relationIsTribe(relation, "object") && isPlaceholderTribeDisplay(String(relation.objectDisplayName ?? ""))) {
        return true;
      }
    }
  }
  return false;
}

export function repairCurrentTribeLabels(rows: unknown[], tribeRows: unknown[]): unknown[] {
  const displays = tribeDisplayIndex(tribeRows);
  if (displays.size === 0) {
    return rows;
  }

  for (const row of rows) {
    if (!isCurrentEntityRow(row)) {
      continue;
    }
    const environment = String(row.entity?.environment ?? "").trim().toLowerCase();

    if (row.entity?.entityType === "tribe") {
      const display = resolveTribeDisplay(displays, String(row.entity.id ?? ""), String(row.entity.displayName ?? row.entity.name ?? ""), environment);
      if (display) {
        row.entity.displayName = display;
        row.entity.name = display;
      }
    }

    const derivedTribe = relatedEntity(row, "tribe");
    if (derivedTribe) {
      const display = resolveTribeDisplay(displays, String(derivedTribe.entityId ?? ""), String(derivedTribe.displayName ?? ""), environment);
      if (display) {
        derivedTribe.displayName = display;
      }
    }

    for (const relation of [...(row.outgoingRelations ?? []), ...(row.incomingRelations ?? [])]) {
      if (relationIsTribe(relation, "subject")) {
        const display = resolveTribeDisplay(
          displays,
          String(relation.subjectEntityId ?? ""),
          String(relation.subjectDisplayName ?? ""),
          environment
        );
        if (display) {
          relation.subjectDisplayName = display;
        }
      }
      if (relationIsTribe(relation, "object")) {
        const display = resolveTribeDisplay(
          displays,
          String(relation.objectEntityId ?? ""),
          String(relation.objectDisplayName ?? ""),
          environment
        );
        if (display) {
          relation.objectDisplayName = display;
        }
      }
    }
  }

  return rows;
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

function tribeIdentityKey(row: CurrentEntityRow): string {
  const tribeID = String(row.facts?.tribe_id ?? tokenFromEntityID(row.entity?.id ?? "")).trim();
  const environment = String(row.entity?.environment || "").trim().toLowerCase();
  if (!tribeID || !environment) {
    return "";
  }
  return `${environment}:${tribeID}`;
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

function preferTribeRow(left: CurrentEntityRow, right: CurrentEntityRow): CurrentEntityRow {
  const leftScore = tribeRowScore(left);
  const rightScore = tribeRowScore(right);
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

function tribeRowScore(row: CurrentEntityRow): number {
  let score = 0;
  const name = String(row.entity?.displayName || row.entity?.name || "").trim();
  const tribeID = String(row.facts?.tribe_id ?? tokenFromEntityID(row.entity?.id ?? "")).trim();
  if (name && !isPlaceholderTribeDisplay(name, tribeID)) {
    score += 1000;
  }
  for (const key of ["tag", "ticker", "description", "url", "aliases"]) {
    const value = row.facts?.[key];
    if (value !== undefined && String(value).trim() !== "") {
      score += 25;
    }
  }
  const idScope = String(row.entity?.id || "").split(":")[1] ?? "";
  if (String(row.entity?.environment || "") === idScope) {
    score += 10;
  }
  const cycle = Number(row.entity?.cycle ?? 0);
  if (Number.isFinite(cycle)) {
    score += cycle;
  }
  return score;
}

function tribeDisplayIndex(rows: unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    if (!isCurrentEntityRow(row) || row.entity?.entityType !== "tribe") {
      continue;
    }
    const id = String(row.entity.id ?? "").trim();
    const environment = String(row.entity.environment ?? "").trim().toLowerCase();
    const tribeID = String(row.facts?.tribe_id ?? tokenFromEntityID(id)).trim();
    const display = String(row.entity.displayName ?? row.entity.name ?? "").trim();
    if (!display || isPlaceholderTribeDisplay(display, tribeID)) {
      continue;
    }
    if (id) {
      out.set(id.toLowerCase(), display);
    }
    if (environment && tribeID) {
      out.set(`${environment}:${tribeID}`, display);
    }
    if (tribeID) {
      out.set(tribeID, display);
    }
  }
  return out;
}

function resolveTribeDisplay(displays: Map<string, string>, entityID: string, currentDisplay: string, fallbackEnvironment: string): string {
  const trimmedID = entityID.trim();
  const display = currentDisplay.trim();
  if (display && !isPlaceholderTribeDisplay(display)) {
    return display;
  }
  const exact = displays.get(trimmedID.toLowerCase());
  if (exact) {
    return exact;
  }
  const token = tokenFromEntityID(trimmedID);
  const environment = entityEnvironment(trimmedID) || fallbackEnvironment;
  if (environment && token) {
    const scoped = displays.get(`${environment.toLowerCase()}:${token}`);
    if (scoped) {
      return scoped;
    }
  }
  if (fallbackEnvironment && token) {
    const scoped = displays.get(`${fallbackEnvironment.toLowerCase()}:${token}`);
    if (scoped) {
      return scoped;
    }
  }
  if (token) {
    return displays.get(token) ?? "";
  }
  return "";
}

function relatedEntity(row: CurrentEntityRow, key: string): RelatedEntity | undefined {
  const derived = row.derived;
  if (!derived || typeof derived !== "object" || Array.isArray(derived)) {
    return undefined;
  }
  const value = (derived as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RelatedEntity) : undefined;
}

function relationIsTribe(relation: CurrentRelation, side: "subject" | "object"): boolean {
  const entityID = side === "subject" ? relation.subjectEntityId : relation.objectEntityId;
  const entityType = side === "subject" ? relation.subjectEntityType : relation.objectEntityType;
  return entityType === "tribe" || String(entityID ?? "").startsWith("tribe:");
}

function isPlaceholderTribeDisplay(value: string, tribeID = "\\d+"): boolean {
  const text = String(value ?? "").trim();
  if (!text) {
    return true;
  }
  const pattern = tribeID === "\\d+" ? /^Tribe \d+$/i : new RegExp(`^Tribe ${escapeRegExp(tribeID)}$`, "i");
  return pattern.test(text);
}

function entityEnvironment(id: string): string {
  const parts = id.trim().split(":");
  return parts.length >= 3 ? parts[1] ?? "" : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function mergeCurrentTribeRows(winner: CurrentEntityRow, loser: CurrentEntityRow): CurrentEntityRow {
  return {
    ...winner,
    facts: mergeFacts(winner.facts, loser.facts),
    sourceIds: mergeStrings(winner.sourceIds, loser.sourceIds),
    outgoingRelations: mergeRelations(winner.outgoingRelations, loser.outgoingRelations, (relation) => relation.subjectEntityId === winner.entity?.id),
    incomingRelations: mergeRelations(winner.incomingRelations, loser.incomingRelations, (relation) => {
      if (relation.objectEntityId === winner.entity?.id) {
        return true;
      }
      if (relation.objectEntityType !== "tribe") {
        return false;
      }
      return tokenFromEntityID(relation.objectEntityId ?? "") === tokenFromEntityID(winner.entity?.id ?? "");
    })
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

function tokenFromEntityID(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const index = trimmed.lastIndexOf(":");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
