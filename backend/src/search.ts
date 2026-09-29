import * as cheerio from "cheerio";
import type { SearchHit } from "./types.js";

export const USER_AGENT =
  "SVOD-EvidenceBot/1.0 (+https://svod.local/bot; OSINT research on public sources; respects robots.txt)";

const FETCH_TIMEOUT = 12000;

export type SearchErrorClass =
  | "ok"
  | "empty"
  | "tls"
  | "timeout"
  | "http"
  | "blocked"
  | "network"
  | "parse";

export interface HttpResult {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
  buffer: Buffer;
  finalUrl: string;
  error: SearchErrorClass;
  detail?: string;
}

export interface SearchOutcome {
  hits: SearchHit[];
  engine: string;
  error: SearchErrorClass;
  status?: number;
  detail?: string;
}

function classifyFetchError(err: unknown, status = 0): SearchErrorClass {
  const msg = `${(err as Error)?.name || ""} ${(err as Error)?.message || ""} ${(err as { code?: string })?.code || ""}`;
  if (/AbortError|aborted|timeout/i.test(msg)) return "timeout";
  if (/cert|TLS|SSL|EPROTO|UNABLE_TO|unable to verif|ERR_SSL|certificate/i.test(msg)) return "tls";
  if (status === 403 || status === 429 || status === 451) return "blocked";
  if (status >= 400) return "http";
  return "network";
}

export async function httpGet(
  url: string,
  opts: { accept?: string; asBuffer?: boolean } = {}
): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  const empty = (error: SearchErrorClass, status = 0, detail?: string): HttpResult => ({
    ok: false,
    status,
    contentType: "",
    text: "",
    buffer: Buffer.alloc(0),
    finalUrl: url,
    error,
    detail,
  });
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.8",
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const error = classifyFetchError(null, res.status);
      return {
        ok: false,
        status: res.status,
        contentType,
        text: buf.toString("utf8").slice(0, 4000),
        buffer: buf,
        finalUrl: res.url || url,
        error,
        detail: `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      contentType,
      text: buf.toString("utf8"),
      buffer: buf,
      finalUrl: res.url || url,
      error: "ok",
    };
  } catch (err) {
    return empty(classifyFetchError(err), 0, (err as Error).message);
  } finally {
    clearTimeout(t);
  }
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function pushHit(hits: SearchHit[], seen: Set<string>, engine: string, href: string, title: string, snippet: string) {
  if (!href || !title) return;
  let url = href;
  try {
    const u = new URL(href, "https://example.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) url = decodeURIComponent(uddg);
    else url = u.href;
  } catch {
    return;
  }
  if (!/^https?:/i.test(url)) return;
  const key = url.split("#")[0];
  if (seen.has(key)) return;
  seen.add(key);
  hits.push({ url, title: title.trim().slice(0, 240), snippet: (snippet || "").trim().slice(0, 400), provider: engine, rank: hits.length + 1 });
}

function parseDdg(html: string, engine: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $(".result").each((_, el) => {
    const a = $(el).find("a.result__a");
    pushHit(hits, seen, engine, a.attr("href") || "", a.text(), $(el).find(".result__snippet").text());
  });
  $("a.result-link, a.result-title, a.links_main").each((_, el) => {
    pushHit(hits, seen, engine, $(el).attr("href") || "", $(el).text(), $(el).parent().text().slice(0, 200));
  });
  return hits.slice(0, 10);
}

function parseBrave(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $("div.snippet, #results .snippet, a[data-test-id='result-title']").each((_, el) => {
    const a = $(el).is("a") ? $(el) : $(el).find("a").first();
    pushHit(hits, seen, "brave", a.attr("href") || "", a.text() || $(el).find("h3").text(), $(el).find(".snippet-description, p").first().text());
  });
  if (!hits.length) {
    $("a[href^='http'] h3, h2 a[href^='http']").each((_, el) => {
      const a = $(el).is("a") ? $(el) : $(el).parent("a");
      pushHit(hits, seen, "brave", a.attr("href") || "", $(el).text(), "");
    });
  }
  return hits.slice(0, 10);
}

function parseMojeek(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $("ul.results-standard li, .results a.title, a.title[href]").each((_, el) => {
    const a = $(el).is("a") ? $(el) : $(el).find("a.title, a").first();
    pushHit(hits, seen, "mojeek", a.attr("href") || "", a.text(), $(el).find("p, .s").first().text());
  });
  return hits.slice(0, 10);
}

function parseBing(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $("li.b_algo").each((_, el) => {
    const a = $(el).find("h2 a").first();
    pushHit(hits, seen, "bing", a.attr("href") || "", a.text(), $(el).find(".b_caption p").first().text());
  });
  return hits.slice(0, 10);
}

function parseStartpage(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $("a.w-gl__result-title, .result-title a, a.result-link").each((_, el) => {
    pushHit(hits, seen, "startpage", $(el).attr("href") || "", $(el).text(), $(el).parent().find(".w-gl__description, .result-desc").text());
  });
  return hits.slice(0, 10);
}

async function htmlEngine(
  engine: string,
  url: string,
  parse: (html: string) => SearchHit[]
): Promise<SearchOutcome> {
  const res = await httpGet(url);
  if (!res.ok) return { hits: [], engine, error: res.error, status: res.status, detail: res.detail };
  try {
    const hits = parse(res.text);
    if (!hits.length) return { hits: [], engine, error: "empty", status: res.status, detail: "parsed 0 results" };
    return { hits, engine, error: "ok", status: res.status };
  } catch (err) {
    return { hits: [], engine, error: "parse", status: res.status, detail: (err as Error).message };
  }
}

export async function searchDuckDuckGoOutcome(query: string): Promise<SearchOutcome> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  return htmlEngine("duckduckgo", url, (html) => parseDdg(html, "duckduckgo"));
}

export async function searchDdgLiteOutcome(query: string): Promise<SearchOutcome> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  return htmlEngine("ddg_lite", url, (html) => parseDdg(html, "ddg_lite"));
}

export async function searchBraveOutcome(query: string): Promise<SearchOutcome> {
  return htmlEngine("brave", `https://search.brave.com/search?q=${encodeURIComponent(query)}`, parseBrave);
}

