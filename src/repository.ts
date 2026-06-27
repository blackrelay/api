import {
  buildCycleWhere,
  decodeCursor,
  encodeCursor,
  likeNeedle,
  parseJSONRows,
  type CurrentRow,
  type EntityRow,
  type EventRow,
  type FactRow,
  type KillmailRow,
  type ListOptions,
  type ArtefactRow,
  type RelationRow,
  type SourceGapRow,
  type SourceRow
} from "./query";

export type PageResult = {
  data: unknown[];
  nextCursor?: string | undefined;
};

type D1ListResult<T> = {
  results: T[];
};

export class ApiRepository {
  constructor(private readonly db: D1Database) {}

  async ping(): Promise<void> {
    await this.db.prepare("SELECT 1").first();
  }

  async document(path: string): Promise<unknown | undefined> {
    const row = await this.db
      .prepare("SELECT body_json FROM api_documents WHERE path = ?")
      .bind(path)
      .first<{ body_json: string }>();
    if (!row) {
      return undefined;
    }
    return JSON.parse(row.body_json) as unknown;
  }

  async listEntities(options: ListOptions & { entityType?: string | undefined }): Promise<PageResult> {
    const cycle = buildCycleWhere(options.cycles);
    const cursor = decodeCursor(options.cursor);
    const params: unknown[] = [options.environment, ...cycle.params];
    let sql = `SELECT id, slug, name, entity_type, environment, cycle, body_json, sort_key
      FROM api_entities
      WHERE environment = ?${cycle.sql}`;
    if (options.entityType) {
      sql += " AND entity_type = ?";
      params.push(options.entityType);
    }
    const needle = likeNeedle(options.q);
    if (needle) {
      sql += " AND search_text LIKE ?";
      params.push(needle);
    }
    if (cursor) {
      sql += " AND (sort_key > ? OR (sort_key = ? AND id > ?))";
      params.push(cursor, cursor, cursor);
    }
    sql += " ORDER BY sort_key ASC, id ASC LIMIT ?";
    params.push(options.limit + 1);
    const result = await this.db.prepare(sql).bind(...params).all<EntityRow>();
    return pageFromRows(result, options.limit, (row) => row.sort_key, parseJSONRows);
  }

