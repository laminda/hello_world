import {
  searchBingOutcome,
  searchBraveOutcome,
  searchDdgLiteOutcome,
  searchDuckDuckGoOutcome,
  searchMojeekOutcome,
  searchStartpageOutcome,
  searchWeb,
  toToolResult,
} from "../../search.js";
import { fail, type Methodology, type ToolModule } from "../types.js";

function engine(
  name: string,
  description: string,
  when: string,
  run: (q: string) => Promise<ReturnType<typeof toToolResult>>
): ToolModule {
  return {
    meta: {
      name,
      module: "search-engines",
      family: "search",
      description,
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      legal: "Public HTML search page. No login, no people-search DB, no paywall bypass.",
      cost: 0.16,
      when,
    },
    async execute(args) {
      const q = (args.query || "").trim();
      if (!q) return fail("query required");
      return run(q);
    },
  };
}

export const methodology: Methodology = {
  id: "search-engines",
  title: "Public search engines",
  description:
    "Несколько открытых HTML-движков. tls/empty ≠ успех. web_search пробует их по очереди.",
  version: "1.0",
  tools: [
    engine("ddg_search", "DuckDuckGo HTML.", "default open web", async (q) =>
      toToolResult(await searchDuckDuckGoOutcome(q), "ddg hits")
    ),
    engine("ddg_lite_search", "DuckDuckGo Lite HTML (lighter markup).", "fallback when html.ddg fails", async (q) =>
      toToolResult(await searchDdgLiteOutcome(q), "ddg-lite hits")
    ),
    engine("brave_search", "Brave Search public HTML.", "alt engine if DDG blocked", async (q) =>
      toToolResult(await searchBraveOutcome(q), "brave hits")
    ),
    engine("bing_search", "Bing public HTML.", "alt engine", async (q) =>
      toToolResult(await searchBingOutcome(q), "bing hits")
    ),
    engine("mojeek_search", "Mojeek independent index, public HTML.", "alt independent index", async (q) =>
      toToolResult(await searchMojeekOutcome(q), "mojeek hits")
    ),
    engine("startpage_search", "Startpage public HTML (may bot-block).", "privacy frontend", async (q) =>
      toToolResult(await searchStartpageOutcome(q), "startpage hits")
    ),
    engine(
      "multi_engine_search",
      "Try DDG → Brave → Bing → Mojeek → DDG Lite until hits. Honest fail if all empty/tls.",
      "when a single engine failed",
      async (q) => toToolResult(await searchWeb(q), "multi-engine hits")
    ),
  ],
};
