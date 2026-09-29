import { all, get, run } from "./db.js";

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

export function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Copies of the same press-release are not independent confirmations. */
export function detectCopies(investigationId: string) {
  const sources = all<{ id: string; snippet: string | null; title: string | null; discovered_at: string }>(
    `SELECT id, snippet, title, discovered_at FROM sources WHERE investigation_id = ?`,
    investigationId
  );
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = `${sources[i].title || ""} ${sources[i].snippet || ""}`;
      const b = `${sources[j].title || ""} ${sources[j].snippet || ""}`;
      const sim = jaccard(a, b);
      if (sim >= 0.72) {
        const earlier = sources[i].discovered_at <= sources[j].discovered_at ? sources[i] : sources[j];
        const later = earlier.id === sources[i].id ? sources[j] : sources[i];
        run(`UPDATE sources SET copied_from = ?, independence = 'derived' WHERE id = ? AND copied_from IS NULL`, earlier.id, later.id);
        run(`UPDATE sources SET independence = COALESCE(independence, 'independent') WHERE id = ?`, earlier.id);
      }
    }
  }
}

export function independentSourceCount(factId: string): number {
  const rows = all<{ independence: string | null; copied_from: string | null; source_id: string }>(
    `SELECT s.independence, s.copied_from, s.id as source_id
     FROM fact_sources fs JOIN sources s ON s.id = fs.source_id
     WHERE fs.fact_id = ?`,
    factId
  );
  const independent = rows.filter((r) => r.independence !== "derived" && !r.copied_from);
  return independent.length || rows.length;
}

export function markIndependence(sourceId: string, value: "independent" | "derived" | "temporal" | "unknown") {
  run(`UPDATE sources SET independence = ? WHERE id = ?`, value, sourceId);
}

export function sameImageHash(investigationId: string, sha256: string): boolean {
  return Boolean(get(`SELECT id FROM images WHERE investigation_id = ? AND sha256 = ?`, investigationId, sha256));
}
