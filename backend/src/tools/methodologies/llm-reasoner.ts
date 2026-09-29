import { chatJson, llmStatus } from "../llm-client.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";
import { compileDorks } from "../dorks.js";
import type { InvestigationInput } from "../../types.js";

function notConfigured() {
  const s = llmStatus();
  if (s.configured) return null;
  return fail(
    "LLM not configured",
    "Set SVOD_LLM_API_KEY (or OPENAI_API_KEY) and optional SVOD_LLM_BASE_URL / SVOD_LLM_MODEL. OpenAI-compatible API."
  );
}

const classify: ToolModule = {
  meta: {
    name: "llm_classify_target",
    module: "llm-reasoner",
    family: "llm",
    description:
      "LLM: classify target type (public_top_manager / middle_manager / low_level_employee) and publicity. Does not invent biography.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        position: { type: "string" },
        organization: { type: "string" },
        notes: { type: "string" },
      },
    },
    legal: "Uses analyst-provided fields only. Optional. No closed DBs.",
    cost: 0.35,
    when: "ambiguous role; override regex classifier",
  },
  async execute(args) {
    const blocked = notConfigured();
    if (blocked) return blocked;
    const r = await chatJson(
      `Classify this investigation target. JSON keys: target_type (public_top_manager|middle_manager|low_level_employee|unknown), publicity (high|medium|low), reasons (string[]), recommended_modules (string[]), caveats (string[]).\nInput: ${JSON.stringify(args)}`
    );
    if (!r.ok) return fail(r.error || "llm failed");
    return ok(`classified ${(r.json as { target_type?: string }).target_type || "?"}`, { data: r.json });
  },
};

const interpret: ToolModule = {
  meta: {
    name: "llm_interpret_text",
    module: "llm-reasoner",
    family: "llm",
    description:
      "LLM: interpret a public extract — facts vs hypotheses, homonyms, what is NOT stated. Input text only.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Already obtained public text" },
        hint_name: { type: "string" },
      },
      required: ["text"],
    },
    legal: "Interprets provided public text. Must not add unstated facts.",
    cost: 0.4,
    when: "after fetch/ingest, messy speaker lists",
  },
  async execute(args) {
    const blocked = notConfigured();
    if (blocked) return blocked;
    const r = await chatJson(
      `Interpret this public extract. JSON keys: facts (array of {predicate, value, status: OBSERVED|HYPOTHESIS, quote}), not_stated (string[]), homonym_risk (low|medium|high), notes (string[]).\nHint name: ${args.hint_name || ""}\nText:\n${(args.text || "").slice(0, 8000)}`
    );
    if (!r.ok) return fail(r.error || "llm failed");
    return ok("interpretation", { data: r.json });
  },
};

const strategy: ToolModule = {
  meta: {
    name: "llm_plan_strategy",
    module: "llm-reasoner",
    family: "llm",
    description:
      "LLM: next OSINT moves as tool calls {tool, args, reason}. Must pick from the registered tool names.",
    parameters: {
      type: "object",
      properties: {
        known_json: { type: "string", description: "JSON of known fields" },
        unknown_json: { type: "string", description: "JSON array of unknown fields" },
        target_type: { type: "string" },
        available_tools: { type: "string", description: "comma-separated tool names" },
      },
    },
    legal: "Planning only. Must not recommend auth-bypass or closed DBs.",
    cost: 0.38,
    when: "start, or when rule planner is stuck",
  },
  async execute(args) {
    const blocked = notConfigured();
    if (blocked) return blocked;
    const r = await chatJson(
      `Propose up to 5 next tool calls. JSON: { next: [{tool, args, reason, score}], stop_if (string) }.\nAvailable tools: ${args.available_tools || "compile_dorks,dork_search,web_search,wikipedia_search,filetype_search,fetch_url,alias_expand,email_pivot,dns_lookup"}\nTarget type: ${args.target_type || "unknown"}\nKnown: ${args.known_json || "{}"}\nUnknown: ${args.unknown_json || "[]"}\nPrefer compile_dorks / dork_search. Never suggest login scrape.`
    );
    if (!r.ok) return fail(r.error || "llm failed");
    return ok("strategy", { data: r.json });
  },
};

const dorks: ToolModule = {
  meta: {
    name: "llm_suggest_dorks",
    module: "llm-reasoner",
    family: "llm",
    description: "LLM: extra search dorks on top of the deterministic cookbook.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        organization: { type: "string" },
        position: { type: "string" },
        notes: { type: "string" },
      },
    },
    legal: "Query generation only.",
    cost: 0.3,
    when: "rule dorks exhausted",
  },
  async execute(args) {
    const blocked = notConfigured();
    if (blocked) return blocked;
    const baseline = compileDorks(args as InvestigationInput).slice(0, 8);
    const r = await chatJson(
      `Suggest up to 8 extra Google/DDG dorks NOT already in baseline. JSON: { dorks: [{dork, operators, reason}] }.\nBaseline: ${JSON.stringify(baseline.map((d) => d.dork))}\nSubject: ${JSON.stringify(args)}\nUse only quotes, OR, site, filetype, intitle, inurl, -. No exploit operators.`
    );
    if (!r.ok) return fail(r.error || "llm failed");
    return ok("llm dorks", { data: { baseline, llm: r.json } });
  },
};

const disambiguate: ToolModule = {
  meta: {
    name: "llm_disambiguate",
    module: "llm-reasoner",
    family: "llm",
    description: "LLM: same person vs homonym. Default is NOT the same person.",
    parameters: {
      type: "object",
      properties: {
        target_json: { type: "string" },
        candidate_text: { type: "string" },
      },
      required: ["candidate_text"],
    },
    legal: "Opinion on provided text. Never merge on name alone.",
    cost: 0.36,
    when: "common FIO, conflicting employers",
  },
  async execute(args) {
    const blocked = notConfigured();
    if (blocked) return blocked;
    const r = await chatJson(
      `Is this candidate the same person as the target? Default NO. JSON: { same_person: "yes"|"no"|"insufficient", confidence: 0-1, matching_identifiers: string[], conflicts: string[], why: string }.\nTarget: ${args.target_json || "{}"}\nCandidate text:\n${(args.candidate_text || "").slice(0, 6000)}`
    );
    if (!r.ok) return fail(r.error || "llm failed");
    return ok("disambiguation", { data: r.json });
  },
};

export const methodology: Methodology = {
  id: "llm-reasoner",
  title: "LLM copilot (optional API)",
  description:
    "Классификация, интерпретация текста, стратегия поиска, доп. дорки, омонимы. OpenAI-compatible API. Выключен без ключа.",
  version: "1.0",
  tools: [classify, interpret, strategy, dorks, disambiguate],
};
