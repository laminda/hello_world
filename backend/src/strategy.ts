import { all, get, nowIso, run } from "./db.js";
import { listCatalog, recordEffectiveness, relevanceFor, type CatalogEntry, type TargetType } from "./registry.js";
import type { InvestigationInput, PlannedAction, QueryClass } from "./types.js";
import { planQueries, transliterate } from "./planner.js";

export interface Profile {
  targetType: TargetType;
  presetId: string;
  publicity: "high" | "medium" | "low";
  reasons: string[];
  unknown: string[];
  known: string[];
}

const TOP =
  /(?:генеральн[а-яё]*\s+директор|\bceo\b|president|председатель\s+правления|основатель|\bfounder\b)/i;
const MID =
  /(?:заместитель|директор|руководитель|начальник|head of|deputy|cfo|cto|vice\s*president|управляющий)/i;

export function classifyTarget(input: InvestigationInput): Profile {
  const reasons: string[] = [];
  const position = (input.position || "").trim();
  const org = (input.organization || "").trim();
  let targetType: TargetType = "unknown";
  let publicity: Profile["publicity"] = "low";

  if (TOP.test(position)) {
    targetType = "public_top_manager";
    publicity = "high";
    reasons.push(`position «${position}» matches PUBLIC_EXECUTIVE`);
  } else if (MID.test(position)) {
    targetType = "middle_manager";
    publicity = "medium";
    reasons.push(`position «${position}» matches MIDDLE_MANAGER`);
  } else if (input.username && !position) {
    targetType = "low_level_employee";
    publicity = "low";
    reasons.push("username without public role → LOW_PUBLICITY_PERSON");
  } else if (position) {
    targetType = "low_level_employee";
    publicity = "low";
    reasons.push("role does not look public → LOW_PUBLICITY_PERSON");
  } else {
    targetType = "unknown";
    reasons.push("insufficient role signal");
  }

  let presetId: string = targetType === "unknown" ? "middle_manager" : targetType;
  if (input.email && !input.last_name) {
    presetId = "known_email";
    reasons.push("email present without surname → email-pivot preset");
  }
  if ((input as InvestigationInput & { inn?: string }).inn) {
    presetId = "known_inn";
    reasons.push("INN provided → known_inn preset (permitted records only)");
  }

  const known: string[] = [];
  const unknown: string[] = [];
  const fields: Array<[string, unknown]> = [
    ["name", input.name],
    ["middle_name", input.middle_name],
    ["last_name", input.last_name],
    ["position", input.position],
    ["organization", input.organization],
    ["city", input.city],
    ["email", input.email],
    ["username", input.username],
    ["url", input.url],
  ];
  for (const [k, v] of fields) {
    if (v !== undefined && String(v).trim()) known.push(k);
    else unknown.push(k);
  }
  if (org) reasons.push(`organization=${org}`);
  return { targetType, presetId, publicity, reasons, known, unknown };
}

export interface ScoredSource {
  source_id: string;
  name: string;
  type: string;
  information_gain: number;
  target_relevance: number;
  source_reliability: number;
  identifier_match: number;
  cost: number;
  false_positive_risk: number;
  observed_lift: number;
  score: number;
  reason: string;
  legal_note: string | null;
}

function observedLift(sourceId: string, targetType: string): number {
  const row = get<{ queries: number; useful_facts: number }>(
    `SELECT queries, useful_facts FROM source_effectiveness WHERE source_id = ? AND target_type = ?`,
    sourceId,
    targetType
  );
  if (!row || row.queries < 3) return 0;
  return Math.min(0.25, (row.useful_facts / row.queries) * 0.3);
}

