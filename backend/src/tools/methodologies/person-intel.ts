import {
  classifySearchHit,
  extractCandidates,
  generatePersonQueries,
  scorePersonMatch,
  selectPlaybook,
} from "../../person.js";
import type { InvestigationInput } from "../../types.js";
import { ok, type Methodology, type ToolModule } from "../types.js";

const playbook: ToolModule = {
  meta: {
    name: "select_playbook",
    module: "person-intel",
    family: "analysis",
    description: "Choose PERSON_FROM_* playbook from known fields. Missing surname + company → PERSON_FROM_COMPANY.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        last_name: { type: "string" },
        organization: { type: "string" },
        position: { type: "string" },
        email: { type: "string" },
        username: { type: "string" },
        inn: { type: "string" },
        url: { type: "string" },
      },
    },
    legal: "Local routing only. No network lookup.",
    cost: 0.01,
    when: "start of person identification",
  },
  async execute(args) {
    const p = selectPlaybook(args as InvestigationInput);
    return ok(`${p.playbook}`, { data: p as unknown as Record<string, unknown> });
  },
};

const queries: ToolModule = {
  meta: {
    name: "generate_person_queries",
    module: "person-intel",
    family: "dorks",
    description: "Person-search query set from partial identity (name+company+role, site:, filetype:pdf, latin).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        last_name: { type: "string" },
        organization: { type: "string" },
        position: { type: "string" },
        city: { type: "string" },
        email: { type: "string" },
      },
    },
    legal: "Local query generation. No network.",
    cost: 0.02,
    when: "partial name / company / role",
  },
  async execute(args) {
    const list = generatePersonQueries(args as InvestigationInput);
    return ok(`${list.length} person queries`, { data: { queries: list } });
  },
};

const extract: ToolModule = {
  meta: {
    name: "extract_candidates",
    module: "person-intel",
    family: "analysis",
    description: "Pull person candidates (name + company/position) from public text. Each is a candidate, not identity.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    legal: "Local NLP on already public text.",
    cost: 0.04,
    when: "after fetch/ingest",
  },
  async execute(args) {
    const cands = extractCandidates(args.text || "");
    return ok(`${cands.length} candidates`, { data: { candidates: cands } });
  },
};

const score: ToolModule = {
  meta: {
    name: "score_person_match",
    module: "person-intel",
    family: "analysis",
    description: "Score seed vs candidate. Name-only never equals same person. Need ≥2 independent signals.",
    parameters: {
      type: "object",
      properties: {
        seed_name: { type: "string" },
        seed_last_name: { type: "string" },
        seed_org: { type: "string" },
        seed_position: { type: "string" },
        cand_name: { type: "string" },
        cand_company: { type: "string" },
        cand_position: { type: "string" },
      },
      required: ["cand_name"],
    },
    legal: "Local scoring. Does not fetch or scrape.",
    cost: 0.02,
    when: "after candidate extraction",
  },
  async execute(args) {
    const scores = scorePersonMatch(
      { name: args.seed_name, last_name: args.seed_last_name, organization: args.seed_org, position: args.seed_position },
      { name: args.cand_name, company: args.cand_company, position: args.cand_position, extract: args.cand_name }
    );
    return ok(`${scores.same_person} (${scores.entity_match_confidence.toFixed(2)})`, {
      data: scores as unknown as Record<string, unknown>,
    });
  },
};

const classify: ToolModule = {
  meta: {
    name: "classify_search_hit",
    module: "person-intel",
    family: "analysis",
    description: "Classify a search hit: PERSON / DOCUMENT / NEWS / SOCIAL / ARCHIVE / IRRELEVANT.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" }, title: { type: "string" }, snippet: { type: "string" } },
      required: ["url"],
    },
    legal: "Local classification of already-fetched hits.",
    cost: 0.01,
    when: "after web_search / dork_search",
  },
  async execute(args) {
    const c = classifySearchHit({ url: args.url, title: args.title || "", snippet: args.snippet || "", provider: "x", rank: 1 });
    return ok(c.kind, { data: c });
  },
};

export const methodology: Methodology = {
  id: "person-intel",
  title: "Person identification",
  description: "Кандидаты, скоринг совпадения, playbook, классификация выдачи. Упоминание ≠ идентификация.",
  version: "1.0",
  tools: [playbook, queries, extract, score, classify],
};
