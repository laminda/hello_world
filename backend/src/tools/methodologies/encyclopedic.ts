import { searchWikipedia, searchWikidata } from "../../search.js";
import { ok, type Methodology, type ToolModule } from "../types.js";

const wiki: ToolModule = {
  meta: {
    name: "wikipedia_search",
    module: "encyclopedic",
    family: "search",
    description: "Wikipedia API (ru/en) — encyclopedic identity, not a people DB.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    legal: "Public MediaWiki API.",
    cost: 0.08,
    when: "high publicity / unique full name",
  },
  async execute(args) {
    const [ru, en] = await Promise.all([
      searchWikipedia(args.query || "", "ru"),
      searchWikipedia(args.query || "", "en"),
    ]);
    const hits = [...ru, ...en];
    return ok(`${hits.length} wiki hits`, { hits });
  },
};

const wikidata: ToolModule = {
  meta: {
    name: "wikidata_search",
    module: "encyclopedic",
    family: "search",
    description: "Wikidata entity search (QIDs, descriptions).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    legal: "Public Wikidata API.",
    cost: 0.08,
    when: "structured public-person facts",
  },
  async execute(args) {
    const hits = await searchWikidata(args.query || "");
    return ok(`${hits.length} wikidata hits`, { hits });
  },
};

export const methodology: Methodology = {
  id: "encyclopedic",
  title: "Wikipedia / Wikidata",
  description: "Энциклопедическая идентичность. Не people-search.",
  version: "1.0",
  tools: [wiki, wikidata],
};