export function scoreSources(profile: Profile, input: InvestigationInput): ScoredSource[] {
  const catalog = listCatalog().filter((c) => c.enabled);
  const preset = get<{ sources_json: string }>(`SELECT sources_json FROM search_presets WHERE preset_id = ?`, profile.presetId);
  const preferred = new Set<string>(preset ? (JSON.parse(preset.sources_json) as string[]) : []);
  const hasEmail = Boolean(input.email);
  const hasUser = Boolean(input.username);
  const hasUrl = Boolean(input.url);
  const missingBirth = !input.birth_year;
  const missingLast = !input.last_name;

  return catalog
    .map((c) => {
      const target_relevance = relevanceFor(c, profile.targetType);
      const source_reliability = c.reliability;
      let identifier_match = 0.4;
      if (c.source_id === "username_web" && (hasUser || hasEmail)) identifier_match = 0.85;
      if (c.source_id === "inn_public" && (input as { inn?: string }).inn) identifier_match = 0.95;
      if (c.source_id === "official_website" && (hasUrl || input.organization)) identifier_match = 0.8;
      if (c.source_id === "youtube" && missingBirth && profile.publicity !== "low") identifier_match = 0.7;
      if (c.source_id === "document_search" && missingLast) identifier_match = 0.75;
      const information_gain =
        (missingLast && c.source_id === "document_search" ? 0.9 : 0.55) +
        (preferred.has(c.source_id) ? 0.15 : 0) +
        (profile.unknown.includes("last_name") && c.type === "document_search" ? 0.1 : 0);
      const false_positive_risk =
        c.source_id === "social_media" || c.source_id === "username_web" || c.source_id === "image_search" ? 0.35 : 0.12;
      const lift = observedLift(c.source_id, profile.targetType);
      const score =
        information_gain * 0.9 +
        target_relevance +
        source_reliability * 0.6 +
        identifier_match * 0.7 +
        lift -
        c.cost -
        false_positive_risk;
      const reason = preferred.has(c.source_id)
        ? `preset ${profile.presetId} prefers this source`
        : `relevance ${target_relevance.toFixed(2)} for ${profile.targetType}`;
      return {
        source_id: c.source_id,
        name: c.name,
        type: c.type,
        information_gain: Number(information_gain.toFixed(3)),
        target_relevance,
        source_reliability,
        identifier_match,
        cost: c.cost,
        false_positive_risk,
        observed_lift: lift,
        score: Number(score.toFixed(3)),
        reason,
        legal_note: c.legal_note,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function recommendNext(
  profile: Profile,
  input: InvestigationInput,
  already: string[]
): { scored: ScoredSource[]; next: ScoredSource | null } {
  const scored = scoreSources(profile, input);
  const next = scored.find((s) => !already.includes(s.source_id)) ?? null;
  return { scored, next };
}

export function queriesForSource(
  sourceId: string,
  input: InvestigationInput
): Array<{ query: string; queryClass: QueryClass; reason: string }> {
  const name = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const qn = name ? `"${name}"` : "";
  const org = input.organization ? `"${input.organization}"` : "";
  const extra = planQueries(input);
  switch (sourceId) {
    case "youtube":
      return [
        { query: `${qn} ${org} site:youtube.com`.trim(), queryClass: "BIOGRAPHY", reason: "YouTube interviews / talks" },
        { query: `${qn} интервью OR interview site:youtube.com`.trim(), queryClass: "BIOGRAPHY", reason: "interview transcript pivot" },
      ];
    case "annual_reports":
    case "document_search":
      return [
        { query: `${qn} ${org} filetype:pdf`.trim(), queryClass: "DOCUMENT", reason: "PDF / staff lists / reports" },
        { query: `${org} годовой отчёт OR annual report filetype:pdf`.trim(), queryClass: "DOCUMENT", reason: "organization reports" },
      ];
    case "news":
      return [{ query: `${qn} ${org}`.trim(), queryClass: "BIOGRAPHY", reason: "media mentions" }];
    case "conference_sites":
      return [
        { query: `${qn} конференция OR speaker OR программа`.trim(), queryClass: "DOCUMENT", reason: "speaker / event lists" },
      ];
    case "wikipedia":
      return extra.filter((e) => e.queryClass === "BIOGRAPHY" || e.queryClass === "IDENTITY").slice(0, 2);
    case "image_search":
      return [{ query: `${qn} фото OR portrait OR badge`.trim(), queryClass: "IMAGE", reason: "photographs / nameplates" }];
    case "username_web":
    case "social_media": {
      const users = usernameHypotheses(input);
      return users.slice(0, 4).map((u) => ({
        query: `"${u}"`,
        queryClass: "CONTACT" as QueryClass,
        reason: "username hypothesis — not identity proof",
      }));
    }
    case "inn_public": {
      const inn = (input as { inn?: string }).inn;
      if (!inn) return [];
      return [
        {
          query: `"${inn}"`,
          queryClass: "IDENTITY",
          reason: "search the identifier as published text on public pages only",
        },
      ];
    }
    case "web_archive":
      return extra.filter((e) => e.queryClass === "ORGANIZATION").slice(0, 1);
    default:
      return extra.slice(0, 3);
  }
}

export function usernameHypotheses(input: InvestigationInput): string[] {
  const out = new Set<string>();
  if (input.username) {
    const u = input.username.replace(/^@/, "");
    out.add(u);
    out.add(u.replaceAll(".", "_"));
    out.add(u.replaceAll("_", ""));
  }
  if (input.email) {
    const local = input.email.split("@")[0] || "";
    out.add(local);
    out.add(local.replaceAll(".", "_"));
    out.add(local.replaceAll(".", ""));
    out.add(local.replaceAll("_", "."));
  }
  if (input.name && input.last_name) {
    const n = transliterate(input.name).toLowerCase();
    const l = transliterate(input.last_name).toLowerCase();
    out.add(`${n}_${l}`);
    out.add(`${n}${l}`);
    out.add(`${n[0]}_${l}`);
    out.add(`${n[0]}.${l}`);
    if (input.middle_name) {
      const m = transliterate(input.middle_name)[0]?.toLowerCase();
      out.add(`${l}${n[0]}${m}`);
    }
  }
  return [...out].filter((x) => x.length >= 3);
}

export function persistStrategyRun(
  investigationId: string,
  profile: Profile,
  scored: ScoredSource[],
  selected?: string
) {
  run(
    `UPDATE investigations SET target_type = ?, preset_id = ?, updated_at = ? WHERE id = ?`,
    profile.targetType,
    profile.presetId,
    nowIso(),
    investigationId
  );
  run(
    `INSERT INTO strategy_runs (investigation_id, ts, target_type, preset_id, recommendation_json, selected_source, score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    investigationId,
    nowIso(),
    profile.targetType,
    profile.presetId,
    JSON.stringify(scored.slice(0, 8)),
    selected ?? null,
    scored[0]?.score ?? null
  );
}

export function feedback(investigationId: string, sourceId: string, usefulFacts: number, hits: number) {
  const inv = get<{ target_type: string }>(`SELECT target_type FROM investigations WHERE id = ?`, investigationId);
  recordEffectiveness({
    sourceId,
    targetType: inv?.target_type || "unknown",
    queries: 1,
    hits,
    usefulFacts,
    uniqueFacts: usefulFacts,
  });
}

export function strategyState(investigationId: string) {
  const inv = get<{ target_type: string; preset_id: string }>(
    `SELECT target_type, preset_id FROM investigations WHERE id = ?`,
    investigationId
  );
  const runs = all<Record<string, unknown>>(
    `SELECT * FROM strategy_runs WHERE investigation_id = ? ORDER BY id DESC LIMIT 12`,
    investigationId
  );
  const preset = inv?.preset_id
    ? get<Record<string, unknown>>(`SELECT * FROM search_presets WHERE preset_id = ?`, inv.preset_id)
    : undefined;
  const effectiveness = all<Record<string, unknown>>(`SELECT * FROM source_effectiveness ORDER BY useful_facts DESC`);
  return { target_type: inv?.target_type, preset_id: inv?.preset_id, preset, runs, effectiveness };
}
