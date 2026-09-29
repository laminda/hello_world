/**
 * Person Intelligence — only the missing core:
 * SEARCH → CANDIDATES → MATCH → IDENTITY CONFIDENCE.
 * A mention is a candidate, never an identified person.
 */
import { all, get, nowIso, run } from "./db.js";
import { extractEntities, extractFacts, nameSimilarity } from "./nlp.js";
import { independentSourceCount } from "./independence.js";
import type { InvestigationInput, SearchHit } from "./types.js";

export type PlaybookId =
  | "PERSON_FROM_NAME"
  | "PERSON_FROM_PARTIAL_NAME"
  | "PERSON_FROM_COMPANY"
  | "PERSON_FROM_POSITION"
  | "PERSON_FROM_EMAIL"
  | "PERSON_FROM_USERNAME"
  | "PERSON_FROM_INN"
  | "PERSON_FROM_DOCUMENT";

export interface PersonCandidate {
  name: string;
  company?: string;
  position?: string;
  city?: string;
  extract: string;
}

export interface MatchScores {
  name_match: number;
  company_match: number;
  position_match: number;
  location_match: number;
  email_match: number;
  entity_match_confidence: number;
  independent_signals: number;
  same_person: "no" | "insufficient" | "likely";
  why: string[];
}

export function selectPlaybook(input: InvestigationInput): { playbook: PlaybookId; reason: string } {
  if (input.email && !input.last_name) return { playbook: "PERSON_FROM_EMAIL", reason: "email without surname" };
  if (input.username && !input.last_name) return { playbook: "PERSON_FROM_USERNAME", reason: "username without surname" };
  if (input.inn) return { playbook: "PERSON_FROM_INN", reason: "lawful public INN" };
  if (input.url && !input.last_name) return { playbook: "PERSON_FROM_DOCUMENT", reason: "seed URL / document" };
  if (input.last_name && input.organization) return { playbook: "PERSON_FROM_NAME", reason: "name + organization" };
  if (!input.last_name && input.organization && input.position) {
    return { playbook: "PERSON_FROM_COMPANY", reason: "company + role, missing surname" };
  }
  if (!input.last_name && input.position) return { playbook: "PERSON_FROM_POSITION", reason: "role without surname" };
  if (input.name && !input.last_name) return { playbook: "PERSON_FROM_PARTIAL_NAME", reason: "given name only" };
  return { playbook: "PERSON_FROM_NAME", reason: "default name search" };
}

export function classifySearchHit(hit: Pick<SearchHit, "url" | "title" | "snippet">): {
  kind: "PERSON" | "COMPANY" | "DOCUMENT" | "NEWS" | "SOCIAL" | "PROFILE" | "IMAGE" | "VIDEO" | "ARCHIVE" | "IRRELEVANT";
  relevance: number;
} {
  const blob = `${hit.url} ${hit.title} ${hit.snippet}`.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?)(\?|$)/i.test(hit.url) || blob.includes("filetype")) return { kind: "DOCUMENT", relevance: 0.8 };
  if (/web\.archive|wayback/.test(blob)) return { kind: "ARCHIVE", relevance: 0.7 };
  if (/youtube\.com|youtu\.be/.test(blob)) return { kind: "VIDEO", relevance: 0.55 };
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(hit.url) || /\bфото|portrait|badge\b/.test(blob)) return { kind: "IMAGE", relevance: 0.45 };
  if (/wikipedia|wikidata/.test(blob)) return { kind: "PROFILE", relevance: 0.75 };
  if (/vk\.com|t\.me|github\.com|linkedin|instagram|facebook/.test(blob)) return { kind: "SOCIAL", relevance: 0.4 };
  if (/новост|news|интервью|press|sm[iи]/.test(blob)) return { kind: "NEWS", relevance: 0.65 };
  if (/директор|спикер|сотрудник|фамилия|биограф/.test(blob)) return { kind: "PERSON", relevance: 0.7 };
  if (/компани|ооо|пао|оао|организация/.test(blob)) return { kind: "COMPANY", relevance: 0.5 };
  return { kind: "IRRELEVANT", relevance: 0.2 };
}

const KIND_PRIORITY: Record<string, number> = {
  PERSON: 10,
  DOCUMENT: 9,
  PROFILE: 8,
  NEWS: 7,
  ARCHIVE: 6,
  SOCIAL: 5,
  COMPANY: 4,
  IMAGE: 3,
  VIDEO: 2,
  IRRELEVANT: 0,
};

export function rankHitsForIngest(hits: SearchHit[], opts: { allowVideo?: boolean } = {}) {
  const classified = hits.map((hit) => ({ hit, ...classifySearchHit(hit) }));
  const skip = (c: (typeof classified)[number]) =>
    c.kind === "IRRELEVANT" || (!opts.allowVideo && c.kind === "VIDEO");
  const keep = classified
    .filter((c) => !skip(c))
    .sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.relevance - a.relevance);
  const skipped = classified.filter(skip);
  return { keep, skipped, classified };
}