export async function searchMojeekOutcome(query: string): Promise<SearchOutcome> {
  return htmlEngine("mojeek", `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, parseMojeek);
}

export async function searchBingOutcome(query: string): Promise<SearchOutcome> {
  return htmlEngine("bing", `https://www.bing.com/search?q=${encodeURIComponent(query)}`, parseBing);
}

export async function searchStartpageOutcome(query: string): Promise<SearchOutcome> {
  return htmlEngine("startpage", `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}`, parseStartpage);
}

/** Try public HTML engines until one returns hits. tls/empty are not disguised as success. */
export async function searchWeb(query: string): Promise<SearchOutcome> {
  const q = (query || "").trim();
  if (!q) return { hits: [], engine: "multi", error: "empty", detail: "empty query" };
  const engines = [
    () => searchDuckDuckGoOutcome(q),
    () => searchBraveOutcome(q),
    () => searchBingOutcome(q),
    () => searchMojeekOutcome(q),
    () => searchDdgLiteOutcome(q),
  ];
  const errors: SearchErrorClass[] = [];
  let last: SearchOutcome | undefined;
  for (const run of engines) {
    const o = await run();
    last = o;
    if (o.hits.length) return o;
    errors.push(o.error);
    if (o.error === "empty" && errors.filter((e) => e === "empty").length >= 2) {
      return { hits: [], engine: o.engine, error: "empty", detail: "multiple engines empty" };
    }
  }
  if (errors.includes("empty")) return { hits: [], engine: last?.engine || "multi", error: "empty" };
  return { hits: [], engine: last?.engine || "multi", error: last?.error || "network", detail: last?.detail };
}

export async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  return (await searchDuckDuckGoOutcome(query)).hits;
}

export async function searchWikipedia(query: string, lang: "ru" | "en" = "ru"): Promise<SearchHit[]> {
  return (await searchWikipediaOutcome(query, lang)).hits;
}

export async function searchWikipediaOutcome(query: string, lang: "ru" | "en" = "ru"): Promise<SearchOutcome> {
  const engine = `wikipedia-${lang}`;
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&utf8=&format=json&srlimit=8`;
  const res = await httpGet(endpoint, { accept: "application/json" });
  if (!res.ok) return { hits: [], engine, error: res.error, status: res.status, detail: res.detail };
  try {
    const json = JSON.parse(res.text) as {
      query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
    };
    const hits: SearchHit[] = (json.query?.search ?? []).map((s, i) => ({
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(s.title.replaceAll(" ", "_"))}`,
      title: s.title,
      snippet: decodeHtml(s.snippet.replace(/<[^>]+>/g, "")),
      provider: engine,
      rank: i + 1,
    }));
    if (!hits.length) return { hits: [], engine, error: "empty", status: res.status };
    return { hits, engine, error: "ok", status: res.status };
  } catch (err) {
    return { hits: [], engine, error: "parse", status: res.status, detail: (err as Error).message };
  }
}

export async function searchWikidata(query: string): Promise<SearchHit[]> {
  return (await searchWikidataOutcome(query)).hits;
}

