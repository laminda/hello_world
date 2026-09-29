import { all, get, nowIso, run } from "./db.js";
import { identityConfidence, listCandidates } from "./person.js";
import type { InvestigationInput, SearchHit } from "./types.js";

export function logSearch(opts: {
  investigationId: string;
  tool: string;
  query: string;
  engine: string;
  errorClass: string;
  hits: SearchHit[];
  classified?: Array<{ url: string; kind: string; relevance?: number }>;
  ingested?: number;
  skipped?: number;
  factsDelta?: number;
  candidatesDelta?: number;
  durationMs?: number;
  reason?: string;
  queryClass?: string;
}) {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM search_queries`)!.c;
  const qid = `Q-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO search_queries (id, investigation_id, query, engine, query_class, reason, executed_at, source_id, error_class, hits_count, ingested, facts_delta, candidates_delta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    qid,
    opts.investigationId,
    opts.query.slice(0, 500),
    opts.engine,
    opts.queryClass ?? null,
    opts.reason ?? null,
    nowIso(),
    opts.tool,
    opts.errorClass,
    opts.hits.length,
    opts.ingested ?? 0,
    opts.factsDelta ?? 0,
    opts.candidatesDelta ?? 0
  );
  for (const h of opts.hits.slice(0, 18)) {
    const kind = opts.classified?.find((x) => x.url === h.url)?.kind;
    run(
      `INSERT INTO search_results (query_id, url, title, snippet, provider, rank, selected, selection_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      qid,
      h.url,
      h.title ?? null,
      h.snippet ?? null,
      h.provider ?? opts.engine,
      h.rank ?? null,
      kind && kind !== "IRRELEVANT" && kind !== "VIDEO" ? 1 : 0,
      kind ?? null
    );
  }
  run(
    `INSERT INTO search_funnel (investigation_id, ts, tool, query, engine, error_class, hits, classified_json, ingested, skipped, facts_delta, candidates_delta, duration_ms, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    opts.investigationId,
    nowIso(),
    opts.tool,
    opts.query.slice(0, 500),
    opts.engine,
    opts.errorClass,
    opts.hits.length,
    JSON.stringify(opts.classified || []),
    opts.ingested ?? 0,
    opts.skipped ?? 0,
    opts.factsDelta ?? 0,
    opts.candidatesDelta ?? 0,
    opts.durationMs ?? null,
    opts.reason ?? null
  );
  return qid;
}

export function investigationFunnel(id: string, seed?: InvestigationInput) {
  const rows = all<{
    tool: string;
    engine: string;
    error_class: string;
    hits: number;
    ingested: number;
    skipped: number;
    facts_delta: number;
    candidates_delta: number;
    classified_json: string;
    duration_ms: number | null;
  }>(`SELECT * FROM search_funnel WHERE investigation_id = ? ORDER BY id ASC`, id);
  const tools = all<{ tool: string; ok: number; hits: number; duration_ms: number; error: string | null }>(
    `SELECT tool, ok, hits, duration_ms, error FROM tool_calls WHERE investigation_id = ?`,
    id
  );
  const queries = rows.length;
  const hits = rows.reduce((s, r) => s + (r.hits || 0), 0);
  const ingested = rows.reduce((s, r) => s + (r.ingested || 0), 0);
  const skipped = rows.reduce((s, r) => s + (r.skipped || 0), 0);
  const facts = rows.reduce((s, r) => s + (r.facts_delta || 0), 0);
  const candsDelta = rows.reduce((s, r) => s + (r.candidates_delta || 0), 0);
  const byError: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const r of rows) {
    byError[r.error_class || "ok"] = (byError[r.error_class || "ok"] || 0) + 1;
    try {
      const cls = JSON.parse(r.classified_json || "[]") as Array<{ kind?: string }>;
      for (const c of cls) byKind[c.kind || "UNKNOWN"] = (byKind[c.kind || "UNKNOWN"] || 0) + 1;
    } catch {
      /* */
    }
  }
  const waste = rows.filter((r) => (r.hits || 0) === 0 && (r.facts_delta || 0) === 0).length;
  const waste_pct = queries ? Math.round((waste / queries) * 100) : 0;
  const perToolMap = new Map<
    string,
    { tool: string; calls: number; ok: number; hits: number; facts: number; mean_ms: number; errors: Record<string, number> }
  >();
  for (const t of tools) {
    const cur = perToolMap.get(t.tool) || {
      tool: t.tool,
      calls: 0,
      ok: 0,
      hits: 0,
      facts: 0,
      mean_ms: 0,
      errors: {},
    };
    cur.calls += 1;
    cur.ok += t.ok ? 1 : 0;
    cur.hits += t.hits || 0;
    cur.mean_ms += t.duration_ms || 0;
    if (!t.ok) {
      const e = t.error || "fail";
      cur.errors[e] = (cur.errors[e] || 0) + 1;
    }
    perToolMap.set(t.tool, cur);
  }
  for (const r of rows) {
    const cur = perToolMap.get(r.tool) || {
      tool: r.tool,
      calls: 0,
      ok: 0,
      hits: 0,
      facts: 0,
      mean_ms: 0,
      errors: {},
    };
    cur.facts += r.facts_delta || 0;
    perToolMap.set(r.tool, cur);
  }
  const per_tool = [...perToolMap.values()].map((t) => ({
    ...t,
    mean_ms: t.calls ? Math.round(t.mean_ms / t.calls) : 0,
    ok_pct: t.calls ? Math.round((t.ok / t.calls) * 100) : 0,
  }));
  const cands = listCandidates(id) as Array<{ same_person?: string }>;
  const likely = cands.filter((c) => c.same_person === "likely").length;
  const ident = identityConfidence(id, seed || {});
  const lastErrors = rows.slice(-4).map((r) => r.error_class);
  const searchDown =
    lastErrors.length >= 3 && lastErrors.every((e) => e === "tls" || e === "network" || e === "timeout" || e === "blocked");
  return {
    queries,
    hits,
    ingested,
    skipped,
    facts_from_search: facts,
    candidates_delta: candsDelta,
    candidates: cands.length,
    likely,
    by_error: byError,
    by_kind: byKind,
    waste,
    waste_pct,
    empty: byError.empty || 0,
    tls: byError.tls || 0,
    network: byError.network || 0,
    timeout: byError.timeout || 0,
    http: byError.http || 0,
    blocked: byError.blocked || 0,
    per_tool: per_tool.sort((a, b) => b.calls - a.calls),
    identity_confidence: ident.identity_confidence,
    identified: ident.identified,
    search_down: searchDown,
    last_errors: lastErrors,
    rows: rows.slice(-40),
  };
}
