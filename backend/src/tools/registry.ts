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
import { fail, type Methodology, type OsintToolMeta, type ToolCall, type ToolModule, type ToolResult } from "./types.js";

export const METHODOLOGIES: Methodology[] = [
  googleDorks,
  openWeb,
  encyclopedic,
  video,
  harvest,
  archive,
  documents,
  identity,
  network,
  nlp,
  llmReasoner,
];

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
}): ToolCall | { tool: "stop"; reason: string; args: Record<string, string> } {
  const name = [opts.input.name, opts.input.middle_name, opts.input.last_name].filter(Boolean).join(" ");
  const org = opts.input.organization || "";
  const qName = name ? `"${name}"` : "";
  const qOrg = org ? `"${org}"` : "";
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

  for (const d of compileDorks(opts.input).slice(0, 8)) {
    add("dork_search", { dork: d.dork }, `${d.family}: ${d.reason}`, d.score * 0.94);
  }

  if (name) {
    add("web_search", { query: `${qName} ${qOrg}`.trim() }, "surface discovery", 0.7);
    add("wikipedia_search", { query: name }, "encyclopedic identity", ceo ? 0.88 : 0.35);
    add("filetype_search", { query: `${qName} ${qOrg}`.trim(), filetype: "pdf" }, "staff lists / reports", low ? 0.9 : 0.55);
    add("news_search", { query: `${qName} ${qOrg}`.trim() }, "media", ceo ? 0.86 : 0.4);
    add("youtube_search", { query: `${qName} ${qOrg}`.trim() }, "talks/interviews", ceo ? 0.9 : 0.45);
    add("image_search", { query: `${qName}`.trim() }, "public photos", 0.4);
    add(
      "alias_expand",
      { name: opts.input.name || "", middle_name: opts.input.middle_name || "", last_name: opts.input.last_name || "" },
      "alias engine",
      0.6
    );
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
}) {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM tool_calls`)!.c;
  const id = `TOOL-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO tool_calls (id, investigation_id, ts, tool, args_json, reason, ok, result_summary, hits, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    opts.result.error ?? null
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