export function extractCandidates(text: string): PersonCandidate[] {
  const out: PersonCandidate[] = [];
  const facts = extractFacts(text);
  const byExtract = new Map<string, PersonCandidate>();
  for (const f of facts) {
    const key = f.extract.slice(0, 120);
    const cur = byExtract.get(key) || { name: "", extract: f.extract };
    if (f.predicate === "mentioned_as") cur.name = f.value;
    if (f.predicate === "works_at") cur.company = f.value;
    if (f.predicate === "held_position") cur.position = f.value;
    byExtract.set(key, cur);
  }
  for (const c of byExtract.values()) {
    if (c.name && (c.company || c.position)) out.push(c);
  }
  if (!out.length) {
    for (const e of extractEntities(text).filter((x) => x.kind === "PERSON").slice(0, 8)) {
      out.push({ name: e.text, extract: e.text });
    }
  }
  return out.slice(0, 20);
}

function overlap(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return nameSimilarity(a, b);
}

export function scorePersonMatch(
  seed: { name?: string; last_name?: string; middle_name?: string; organization?: string; position?: string; city?: string; email?: string },
  cand: PersonCandidate & { email?: string }
): MatchScores {
  const seedName = [seed.name, seed.middle_name, seed.last_name].filter(Boolean).join(" ");
  const name_match = seedName && cand.name ? nameSimilarity(seedName, cand.name) : seed.last_name && cand.name
    ? nameSimilarity(seed.last_name, cand.name)
    : seed.name && cand.name
      ? nameSimilarity(seed.name, cand.name)
      : 0;
  const company_match = overlap(seed.organization, cand.company);
  const position_match = overlap(seed.position, cand.position);
  const location_match = overlap(seed.city, cand.city);
  const email_match = seed.email && cand.email && seed.email.toLowerCase() === cand.email.toLowerCase() ? 1 : 0;
  const why: string[] = [];
  let signals = 0;
  if (name_match >= 0.82) {
    signals += 1;
    why.push(`name ${name_match.toFixed(2)}`);
  }
  if (company_match >= 0.7) {
    signals += 1;
    why.push(`company ${company_match.toFixed(2)}`);
  }
  if (position_match >= 0.7) {
    signals += 1;
    why.push(`position ${position_match.toFixed(2)}`);
  }
  if (location_match >= 0.8) {
    signals += 1;
    why.push(`city ${location_match.toFixed(2)}`);
  }
  if (email_match === 1) {
    signals += 2;
    why.push("email exact");
  }
  const entity_match_confidence = Math.min(
    1,
    name_match * 0.35 + company_match * 0.25 + position_match * 0.2 + location_match * 0.1 + email_match * 0.35
  );
  let same_person: MatchScores["same_person"] = "no";
  if (signals >= 2 && entity_match_confidence >= 0.55) same_person = "likely";
  else if (signals === 1 || entity_match_confidence >= 0.35) same_person = "insufficient";
  if (same_person !== "likely") why.push("name-only or single signal ≠ same person");
  return {
    name_match,
    company_match,
    position_match,
    location_match,
    email_match,
    entity_match_confidence,
    independent_signals: signals,
    same_person,
    why,
  };
}

export function upsertCandidate(opts: {
  investigationId: string;
  cand: PersonCandidate;
  sourceId?: string;
  scores: MatchScores;
}) {
  const existing = get<{ id: string }>(
    `SELECT id FROM person_candidates WHERE investigation_id = ? AND lower(name) = lower(?)`,
    opts.investigationId,
    opts.cand.name
  );
  if (existing) {
    run(
      `UPDATE person_candidates SET company = COALESCE(?, company), position = COALESCE(?, position),
       match_json = ?, same_person = ?, confidence = ?, updated_at = ? WHERE id = ?`,
      opts.cand.company ?? null,
      opts.cand.position ?? null,
      JSON.stringify(opts.scores),
      opts.scores.same_person,
      opts.scores.entity_match_confidence,
      nowIso(),
      existing.id
    );
    return existing.id;
  }
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM person_candidates`)!.c;
  const id = `CAND-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO person_candidates
     (id, investigation_id, name, company, position, city, extract, source_id, match_json, same_person, confidence, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CANDIDATE', ?, ?)`,
    id,
    opts.investigationId,
    opts.cand.name,
    opts.cand.company ?? null,
    opts.cand.position ?? null,
    opts.cand.city ?? null,
    opts.cand.extract.slice(0, 400),
    opts.sourceId ?? null,
    JSON.stringify(opts.scores),
    opts.scores.same_person,
    opts.scores.entity_match_confidence,
    nowIso(),
    nowIso()
  );
  return id;
}

