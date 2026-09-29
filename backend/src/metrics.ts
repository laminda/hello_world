import { get } from "./db.js";
import { evaluateStop } from "./graph.js";
import { readSettings } from "./settings.js";

export function investigationMetrics(id: string) {
  const facts = get<{ c: number }>(`SELECT COUNT(*) as c FROM facts WHERE investigation_id = ?`, id)?.c ?? 0;
  const sources = get<{ c: number }>(`SELECT COUNT(*) as c FROM sources WHERE investigation_id = ?`, id)?.c ?? 0;
  const independent =
    get<{ c: number }>(
      `SELECT COUNT(*) as c FROM sources WHERE investigation_id = ? AND IFNULL(independence,'unknown') != 'derived'`,
      id
    )?.c ?? 0;
  const conflicts =
    get<{ c: number }>(
      `SELECT COUNT(*) as c FROM contradictions WHERE investigation_id = ? AND status = 'UNRESOLVED'`,
      id
    )?.c ?? 0;
  const tools = get<{ c: number }>(`SELECT COUNT(*) as c FROM tool_calls WHERE investigation_id = ?`, id)?.c ?? 0;
  const toolsOk =
    get<{ c: number }>(`SELECT COUNT(*) as c FROM tool_calls WHERE investigation_id = ? AND ok = 1`, id)?.c ?? 0;
  const queries = get<{ c: number }>(`SELECT COUNT(*) as c FROM search_queries WHERE investigation_id = ?`, id)?.c ?? 0;
  const hypotheses = get<{ c: number }>(`SELECT COUNT(*) as c FROM hypotheses WHERE investigation_id = ?`, id)?.c ?? 0;
  const observed =
    get<{ c: number }>(
      `SELECT COUNT(*) as c FROM facts WHERE investigation_id = ? AND status IN ('OBSERVED','SUPPORTED','CONFIRMED')`,
      id
    )?.c ?? 0;

  const has = (pred: string) =>
    Boolean(
      get(
        `SELECT id FROM facts WHERE investigation_id = ? AND predicate = ? AND status IN ('OBSERVED','SUPPORTED','CONFIRMED') LIMIT 1`,
        id,
        pred
      )
    );
  const checks = [
    { id: "identity", label: "Имя / упоминание", ok: has("mentioned_as") || has("full_name") },
    { id: "position", label: "Должность", ok: has("held_position") },
    { id: "org", label: "Организация", ok: has("works_at") },
    { id: "sources", label: "≥2 независимых источника", ok: independent >= 2 },
    { id: "conflicts", label: "Нет открытых конфликтов", ok: conflicts === 0 && facts > 0 },
  ];
  const done = checks.filter((c) => c.ok).length;
  const stop = evaluateStop(id);
  const settings = readSettings();
  const pct = Math.round((done / checks.length) * 100);
  return {
    facts,
    sources,
    independent,
    conflicts,
    tools,
    toolsOk,
    queries,
    hypotheses,
    observed,
    pct,
    checks,
    stop,
    max_iterations: settings.max_iterations,
  };
}
