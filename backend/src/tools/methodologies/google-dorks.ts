import { searchWeb, toToolResult } from "../../search.js";
import { compileDorks } from "../dorks.js";
import type { InvestigationInput } from "../../types.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

const compile: ToolModule = {
  meta: {
    name: "compile_dorks",
    module: "google-dorks",
    family: "dorks",
    description:
      "Compile a ranked OSINT dork list from known fields (quotes, OR, site:, filetype:, intitle:, inurl:). Does not execute search.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        middle_name: { type: "string" },
        last_name: { type: "string" },
        organization: { type: "string" },
        position: { type: "string" },
        city: { type: "string" },
        email: { type: "string" },
        username: { type: "string" },
        inn: { type: "string" },
      },
    },
    legal: "Local generation. Dorks are queries, not access bypass.",
    cost: 0.02,
    when: "start of investigation; after new identifiers",
  },
  async execute(args) {
    const dorks = compileDorks(args as InvestigationInput);
    return ok(`${dorks.length} dorks`, {
      data: { dorks, operators: [...new Set(dorks.flatMap((d) => d.operators))] },
    });
  },
};

const search: ToolModule = {
  meta: {
    name: "dork_search",
    module: "google-dorks",
    family: "dorks",
    description: "Execute one compiled dork against public web search (DuckDuckGo HTML).",
    parameters: {
      type: "object",
      properties: { dork: { type: "string", description: "Full dork string" } },
      required: ["dork"],
    },
    legal: "Public search page only. Does not bypass robots, auth, or paywalls.",
    cost: 0.16,
    when: "after compile_dorks, pick highest-score unused dork",
  },
  async execute(args) {
    const dork = args.dork || "";
    if (!dork.trim()) return fail("dork required");
    const r = toToolResult(await searchWeb(dork), "hits for dork");
    return { ...r, data: { ...(r.data || {}), dork } };
  },
};

export const methodology: Methodology = {
  id: "google-dorks",
  title: "Search dorks",
  description:
    "Классические OSINT-дорки: точная фраза, OR, site:, filetype:, intitle:, inurl:. Сначала compile, потом execute.",
  version: "1.0",
  tools: [compile, search],
};