  async getEntity(idOrSlug: string, entityType?: string): Promise<unknown | undefined> {
    let sql = "SELECT body_json FROM api_entities WHERE (id = ? OR slug = ?)";
    const params: unknown[] = [idOrSlug, idOrSlug];
    if (entityType) {
      sql += " AND entity_type = ?";
      params.push(entityType);
    }
    const row = await this.db
      .prepare(sql)
      .bind(...params)
      .first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async listEntityFacts(idOrSlug: string): Promise<PageResult | undefined> {
    const entity = await this.getEntityRecord(idOrSlug);
    if (!entity) {
      return undefined;
    }
    const result = await this.db
      .prepare("SELECT entity_id, body_json FROM api_facts WHERE entity_id = ? ORDER BY sort_key ASC")
      .bind(entity.id)
      .all<FactRow>();
    return { data: parseJSONRows(result.results) };
  }

  async listEntityRelations(idOrSlug: string): Promise<PageResult | undefined> {
    const entity = await this.getEntityRecord(idOrSlug);
    if (!entity) {
      return undefined;
    }
    const result = await this.db
      .prepare(
        `SELECT id, body_json FROM api_relations
         WHERE subject_entity_id = ? OR object_entity_id = ?
         ORDER BY sort_key ASC`
      )
      .bind(entity.id, entity.id)
      .all<RelationRow>();
    return { data: parseJSONRows(result.results) };
  }

  async listEntitySources(idOrSlug: string): Promise<PageResult | undefined> {
    const entity = await this.getEntityRecord(idOrSlug);
    if (!entity) {
      return undefined;
    }
    const result = await this.db
      .prepare("SELECT source_id AS id, body_json FROM api_entity_sources WHERE entity_id = ? ORDER BY sort_key ASC")
      .bind(entity.id)
      .all<SourceRow>();
    return { data: parseJSONRows(result.results) };
  }

  async getEntityHistory(idOrSlug: string): Promise<unknown | undefined> {
    const entity = await this.getEntityRecord(idOrSlug);
    if (!entity) {
      return undefined;
    }
    const [facts, relations, sources] = await Promise.all([
      this.listEntityFacts(entity.id),
      this.listEntityRelations(entity.id),
      this.listEntitySources(entity.id)
    ]);
    return {
      entity: JSON.parse(entity.body_json) as unknown,
      facts: facts?.data ?? [],
      relations: relations?.data ?? [],
      sources: sources?.data ?? []
    };
  }

  async getStaticType(typeID: string): Promise<unknown | undefined> {
    const row = await this.db
      .prepare("SELECT body_json FROM api_entities WHERE id LIKE ? ORDER BY id ASC LIMIT 1")
      .bind(`%:type:${typeID}`)
      .first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async listCurrent(collection: string, options: ListOptions): Promise<PageResult> {
    const cycle = buildCycleWhere(options.cycles);
    const cursor = decodeCursor(options.cursor);
    const params: unknown[] = [collection, options.environment, ...cycle.params];
    let sql = `SELECT id, body_json, sort_key
      FROM api_current
      WHERE collection = ? AND environment = ?${cycle.sql}`;
    const needle = likeNeedle(options.q);
    if (needle) {
      sql += " AND search_text LIKE ?";
      params.push(needle);
    }
    if (cursor) {
      sql += " AND (sort_key > ? OR (sort_key = ? AND id > ?))";
      params.push(cursor, cursor, cursor);
    }
    sql += " ORDER BY sort_key ASC, id ASC LIMIT ?";
    params.push(options.limit + 1);
    const result = await this.db.prepare(sql).bind(...params).all<CurrentRow>();
    return pageFromRows(result, options.limit, (row) => row.sort_key, parseJSONRows);
  }

  async listSources(environment: string, limit: number): Promise<PageResult> {
    const result = await this.db
      .prepare("SELECT id, body_json FROM api_sources WHERE environment = ? OR environment IS NULL ORDER BY sort_key ASC, id ASC LIMIT ?")
      .bind(environment, limit)
      .all<SourceRow>();
    return { data: parseJSONRows(result.results) };
  }

  async getSource(id: string): Promise<unknown | undefined> {
    const row = await this.db.prepare("SELECT body_json FROM api_sources WHERE id = ?").bind(id).first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async getArtefact(id: string): Promise<unknown | undefined> {
    const row = await this.db.prepare("SELECT body_json FROM api_artefacts WHERE id = ?").bind(id).first<ArtefactRow>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async listEvents(
    options: ListOptions & {
      kind?: string | undefined;
      module?: string | undefined;
      packageId?: string | undefined;
      transactionDigest?: string | undefined;
      sourceId?: string | undefined;
    }
  ): Promise<PageResult> {
    const cycle = buildCycleWhere(options.cycles);
    const cursor = decodeCursor(options.cursor);
    const params: unknown[] = [options.environment, ...cycle.params];
    let sql = `SELECT id, body_json, occurred_at FROM api_events WHERE environment = ?${cycle.sql}`;
    for (const [column, value] of [
      ["kind", options.kind],
      ["module", options.module],
      ["package_id", options.packageId],
      ["transaction_digest", options.transactionDigest],
      ["source_id", options.sourceId]
    ] as const) {
      if (value) {
        sql += ` AND ${column} = ?`;
        params.push(value);
      }
    }
    if (cursor) {
      sql += " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))";
      params.push(cursor, cursor, cursor);
    }
    sql += " ORDER BY occurred_at DESC, id DESC LIMIT ?";
    params.push(options.limit + 1);
    const result = await this.db.prepare(sql).bind(...params).all<EventRow>();
    return pageFromRows(result, options.limit, (row) => row.occurred_at, parseJSONRows);
  }

  async getEvent(id: string): Promise<unknown | undefined> {
    const row = await this.db.prepare("SELECT body_json FROM api_events WHERE id = ?").bind(id).first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async listKillmails(
    options: ListOptions & {
      system?: string | undefined;
      victim?: string | undefined;
      killer?: string | undefined;
      reporter?: string | undefined;
      npc?: string | undefined;
    }
  ): Promise<PageResult> {
    const cycle = buildCycleWhere(options.cycles);
    const cursor = decodeCursor(options.cursor);
    const params: unknown[] = [options.environment, ...cycle.params];
    let sql = `SELECT id, body_json, occurred_at FROM api_killmails WHERE environment = ?${cycle.sql}`;
    for (const [column, value] of [
      ["system_id", options.system],
      ["victim_character_id", options.victim],
      ["reporter_character_id", options.reporter]
    ] as const) {
      if (value) {
        sql += ` AND ${column} = ?`;
        params.push(value);
      }
    }
    if (options.killer) {
      sql += " AND (killer_character_id = ? OR killer_type_id = ?)";
      params.push(options.killer, options.killer);
    }
    if (options.npc === "true" || options.npc === "false") {
      sql += " AND npc = ?";
      params.push(options.npc === "true" ? 1 : 0);
    }
    if (cursor) {
      sql += " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))";
      params.push(cursor, cursor, cursor);
    }
    sql += " ORDER BY occurred_at DESC, id DESC LIMIT ?";
    params.push(options.limit + 1);
    const result = await this.db.prepare(sql).bind(...params).all<KillmailRow>();
    return pageFromRows(result, options.limit, (row) => row.occurred_at, parseJSONRows);
  }

  async getKillmail(id: string): Promise<unknown | undefined> {
    const row = await this.db.prepare("SELECT body_json FROM api_killmails WHERE id = ?").bind(id).first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  async listSourceGaps(environment: string): Promise<PageResult> {
    const result = await this.db
      .prepare("SELECT id, body_json FROM api_source_gaps WHERE environment = ? OR environment IS NULL ORDER BY severity DESC, kind ASC")
      .bind(environment)
      .all<SourceGapRow>();
    return { data: parseJSONRows(result.results) };
  }

  async metrics(): Promise<string> {
    const counts = await this.db
      .prepare(
        `SELECT
          (SELECT count(*) FROM api_entities) AS entities,
          (SELECT count(*) FROM api_sources) AS sources,
          (SELECT count(*) FROM api_events) AS events,
          (SELECT count(*) FROM api_killmails) AS killmails,
          (SELECT count(*) FROM api_facts) AS facts,
          (SELECT count(*) FROM api_relations) AS relations,
          (SELECT count(*) FROM api_artefacts) AS artefacts,
          (SELECT count(*) FROM api_source_gaps) AS source_gaps`
      )
      .first<Record<string, number>>();
    const lines = [
      "# HELP blackrelay_api_build_info Static public API build marker.",
      "# TYPE blackrelay_api_build_info gauge",
      "blackrelay_api_build_info 1"
    ];
    for (const [name, value] of Object.entries(counts ?? {})) {
      lines.push(`# TYPE blackrelay_api_${name} gauge`);
      lines.push(`blackrelay_api_${name} ${Number(value) || 0}`);
    }
    return `${lines.join("\n")}\n`;
  }

  private async getEntityRecord(idOrSlug: string): Promise<EntityRow | undefined> {
    const row = await this.db
      .prepare("SELECT id, slug, name, entity_type, environment, cycle, body_json, sort_key FROM api_entities WHERE id = ? OR slug = ?")
      .bind(idOrSlug, idOrSlug)
      .first<EntityRow>();
    return row ?? undefined;
  }
}

function pageFromRows<T extends { id: string }>(
  result: D1ListResult<T>,
  limit: number,
  cursorValue: (row: T) => string,
  parse: (rows: T[]) => unknown[]
): PageResult {
  const rows = result.results.slice(0, limit);
  const extra = result.results.length > limit ? result.results[limit] : undefined;
  return {
    data: parse(rows),
    nextCursor: extra ? encodeCursor(cursorValue(extra)) : undefined
  };
}
