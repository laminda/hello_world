import { allowedByRobots, crawlSite, discoverSitemap, fetchPage, isPublicHttpUrl } from "../../crawler.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

const fetchUrl: ToolModule = {
  meta: {
    name: "fetch_url",
    module: "harvest",
    family: "document",
    description: "Fetch a public URL (robots.txt enforced). Title, text, outbound docs.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Public HTTP(S) only. No localhost/RFC1918. robots.txt respected.",
    cost: 0.2,
    when: "promising hit selected",
  },
  async execute(args) {
    if (!isPublicHttpUrl(args.url || "")) return fail("url not public http(s)");
    const page = await fetchPage(args.url);
    if (!page) return fail("fetch blocked or failed (robots/TLS/status)");
    return ok(`${page.title} · ${page.documents.length} docs · HTTP ${page.status}`, {
      hits: [{ url: page.url, title: page.title, snippet: page.text.slice(0, 280), provider: "fetch_url", rank: 1 }],
      data: {
        title: page.title,
        text: page.text.slice(0, 8000),
        documents: page.documents,
        images: page.images,
        status: page.status,
      },
    });
  },
};

const crawl: ToolModule = {
  meta: {
    name: "crawl_site",
    module: "harvest",
    family: "document",
    description: "Same-origin crawl: sitemap + internal links, document discovery.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Same origin, robots.txt, rate limit.",
    cost: 0.4,
    when: "official website of the organization",
  },
  async execute(args) {
    if (!isPublicHttpUrl(args.url || "")) return fail("url not public");
    const pages = await crawlSite(args.url, 5);
    return ok(`crawled ${pages.length} pages`, {
      hits: pages.map((p, i) => ({
        url: p.url,
        title: p.title,
        snippet: p.text.slice(0, 200),
        provider: "crawler",
        rank: i + 1,
      })),
    });
  },
};

const sitemap: ToolModule = {
  meta: {
    name: "discover_sitemap",
    module: "harvest",
    family: "document",
    description: "Parse /sitemap.xml of a public origin.",
    parameters: { type: "object", properties: { origin: { type: "string" } }, required: ["origin"] },
    legal: "Public sitemap only.",
    cost: 0.1,
    when: "need site map before crawl",
  },
  async execute(args) {
    const locs = await discoverSitemap(args.origin || args.url || "");
    return ok(`${locs.length} sitemap loc`, { data: { locs } });
  },
};

const robots: ToolModule = {
  meta: {
    name: "robots_check",
    module: "harvest",
    family: "document",
    description: "Fetch robots.txt and say whether a URL is allowed.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Compliance tool — never used to bypass.",
    cost: 0.05,
    when: "before crawl",
  },
  async execute(args) {
    const allowed = await allowedByRobots(args.url || "");
    return ok(allowed ? "allowed" : "disallowed by robots.txt", { data: { allowed } });
  },
};

export const methodology: Methodology = {
  id: "harvest",
  title: "Fetch / crawl",
  description: "Сбор публичных страниц с robots.txt. Не обход ограничений.",
  version: "1.0",
  tools: [fetchUrl, crawl, sitemap, robots],
};
