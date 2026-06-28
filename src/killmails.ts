type UnknownRecord = Record<string, unknown>;

export type KillmailEntityLookup = {
  id: string;
  entityType: string;
  displayName: string;
};

export function collectKillmailEntityIDs(records: unknown[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    const killmail = asRecord(record);
    if (!killmail) {
      continue;
    }

    addEntityID(ids, firstString(killmail.systemId), asRecord(killmail.system));
    addEntityID(ids, firstString(killmail.victimCharacterId), asRecord(killmail.victim));
    addEntityID(ids, firstString(killmail.reporterCharacterId), asRecord(killmail.reporter));

    const killerTypeID = firstString(killmail.killerTypeId);
    if (killerTypeID) {
      const environment = firstString(killmail.environment) || "stillness";
      addEntityID(ids, `enemy:${environment}:type:${killerTypeID}`, asRecord(killmail.killer));
    } else {
      addEntityID(ids, firstString(killmail.killerCharacterId), asRecord(killmail.killer));
    }
  }
  return [...ids].sort();
}

export function enrichKillmailRecords(records: unknown[], entities: Map<string, KillmailEntityLookup>): unknown[] {
  return records.map((record) => enrichKillmailRecord(record, entities));
}

function enrichKillmailRecord(record: unknown, entities: Map<string, KillmailEntityLookup>): unknown {
  const killmail = asRecord(record);
  if (!killmail) {
    return record;
  }

  const out: UnknownRecord = { ...killmail };
  const environment = firstString(out.environment) || "stillness";
  const systemID = firstString(out.systemId);
  const victimID = firstString(out.victimCharacterId);
  const reporterID = firstString(out.reporterCharacterId);
  const killerTypeID = firstString(out.killerTypeId);
  const killerID = killerTypeID ? `enemy:${environment}:type:${killerTypeID}` : firstString(out.killerCharacterId);

  enrichResolvedValue(out, "system", "systemName", systemID, entities.get(systemID));
  enrichResolvedValue(out, "victim", "victimName", victimID, entities.get(victimID));
  enrichResolvedValue(out, "killer", "killerName", killerID, entities.get(killerID), killerTypeID);
  enrichResolvedValue(out, "reporter", "reporterName", reporterID, entities.get(reporterID));

  return out;
}

function enrichResolvedValue(
  target: UnknownRecord,
  key: string,
  nameKey: string,
  rawID: string,
  entity: KillmailEntityLookup | undefined,
  typeID = ""
): void {
  if (!rawID && !entity) {
    return;
  }

  const existing = asRecord(target[key]) ?? {};
  const displayName = firstString(entity?.displayName, existing.displayName, existing.name, target[nameKey], rawID);
  if (!target[nameKey] && displayName && displayName !== rawID) {
    target[nameKey] = displayName;
  }

  target[key] = {
    ...existing,
    entityId: firstString(existing.entityId, entity?.id, rawID),
    rawId: firstString(existing.rawId, rawID, entity?.id),
    entityType: firstString(existing.entityType, entity?.entityType, typeID ? "enemy" : ""),
    displayName,
    ...(typeID ? { typeId: firstString(existing.typeId, typeID) } : {}),
    ...(typeID ? { isNpc: existing.isNpc ?? true } : {}),
    confidence: firstString(existing.confidence, entity ? "verified" : "unknown")
  };
}

function addEntityID(ids: Set<string>, rawID: string, resolved: UnknownRecord | undefined): void {
  const id = firstString(resolved?.entityId, rawID);
  if (id) {
    ids.add(id);
  }
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}
