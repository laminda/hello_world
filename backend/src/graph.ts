import { all, db, get, logAction, nowIso, run } from "./db.js";
import { nameSimilarity } from "./nlp.js";
import { independentSourceCount } from "./independence.js";
import type { FactStatus } from "./types.js";

export function upsertEntity(
  investigationId: string,
  kind: string,
  name: string,
  confidence: number,
  status: FactStatus = "HYPOTHESIS",
  meta: Record<string, unknown> = {}
): string {
  const existing = get<{ id: string; confidence: number }>(
    `SELECT id, confidence FROM entities WHERE investigation_id = ? AND kind = ? AND lower(canonical_name) = lower(?)`,
    investigationId,
    kind,
    name
  );
  if (existing) {
    if (confidence > existing.confidence) {
      run(`UPDATE entities SET confidence = ?, status = ? WHERE id = ?`, confidence, status, existing.id);
    }
    return existing.id;
  }
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM entities`)!.c;
  const id = `ENT-${String(count + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO entities (id, investigation_id, kind, canonical_name, confidence, status, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    investigationId,
    kind,
    name,
    confidence,
    status,
    JSON.stringify(meta)
  );
  return id;
}

export function addAlias(entityId: string, alias: string, confidence: number, evidence: string) {
  const exists = get(
    `SELECT id FROM entity_aliases WHERE entity_id = ? AND lower(alias) = lower(?)`,
    entityId,
    alias
  );
  if (exists) return;
  run(
    `INSERT INTO entity_aliases (entity_id, alias, confidence, evidence) VALUES (?, ?, ?, ?)`,
    entityId,
    alias,
    confidence,
    evidence
  );
}

export function addFact(opts: {
  investigationId: string;
  subject?: string;
  predicate: string;
  object?: string;
  value: string;
  status?: FactStatus;
  confidence?: number;
  extract?: string;
  page?: number;
  sourceId?: string;
  documentId?: string;
  validFrom?: string;
  validTo?: string;
  documentDate?: string;
}): string {
  const existing = get<{ id: string; confidence: number; status: string }>(
    `SELECT id, confidence, status FROM facts
     WHERE investigation_id = ? AND predicate = ? AND value = ?`,
    opts.investigationId,
    opts.predicate,
    opts.value
  );
  if (existing) {
    if (opts.sourceId) {
      const linked = get(
        `SELECT id FROM fact_sources WHERE fact_id = ? AND source_id = ?`,
        existing.id,
        opts.sourceId
      );
      if (!linked) {
        run(
          `INSERT INTO fact_sources (fact_id, source_id, document_id, extract, page) VALUES (?, ?, ?, ?, ?)`,
          existing.id,
          opts.sourceId,
          opts.documentId ?? null,
          opts.extract ?? null,
          opts.page ?? null
        );
        const n = independentSourceCount(existing.id);
        let status = existing.status;
        let conf = Math.min(0.99, existing.confidence + (n > 1 ? 0.08 : 0.02));
        // Copies of the same text must not mint CONFIRMED.
        if (n >= 3) status = "CONFIRMED";
        else if (n >= 2) status = "SUPPORTED";
        run(
          `UPDATE facts SET confidence = ?, status = ?, independence_score = ? WHERE id = ?`,
          conf,
          status,
          n,
          existing.id
        );
      }
    }
    return existing.id;
  }
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM facts`)!.c;
  const id = `FACT-${String(count + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO facts (
      id, investigation_id, subject_entity_id, predicate, object_entity_id, value,
      valid_from, valid_to, document_date, publication_date, created_at, status, confidence, extract, page
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.investigationId,
    opts.subject ?? null,
    opts.predicate,
    opts.object ?? null,
    opts.value,
    opts.validFrom ?? null,
    opts.validTo ?? null,
    opts.documentDate ?? null,
    null,
    nowIso(),
    opts.status ?? "OBSERVED",
    opts.confidence ?? 0.55,
    opts.extract ?? null,
    opts.page ?? null
  );
  if (opts.sourceId) {
    run(
      `INSERT INTO fact_sources (fact_id, source_id, document_id, extract, page) VALUES (?, ?, ?, ?, ?)`,
      id,
      opts.sourceId,
      opts.documentId ?? null,
      opts.extract ?? null,
      opts.page ?? null
    );
  }
  return id;
}

export function relate(
  investigationId: string,
  fromId: string,
  toId: string,
  relType: string,
  label?: string,
  confidence = 0.6
) {
  const exists = get(
    `SELECT id FROM relationships WHERE investigation_id = ? AND from_id = ? AND to_id = ? AND rel_type = ?`,
    investigationId,
    fromId,
    toId,
    relType
  );
  if (exists) return;
  run(
    `INSERT INTO relationships (investigation_id, from_id, to_id, rel_type, label, confidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
    investigationId,
    fromId,
    toId,
    relType,
    label ?? relType,
    confidence
  );
}

export function detectContradictions(investigationId: string) {
  const facts = all<{ id: string; predicate: string; value: string }>(
    `SELECT id, predicate, value FROM facts WHERE investigation_id = ? AND status != 'REJECTED'`,
    investigationId
  );
  const byPred = new Map<string, Set<string>>();
  for (const f of facts) {
    if (!byPred.has(f.predicate)) byPred.set(f.predicate, new Set());
    byPred.get(f.predicate)!.add(f.value);
  }
  const critical = new Set(["born_on", "born_in", "full_name", "held_position"]);
  for (const [pred, values] of byPred) {
    const vals = [...values];
    if (vals.length < 2) continue;
    if (!critical.has(pred) && pred !== "works_at") continue;
    // ignore trivial substring variants
    const unique = vals.filter((v, i) => !vals.some((w, j) => i !== j && w.toLowerCase().includes(v.toLowerCase()) && w !== v));
    if (unique.length < 2) continue;
    const existing = get(
      `SELECT id FROM contradictions WHERE investigation_id = ? AND field = ? AND status = 'UNRESOLVED'`,
      investigationId,
      pred
    );
    if (existing) continue;
    const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM contradictions`)!.c;
    const id = `CONF-${String(count + 1).padStart(6, "0")}`;
    run(
      `INSERT INTO contradictions (id, investigation_id, field, values_json, status, created_at)
       VALUES (?, ?, ?, ?, 'UNRESOLVED', ?)`,
      id,
      investigationId,
      pred,
      JSON.stringify(unique),
      nowIso()
    );
    run(`UPDATE facts SET status = 'CONFLICT' WHERE investigation_id = ? AND predicate = ?`, investigationId, pred);
    logAction(investigationId, "conflict", `CONFLICT on ${pred}: ${unique.join(" | ")}`, { field: pred, values: unique });
  }
}

export function resolveEntities(investigationId: string) {
  const persons = all<{ id: string; canonical_name: string; confidence: number }>(
    `SELECT id, canonical_name, confidence FROM entities WHERE investigation_id = ? AND kind = 'PERSON'`,
    investigationId
  );
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const sim = nameSimilarity(persons[i].canonical_name, persons[j].canonical_name);
      if (sim >= 0.82) {
        relate(investigationId, persons[i].id, persons[j].id, "LIKELY_SAME_ENTITY", `similarity ${sim.toFixed(2)}`, sim);
        logAction(
          investigationId,
          "graph",
          `LIKELY SAME ENTITY: ${persons[i].canonical_name} ≈ ${persons[j].canonical_name} (${sim.toFixed(2)})`
        );
      }
    }
  }
}

export function addTimelineEvent(opts: {
  investigationId: string;
  entityId?: string;
  date: string;
  event: string;
  sourceId?: string;
  confidence?: number;
  status?: string;
}) {
  const exists = get(
    `SELECT id FROM timeline_events WHERE investigation_id = ? AND date = ? AND event = ?`,
    opts.investigationId,
    opts.date,
    opts.event
  );
  if (exists) return;
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM timeline_events`)!.c;
  const id = `TL-${String(count + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO timeline_events (id, investigation_id, entity_id, date, event, source_id, confidence, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.investigationId,
    opts.entityId ?? null,
    opts.date,
    opts.event,
    opts.sourceId ?? null,
    opts.confidence ?? 0.6,
    opts.status ?? "OBSERVED"
  );
}

export function investigationGraph(investigationId: string) {
  const entities = all<{
    id: string;
    kind: string;
    canonical_name: string;
    confidence: number;
    status: string;
  }>(
    `SELECT id, kind, canonical_name, confidence, status FROM entities WHERE investigation_id = ?`,
    investigationId
  );
  const relationships = all<{
    from_id: string;
    to_id: string;
    rel_type: string;
    label: string;
    confidence: number;
  }>(
    `SELECT from_id, to_id, rel_type, label, confidence FROM relationships WHERE investigation_id = ?`,
    investigationId
  );
  const facts = all<{
    id: string;
    subject_entity_id: string;
    predicate: string;
    object_entity_id: string;
    value: string;
    status: string;
    confidence: number;
  }>(
    `SELECT id, subject_entity_id, predicate, object_entity_id, value, status, confidence
     FROM facts WHERE investigation_id = ?`,
    investigationId
  );
  return { entities, relationships, facts };
}

export function evaluateStop(investigationId: string): { complete: boolean; reason: string } {
  const facts = all<{ predicate: string; status: string; confidence: number }>(
    `SELECT predicate, status, confidence FROM facts WHERE investigation_id = ?`,
    investigationId
  );
  const by = (p: string) => facts.filter((f) => f.predicate === p);
  const confirmed = (p: string) =>
    by(p).some((f) => f.status === "CONFIRMED" || (f.status === "SUPPORTED" && f.confidence >= 0.8));
  const unresolved = get<{ c: number }>(
    `SELECT COUNT(*) as c FROM contradictions WHERE investigation_id = ? AND status = 'UNRESOLVED'`,
    investigationId
  )!.c;
  const identityOk = confirmed("full_name") || confirmed("mentioned_as");
  const posOk = confirmed("held_position");
  const orgOk = confirmed("works_at");
  if (identityOk && posOk && orgOk && unresolved === 0) {
    return { complete: true, reason: "critical identity fields resolved with independent evidence" };
  }
  return { complete: false, reason: "insufficient confirmed identity evidence" };
}