export function harvestCandidates(investigationId: string, text: string, seed: InvestigationInput, sourceId?: string) {
  const found = extractCandidates(text);
  const ids: string[] = [];
  for (const cand of found) {
    const scores = scorePersonMatch(seed, cand);
    ids.push(upsertCandidate({ investigationId, cand, sourceId, scores }));
  }
  return ids;
}

export function listCandidates(investigationId: string) {
  return all<Record<string, unknown>>(
    `SELECT * FROM person_candidates WHERE investigation_id = ? ORDER BY confidence DESC`,
    investigationId
  );
}

export function identityConfidence(investigationId: string, seed: InvestigationInput) {
  const cands = listCandidates(investigationId) as Array<{
    name: string;
    company?: string;
    position?: string;
    same_person: string;
    confidence: number;
    match_json?: string;
  }>;
  const top = cands[0];
  const likely = cands.filter((c) => c.same_person === "likely");
  const facts = all<{ id: string; predicate: string; status: string }>(
    `SELECT id, predicate, status FROM facts WHERE investigation_id = ? AND status IN ('OBSERVED','SUPPORTED','CONFIRMED')`,
    investigationId
  );
  const confirmed = new Set(facts.map((f) => f.predicate));
  const factIds = facts.map((f) => f.id);
  let independent = 0;
  for (const fid of factIds.slice(0, 12)) independent = Math.max(independent, independentSourceCount(fid));
  const conflicts =
    get<{ c: number }>(
      `SELECT COUNT(*) as c FROM contradictions WHERE investigation_id = ? AND status = 'UNRESOLVED'`,
      investigationId
    )?.c ?? 0;
  const why: string[] = [];
  if (top) why.push(`top candidate «${top.name}» (${top.same_person}, ${Math.round(top.confidence * 100)}%)`);
  if (confirmed.has("mentioned_as") || confirmed.has("full_name")) why.push("name observed in source");
  if (confirmed.has("works_at")) why.push("organization observed");
  if (confirmed.has("held_position")) why.push("position observed");
  if (independent >= 2) why.push(`${independent} independent sources`);
  if (conflicts) why.push(`${conflicts} unresolved contradiction(s)`);
  if (!top || top.same_person !== "likely") why.push("still a candidate — not identified");
  const identity_confidence = !top
    ? 0
    : Math.max(
        0,
        Math.min(
          0.95,
          top.confidence * 0.5 + Math.min(independent, 3) * 0.12 + (likely.length ? 0.1 : 0) - conflicts * 0.15
        )
      );
  return {
    playbook: selectPlaybook(seed),
    person: top?.name || [seed.name, seed.last_name].filter(Boolean).join(" ") || null,
    identity_confidence,
    identified: identity_confidence >= 0.75 && conflicts === 0 && likely.length > 0 && independent >= 2,
    independent_sources: independent,
    candidates: cands.length,
    likely_same: likely.length,
    contradictions: conflicts,
    confirmed_attributes: [...confirmed],
    why,
  };
}

export function generatePersonQueries(input: InvestigationInput): Array<{ query: string; reason: string }> {
  const first = input.name || "";
  const last = input.last_name || "";
  const org = input.organization || "";
  const pos = input.position || "";
  const city = input.city || "";
  const q: Array<{ query: string; reason: string }> = [];
  const add = (query: string, reason: string) => {
    const t = query.replace(/\s+/g, " ").trim();
    if (t.length < 4) return;
    if (q.some((x) => x.query === t)) return;
    q.push({ query: t, reason });
  };
  if (first && org && pos) add(`"${first}" "${org}" "${pos}"`, "given name + company + role");
  if (first && last && org) add(`"${first} ${last}" "${org}"`, "full name + company");
  if (first && pos) add(`"${first}" "${pos}"`, "given name + role");
  if (first && org) add(`"${first}" "${org}" аудит OR audit`, "company + given name + function");
  if (org && first) add(`site:${slugDomain(org)} "${first}"`, "org domain guess");
  if (org && first) add(`"${first}" "${org}" filetype:pdf`, "staff list / report");
  if (first && last) add(`"${first} ${last}" образование OR university OR alumni`, "education pivot");
  if (first && last) add(`"${first} ${last}" бывший OR previously OR ex-`, "previous role");
  if (first && org) add(`"${translitSafe(first)}" "${translitSafe(org)}"`, "latin alias");
  if (city && first && org) add(`"${first}" "${org}" "${city}"`, "geo constraint");
  if (input.email) add(`"${input.email}"`, "email as published string");
  return q;
}

function slugDomain(org: string) {
  const s = org.toLowerCase().replace(/пао|оао|ооо|ао|«|»|"/g, "").trim().split(/\s+/)[0] || "example";
  const lat = translitSafe(s).replace(/[^a-z0-9]/gi, "");
  return `${lat || "org"}.ru`;
}

function translitSafe(s: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
  };
  return s
    .split("")
    .map((ch) => map[ch.toLowerCase()] ?? ch)
    .join("");
}
