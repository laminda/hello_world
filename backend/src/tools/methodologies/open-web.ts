import { searchWeb, toToolResult } from "../../search.js";
import { fail, type Methodology, type ToolModule } from "../types.js";

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
    return toToolResult(await searchWeb(args.query || ""), "web hits");
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
    return toToolResult(await searchWeb(`${args.query || ""} СМИ OR interview OR пресс-релиз OR news`), "news hits");
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
    return toToolResult(await searchWeb(`${args.query || ""} site:${args.site}`), "site hits");
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
    return toToolResult(await searchWeb(`${args.query || ""} filetype:${ft}`), `${ft} hits`);
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
    return toToolResult(await searchWeb(`${args.query || ""} фото OR portrait OR badge OR image`), "image-ish hits");
  },
};

export const methodology: Methodology = {
  id: "open-web",
  title: "Open web search",
  description: "Поверхностный поиск по открытому вебу и новостям.",
  version: "1.0",
  tools: [web, news, site, filetype, image],
};
