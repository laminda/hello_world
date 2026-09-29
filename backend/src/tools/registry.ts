import { all, get, nowIso, run } from "../db.js";
import { isToolEnabled } from "../settings.js";
import type { InvestigationInput } from "../types.js";
import { compileDorks } from "./dorks.js";
import { llmStatus } from "./llm-client.js";
import { methodology as googleDorks } from "./methodologies/google-dorks.js";
import { methodology as openWeb } from "./methodologies/open-web.js";
import { methodology as encyclopedic } from "./methodologies/encyclopedic.js";
import { methodology as video } from "./methodologies/video.js";
import { methodology as harvest } from "./methodologies/harvest.js";
import { methodology as archive } from "./methodologies/archive.js";
import { methodology as documents } from "./methodologies/documents.js";
import { methodology as identity } from "./methodologies/identity.js";
import { methodology as network } from "./methodologies/network.js";
import { methodology as nlp } from "./methodologies/nlp.js";
import { methodology as llmReasoner } from "./methodologies/llm-reasoner.js";
import { methodology as personIntel } from "./methodologies/person-intel.js";
import { methodology as searchEngines } from "./methodologies/search-engines.js";
import { methodology as digitalSearch } from "./methodologies/digital-search.js";
import { fail, type Methodology, type OsintToolMeta, type ToolCall, type ToolModule, type ToolResult } from "./types.js";

export const METHODOLOGIES: Methodology[] = [
  googleDorks,
  openWeb,
  searchEngines,
  digitalSearch,
  encyclopedic,
  video,
  harvest,
  archive,
  documents,
  identity,
  network,
  nlp,
  llmReasoner,
  personIntel,
];

const SOURCE_TO_TOOL: Record<string, string> = {
  official_website: "crawl_site",
  news: "news_search",
  youtube: "youtube_search",
  wikipedia: "wikipedia_search",
  web: "web_search",
  documents: "filetype_search",
  archive: "wayback_cdx",
  github: "github_search",
};

const modules: ToolModule[] = METHODOLOGIES.flatMap((m) => m.tools);
const byName = Object.fromEntries(modules.map((t) => [t.meta.name, t]));

export const OSINT_TOOLS: OsintToolMeta[] = modules.map((t) => t.meta);

export function listMethodologies() {
  return METHODOLOGIES.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    version: m.version,
    tools: m.tools.map((t) => t.meta.name),
  }));
}

export function listTools() {
  return OSINT_TOOLS.map((t) => ({ ...t }));
}

