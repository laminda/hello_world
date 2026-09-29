import * as cheerio from "cheerio";
import { httpGet, USER_AGENT } from "./search.js";

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

const robotsCache = new Map<string, RobotsRules>();
const lastHit = new Map<string, number>();
const MIN_GAP_MS = 800;

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let applies = false;
  const disallow: string[] = [];
  const allow: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    const key = k.trim().toLowerCase();
    if (key === "user-agent") {
      applies = v === "*" || USER_AGENT.toLowerCase().startsWith(v.toLowerCase());
    } else if (applies && key === "disallow" && v) {
      disallow.push(v);
    } else if (applies && key === "allow" && v) {
      allow.push(v);
    }
  }
  return { disallow, allow };
}

function pathAllowed(pathname: string, rules: RobotsRules): boolean {
  const matchLen = (patterns: string[]) =>
    patterns.reduce((best, p) => (pathname.startsWith(p) ? Math.max(best, p.length) : best), 0);
  const d = matchLen(rules.disallow);
  const a = matchLen(rules.allow);
  if (d === 0) return true;
  return a > d;
}

async function respectDelay(host: string) {
  const last = lastHit.get(host) ?? 0;
  const wait = MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export async function allowedByRobots(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    let robots = robotsCache.get(u.origin);
    if (!robots) {
      const res = await httpGet(`${u.origin}/robots.txt`);
      robots = parseRobots(res.ok ? res.text : "");
      robotsCache.set(u.origin, robots);
    }
    return pathAllowed(u.pathname, robots);
  } catch {
    return false;
  }
}

export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "::1") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return false;
    const rfc1918 = host.match(/^172\.(\d+)\./);
    if (rfc1918) {
      const oct = Number(rfc1918[1]);
      if (oct >= 16 && oct <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const DOC_EXT = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".csv", ".txt", ".xml", ".json", ".jpg", ".jpeg", ".png", ".webp",
];

export function looksLikeDocument(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  return DOC_EXT.some((ext) => path.endsWith(ext));
}

export interface CrawlPage {
  url: string;
  status: number;
  title: string;
  text: string;
  html: string;
  links: string[];
  documents: string[];
  images: string[];
  discoveredAt: string;
}

export async function fetchPage(url: string): Promise<CrawlPage | null> {
  if (!isPublicHttpUrl(url)) return null;
  if (!(await allowedByRobots(url))) return null;
  await respectDelay(new URL(url).host);
  const res = await httpGet(url);
  if (!res.ok && res.status === 0) return null;
  const $ = cheerio.load(res.text);
  $("script,style,noscript,svg,iframe").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 50000);
  const origin = new URL(res.finalUrl || url);
  const links: string[] = [];
  const documents: string[] = [];
  const images: string[] = [];
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href")!, origin).href;
      if (!isPublicHttpUrl(abs)) return;
      if (looksLikeDocument(abs)) documents.push(abs);
      else links.push(abs);
    } catch {
      /* skip */
    }
  });
  $("img[src]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("src")!, origin).href;
      if (isPublicHttpUrl(abs)) images.push(abs);
    } catch {
      /* skip */
    }
  });
  return {
    url: res.finalUrl || url,
    status: res.status,
    title,
    text,
    html: res.text.slice(0, 200000),
    links: unique(links).slice(0, 80),
    documents: unique(documents).slice(0, 40),
    images: unique(images).slice(0, 30),
    discoveredAt: new Date().toISOString(),
  };
}

export async function discoverSitemap(origin: string): Promise<string[]> {
  if (!isPublicHttpUrl(origin)) return [];
  const sitemapUrl = new URL("/sitemap.xml", origin).href;
  if (!(await allowedByRobots(sitemapUrl))) return [];
  const res = await httpGet(sitemapUrl);
  if (!res.ok) return [];
  const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
  return unique(locs).slice(0, 40);
}

export async function crawlSite(seedUrl: string, maxPages = 6): Promise<CrawlPage[]> {
  const origin = new URL(seedUrl).origin;
  const queue = [seedUrl];
  const seen = new Set<string>();
  const pages: CrawlPage[] = [];
  const sitemap = await discoverSitemap(origin);
  for (const u of sitemap.slice(0, 8)) queue.push(u);

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    const key = url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (new URL(url).origin !== origin) continue;
    } catch {
      continue;
    }
    const page = await fetchPage(url);
    if (!page) continue;
    pages.push(page);
    for (const l of page.links) {
      try {
        if (new URL(l).origin === origin && !seen.has(l)) queue.push(l);
      } catch {
        /* skip */
      }
    }
  }
  return pages;
}

function unique(arr: string[]) {
  return [...new Set(arr)];
}