export async function searchWikidataOutcome(query: string): Promise<SearchOutcome> {
  const engine = "wikidata";
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    query
  )}&language=ru&uselang=ru&format=json&limit=6`;
  const res = await httpGet(url, { accept: "application/json" });
  if (!res.ok) return { hits: [], engine, error: res.error, status: res.status, detail: res.detail };
  try {
    const json = JSON.parse(res.text) as {
      search?: Array<{ id: string; label: string; description?: string; concepturi?: string }>;
    };
    const hits: SearchHit[] = (json.search ?? []).map((s, i) => ({
      url: s.concepturi || `https://www.wikidata.org/wiki/${s.id}`,
      title: `${s.label} (${s.id})`,
      snippet: s.description ?? "",
      provider: engine,
      rank: i + 1,
    }));
    if (!hits.length) return { hits: [], engine, error: "empty", status: res.status };
    return { hits, engine, error: "ok", status: res.status };
  } catch (err) {
    return { hits: [], engine, error: "parse", status: res.status, detail: (err as Error).message };
  }
}

export interface WaybackSnapshot {
  url: string;
  timestamp: string;
  original: string;
  status: string;
  mime: string;
  archiveUrl: string;
}

export async function waybackCdx(url: string, limit = 12): Promise<WaybackSnapshot[]> {
  return (await waybackCdxOutcome(url, limit)).snaps;
}

export async function waybackCdxOutcome(
  url: string,
  limit = 12
): Promise<{ snaps: WaybackSnapshot[]; error: SearchErrorClass; status?: number }> {
  const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
    url
  )}&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&collapse=timestamp:6&limit=${limit}`;
  const res = await httpGet(api, { accept: "application/json" });
  if (!res.ok) return { snaps: [], error: res.error, status: res.status };
  try {
    const rows = JSON.parse(res.text) as string[][];
    const body = rows.slice(1);
    const snaps = body.map((r) => {
      const [timestamp, original, status, mime] = r;
      return {
        url: original,
        timestamp,
        original,
        status,
        mime,
        archiveUrl: `https://web.archive.org/web/${timestamp}/${original}`,
      };
    });
    return { snaps, error: snaps.length ? "ok" : "empty", status: res.status };
  } catch {
    return { snaps: [], error: "parse", status: res.status };
  }
}

export async function searchYouTubeOutcome(query: string): Promise<SearchOutcome> {
  const q = /site:youtube\.com/i.test(query) ? query : `${query} site:youtube.com`;
  const o = await searchWeb(q);
  return {
    ...o,
    hits: o.hits.map((h) => ({ ...h, provider: "youtube" })),
    engine: "youtube",
  };
}

export async function searchYouTube(query: string): Promise<SearchHit[]> {
  return (await searchYouTubeOutcome(query)).hits;
}

export function mergeOutcomes(outcomes: SearchOutcome[], engine = "multi"): SearchOutcome {
  const merged: SearchHit[] = [];
  const seen = new Set<string>();
  for (const o of outcomes) {
    for (const hit of o.hits) {
      const key = hit.url.split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...hit, rank: merged.length + 1 });
    }
  }
  if (merged.length) return { hits: merged.slice(0, 18), engine, error: "ok" };
  const hard = outcomes.find((o) => o.error !== "ok" && o.error !== "empty");
  if (hard) return { hits: [], engine: hard.engine, error: hard.error, status: hard.status, detail: hard.detail };
  return { hits: [], engine, error: "empty" };
}

export async function searchAll(query: string): Promise<SearchHit[]> {
  return (await searchAllOutcome(query)).hits;
}

export async function searchAllOutcome(query: string): Promise<SearchOutcome> {
  const [web, wikiRu, wikiEn, wd] = await Promise.all([
    searchWeb(query),
    searchWikipediaOutcome(query, "ru"),
    searchWikipediaOutcome(query, "en"),
    searchWikidataOutcome(query.replaceAll('"', "")),
  ]);
  return mergeOutcomes([web, wikiRu, wikiEn, wd]);
}

export function toToolResult(outcome: SearchOutcome, label = "hits") {
  const n = outcome.hits.length;
  const data: Record<string, unknown> = {
    engine: outcome.engine,
    error_class: n ? "ok" : outcome.error === "ok" ? "empty" : outcome.error,
    status: outcome.status ?? null,
    detail: outcome.detail ?? null,
  };
  if (n > 0) {
    return { ok: true as const, summary: `${n} ${label}`, hits: outcome.hits, data };
  }
  const error = outcome.error === "ok" ? "empty" : outcome.error;
  return {
    ok: false as const,
    summary: `${error}: 0 ${label}`,
    error,
    hits: [] as SearchHit[],
    data: { ...data, error_class: error },
  };
}
