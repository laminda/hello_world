import * as cheerio from "cheerio";
import type { SearchHit } from "./types.js";

export const USER_AGENT =
  "SVOD-EvidenceBot/1.0 (+https://svod.local/bot; OSINT research on public sources; respects robots.txt)";

const FETCH_TIMEOUT = 12000;

export async function httpGet(
  url: string,
  opts: { accept?: string; asBuffer?: boolean } = {}
): Promise<{ ok: boolean; status: number; contentType: string; text: string; buffer: Buffer; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
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
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      text: buf.toString("utf8"),
      buffer: buf,
      finalUrl: res.url || url,
    };
  } catch {
    return { ok: false, status: 0, contentType: "", text: "", buffer: Buffer.alloc(0), finalUrl: url };
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

export async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await httpGet(url);
  if (!res.ok) return [];
  const $ = cheerio.load(res.text);
  const hits: SearchHit[] = [];
  $(".result").each((i, el) => {
    const a = $(el).find("a.result__a");
    let href = a.attr("href") || "";
    const title = a.text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();
    // DDG wraps redirects
    try {
      const u = new URL(href, "https://duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      if (uddg) href = decodeURIComponent(uddg);
    } catch {
      /* keep */
    }
    if (title && href.startsWith("http")) {
      hits.push({ url: href, title, snippet, provider: "duckduckgo", rank: i + 1 });
    }
  });
  return hits.slice(0, 10);
}

export async function searchWikipedia(query: string, lang: "ru" | "en" = "ru"): Promise<SearchHit[]> {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&utf8=&format=json&srlimit=8`;
  const res = await httpGet(endpoint, { accept: "application/json" });
  if (!res.ok) return [];
  try {
    const json = JSON.parse(res.text) as {
      query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
    };
    return (json.query?.search ?? []).map((s, i) => ({
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(s.title.replaceAll(" ", "_"))}`,
      title: s.title,
      snippet: decodeHtml(s.snippet.replace(/<[^>]+>/g, "")),
      provider: `wikipedia-${lang}`,
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

export async function searchWikidata(query: string): Promise<SearchHit[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    query
  )}&language=ru&uselang=ru&format=json&limit=6`;
  const res = await httpGet(url, { accept: "application/json" });
  if (!res.ok) return [];
  try {
    const json = JSON.parse(res.text) as {
      search?: Array<{ id: string; label: string; description?: string; concepturi?: string }>;
    };
    return (json.search ?? []).map((s, i) => ({
      url: s.concepturi || `https://www.wikidata.org/wiki/${s.id}`,
      title: `${s.label} (${s.id})`,
      snippet: s.description ?? "",
      provider: "wikidata",
      rank: i + 1,
    }));
  } catch {
    return [];
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
  const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
    url
  )}&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&collapse=timestamp:6&limit=${limit}`;
  const res = await httpGet(api, { accept: "application/json" });
  if (!res.ok) return [];
  try {
    const rows = JSON.parse(res.text) as string[][];
    const body = rows.slice(1);
    return body.map((r) => {
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
  } catch {
    return [];
  }
}

export async function searchAll(query: string): Promise<SearchHit[]> {
  const [ddg, wikiRu, wikiEn, wd] = await Promise.allSettled([
    searchDuckDuckGo(query),
    searchWikipedia(query, "ru"),
    searchWikipedia(query, "en"),
    searchWikidata(query.replaceAll('"', "")),
  ]);
  const merged: SearchHit[] = [];
  const seen = new Set<string>();
  for (const r of [ddg, wikiRu, wikiEn, wd]) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      const key = hit.url.split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
    }
  }
  return merged.slice(0, 18);
}