export async function executeTool(name: string, args: Record<string, string>): Promise<ToolResult> {
  const tool = byName[name];
  if (!tool) return fail(`unknown tool ${name}`);
  if (!isToolEnabled(name, tool.meta.module)) {
    return fail(`tool ${name} disabled in settings`);
  }
  try {
    return await tool.execute(args || {});
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function planNextTool(opts: {
  input: InvestigationInput;
  targetType: string;
  used: string[];
  unknown: string[];
  sourceCount: number;
  identity?: { identified?: boolean; identity_confidence?: number; likely_same?: number; playbook?: string };
  searchDown?: boolean;
  preferredSource?: string;
}): ToolCall | { tool: "stop"; reason: string; args: Record<string, string> } {
  if (opts.identity?.identified) {
    return { tool: "stop", reason: "person identified with ≥2 independent signals", args: {} };
  }
  if (opts.searchDown) {
    return { tool: "stop", reason: "search stack unavailable (tls/network) — not burning iterations", args: {} };
  }

  const name = [opts.input.name, opts.input.middle_name, opts.input.last_name].filter(Boolean).join(" ");
  const org = opts.input.organization || "";
  const pos = opts.input.position || "";
  const qName = name ? `"${name}"` : "";
  const qOrg = org ? `"${org}"` : "";
  const qCore = `${qName} ${qOrg} ${pos ? `"${pos}"` : ""}`.trim();
  const missingLast = !opts.input.last_name || (opts.unknown || []).includes("last_name");
  const missingOrg = !org || (opts.unknown || []).includes("organization");
  const candidates: Array<ToolCall & { score: number }> = [];
  const add = (tool: string, args: Record<string, string>, reason: string, score: number) => {
    const key = `${tool}:${JSON.stringify(args)}`;
    if (opts.used.includes(key)) return;
    const mod = byName[tool]?.meta.module;
    if (!isToolEnabled(tool, mod)) return;
    candidates.push({ tool, args, reason, score });
  };

  const ceo = opts.targetType === "public_top_manager" || opts.targetType === "public_person";
  const low = opts.targetType === "low_level_employee";
  const llm = llmStatus().configured;
  const playbook = opts.identity?.playbook || "";

  if (llm) {
    add(
      "llm_classify_target",
      {
        name,
        position: opts.input.position || "",
        organization: org,
      },
      "LLM classification of publicity / role",
      0.99
    );
    add(
      "llm_plan_strategy",
      {
        known_json: JSON.stringify(opts.input),
        unknown_json: JSON.stringify(opts.unknown),
        target_type: opts.targetType,
        available_tools: OSINT_TOOLS.map((t) => t.name).join(","),
      },
      "LLM search strategy",
      0.98
    );
  }

  add(
    "select_playbook",
    {
      name: opts.input.name || "",
      last_name: opts.input.last_name || "",
      organization: org,
      position: opts.input.position || "",
      email: opts.input.email || "",
      username: opts.input.username || "",
      inn: opts.input.inn || "",
      url: opts.input.url || "",
    },
    "person identification playbook",
    0.975
  );
  add(
    "generate_person_queries",
    {
      name: opts.input.name || "",
      last_name: opts.input.last_name || "",
      organization: org,
      position: opts.input.position || "",
      city: opts.input.city || "",
      email: opts.input.email || "",
    },
    "person query generator from partial identity",
    0.97
  );

  add(
    "compile_dorks",
    {
      name: opts.input.name || "",
      middle_name: opts.input.middle_name || "",
      last_name: opts.input.last_name || "",
      organization: org,
      position: opts.input.position || "",
      city: opts.input.city || "",
      email: opts.input.email || "",
      username: opts.input.username || "",
      inn: opts.input.inn || "",
    },
    "OSINT dork cookbook from known fields",
    0.96
  );

  for (const d of compileDorks(opts.input).slice(0, 6)) {
    add("dork_search", { dork: d.dork }, `${d.family}: ${d.reason}`, d.score * 0.88);
  }

  if (qCore) {
    add("exact_phrase_search", { query: qCore }, "quoted identity string", 0.78);
    add("speaker_search", { query: qCore }, "speaker lists / bios", missingLast ? 0.93 : 0.7);
    add("conference_search", { query: qCore }, "conference programmes", missingLast ? 0.91 : 0.62);
    add("company_people_search", { query: qCore }, "org team pages", missingLast || playbook === "PERSON_FROM_COMPANY" ? 0.92 : 0.6);
    add("press_search", { query: qCore }, "press / interviews", ceo ? 0.84 : 0.45);
    add("education_search", { query: qCore }, "alumni pivot", 0.5);
    add("award_search", { query: qCore }, "awards / ratings", ceo ? 0.55 : 0.35);
    add("pdf_cv_search", { query: qCore }, "public PDF CV / staff list", low || missingLast ? 0.86 : 0.5);
    add("github_search", { query: qCore }, "public GitHub", low ? 0.7 : 0.35);
    add("habr_search", { query: qCore }, "Habr", 0.48);
    add("hh_public_search", { query: qCore }, "public job-board snippets — job ≠ identity", low ? 0.72 : 0.3);
    add("linkedin_public_search", { query: qCore }, "LinkedIn public snippets, not login", 0.4);
    add("gov_search", { query: qCore }, "gov.ru mentions", 0.4);
    add("sudact_search", { query: qCore }, "public court acts", 0.32);
  }

  if (name) {
    add("web_search", { query: `${qName} ${qOrg}`.trim() }, "surface discovery", 0.68);
    add("multi_engine_search", { query: `${qName} ${qOrg}`.trim() }, "fallback engines if DDG empty/tls", 0.66);
    add("wikipedia_search", { query: name }, "encyclopedic identity", ceo ? 0.88 : 0.35);
    add("filetype_search", { query: `${qName} ${qOrg}`.trim(), filetype: "pdf" }, "staff lists / reports", low ? 0.9 : 0.55);
    add("news_search", { query: `${qName} ${qOrg}`.trim() }, "media", ceo ? 0.86 : 0.4);
    add("youtube_search", { query: `${qName} ${qOrg}`.trim() }, "talks/interviews", ceo ? 0.72 : 0.25);
    add("image_search", { query: `${qName}`.trim() }, "public photos", 0.28);
    add(
      "alias_expand",
      { name: opts.input.name || "", middle_name: opts.input.middle_name || "", last_name: opts.input.last_name || "" },
      "alias engine",
      0.6
    );
  }
  if (missingOrg && name) {
    add("news_search", { query: qName }, "org unknown — media may name employer", 0.74);
    add("habr_search", { query: qName }, "org unknown — tech footprint", 0.55);
  }
  if (opts.preferredSource && SOURCE_TO_TOOL[opts.preferredSource]) {
    const t = SOURCE_TO_TOOL[opts.preferredSource];
    const args =
      t === "crawl_site" && opts.input.url
        ? { url: opts.input.url }
        : t === "filetype_search"
          ? { query: qCore, filetype: "pdf" }
          : { query: qCore };
    add(t, args, `catalog dispatcher → ${opts.preferredSource}`, 0.89);
  }
  if (opts.input.email) {
    add("email_pivot", { email: opts.input.email }, "local_part / domain hypotheses", 0.85);
    const local = opts.input.email.split("@")[0];
    const domain = opts.input.email.split("@")[1];
    add("username_search", { username: local }, "username from email — not identity proof", 0.7);
    if (domain) add("dns_lookup", { domain }, "org domain from mailbox", 0.55);
  }
  if (opts.input.username) {
    add("username_search", { username: opts.input.username.replace(/^@/, "") }, "quoted username search", 0.75);
  }
  if (opts.input.inn) {
    add("inn_public_query", { inn: String(opts.input.inn) }, "lawful public identifier search", 0.88);
  }
  if (opts.input.url) {
    add("fetch_url", { url: opts.input.url }, "analyst seed URL", 0.95);
    add("wayback_cdx", { url: opts.input.url }, "historical snapshots of seed", 0.7);
    add("crawl_site", { url: opts.input.url }, "official site crawl", 0.72);
  }
  if (name && org) {
    add(
      "username_permute",
      { name: opts.input.name || "", last_name: opts.input.last_name || "", email: opts.input.email || "" },
      "username hypotheses",
      low ? 0.8 : 0.5
    );
  }
  if (llm && name) {
    add("llm_suggest_dorks", { name, organization: org, position: opts.input.position || "" }, "LLM extra dorks", 0.45);
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return { tool: "stop", reason: "no unused tools with positive expected gain", args: {} };
  const top = candidates[0];
  return { tool: top.tool, args: top.args, reason: `${top.reason} (score ${top.score.toFixed(2)})` };
}

export function logToolCall(opts: {
  investigationId: string;
  tool: string;
  args: Record<string, string>;
  reason: string;
  result: ToolResult;
  durationMs: number;
  factsDelta?: number;
  candidatesDelta?: number;
  ingested?: number;
}) {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM tool_calls`)!.c;
  const id = `TOOL-${String(c + 1).padStart(6, "0")}`;
  const errorClass = (opts.result.data?.error_class as string) || opts.result.error || (opts.result.ok ? "ok" : "fail");
  run(
    `INSERT INTO tool_calls (id, investigation_id, ts, tool, args_json, reason, ok, result_summary, hits, duration_ms, error, error_class, facts_delta, candidates_delta, ingested, funnel_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.investigationId,
    nowIso(),
    opts.tool,
    JSON.stringify(opts.args),
    opts.reason,
    opts.result.ok ? 1 : 0,
    opts.result.summary,
    opts.result.hits?.length ?? 0,
    opts.durationMs,
    opts.result.error ?? null,
    errorClass,
    opts.factsDelta ?? 0,
    opts.candidatesDelta ?? 0,
    opts.ingested ?? 0,
    JSON.stringify({ error_class: errorClass, engine: opts.result.data?.engine || null })
  );
  return id;
}

export function listToolCalls(investigationId: string) {
  return all<Record<string, unknown>>(
    `SELECT * FROM tool_calls WHERE investigation_id = ? ORDER BY ts ASC`,
    investigationId
  );
}

export { llmStatus };
