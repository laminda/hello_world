import { searchAll, searchDuckDuckGo } from "../../search.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

const web: ToolModule = {
  meta: {
    name: "web_search",
    module: "open-web",
    family: "search",
    description: "Open-web search (DuckDuckGo HTML + Wikipedia + Wikidata). Surface discovery.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Query, may include quotes / OR" } },
      required: ["query"],
    },
    legal: "Public search pages only. No people-search DBs.",
    cost: 0.15,
    when: "unknown identity fields, need new URLs",
  },
  async execute(args) {
    const hits = await searchAll(args.query || "");
    return ok(`${hits.length} hits`, { hits });
  },
};

const news: ToolModule = {
  meta: {
    name: "news_search",
    module: "open-web",
    family: "search",
    description: "News-oriented search (СМИ / interview / press).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    legal: "Snippets only; paywalls are not bypassed.",
    cost: 0.18,
    when: "public executives, media presence",
  },
  async execute(args) {
    const hits = await searchAll(`${args.query || ""} СМИ OR interview OR пресс-релиз OR news`);
    return ok(`${hits.length} news hits`, { hits });
  },
};

const site: ToolModule = {
  meta: {
    name: "site_search",
    module: "open-web",
    family: "search",
    description: "Restrict search: site:example.com query",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, site: { type: "string" } },
      required: ["query", "site"],
    },
    legal: "Public search. Does not crawl disallowed paths.",
    cost: 0.14,
    when: "organization domain known",
  },
  async execute(args) {
    if (!args.site) return fail("site required");
    const hits = await searchDuckDuckGo(`${args.query || ""} site:${args.site}`);
    return ok(`${hits.length} site hits`, { hits });
  },
};

const filetype: ToolModule = {
  meta: {
    name: "filetype_search",
    module: "open-web",
    family: "search",
    description: "Public documents via filetype:pdf/docx/xlsx/pptx",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        filetype: { type: "string", enum: ["pdf", "docx", "xlsx", "pptx", "xls"] },
      },
      required: ["query"],
    },
    legal: "Only documents linked in public search results.",
    cost: 0.22,
    when: "staff lists, annual reports, speaker PDFs",
  },
  async execute(args) {
    const ft = args.filetype || "pdf";
    const hits = await searchAll(`${args.query || ""} filetype:${ft}`);
    return ok(`${hits.length} ${ft} hits`, { hits });
  },
};

const image: ToolModule = {
  meta: {
    name: "image_search",
    module: "open-web",
    family: "search",
    description: "Public image/photo search. Face match ≠ identity.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    legal: "Public images. Face is a signal, never proof.",
    cost: 0.22,
    when: "badge, conference photo, report image",
  },
  async execute(args) {
    const hits = await searchAll(`${args.query || ""} фото OR portrait OR badge OR image`);
    return ok(`${hits.length} image-ish hits`, { hits });
  },
};

export const methodology: Methodology = {
  id: "open-web",
  title: "Open web search",
  description: "Поверхностный поиск по открытому вебу и новостям.",
  version: "1.0",
  tools: [web, news, site, filetype, image],
};
