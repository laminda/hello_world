import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { ASSETS } from "./db.js";
import { httpGet } from "./search.js";
import { allowedByRobots, isPublicHttpUrl } from "./crawler.js";

export function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
export function md5(buf: Buffer) {
  return crypto.createHash("md5").update(buf).digest("hex");
}

export function extractPdfStrings(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const chunks: string[] = [];
  const paren = raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/gs);
  for (const m of paren) {
    const inner = m[0].slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-zА-Яа-яЁё]{3,}/.test(inner)) chunks.push(inner);
  }
  // PDF utf-16 hex strings
  const hex = raw.matchAll(/<([0-9A-Fa-f]{8,})>/g);
  for (const m of hex) {
    try {
      const bytes = Buffer.from(m[1], "hex");
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        const txt = bytes.slice(2).swap16().toString("utf16le");
        if (/[A-Za-zА-Яа-яЁё]{3,}/.test(txt)) chunks.push(txt);
      }
    } catch {
      /* skip */
    }
  }
  return chunks.join("\n").replace(/\s+/g, " ").trim();
}

export function extractHtmlContent(html: string): { title: string; text: string; headings: string[] } {
  const $ = cheerio.load(html);
  $("script,style,nav,footer,noscript,iframe").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const headings: string[] = [];
  $("h1,h2,h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) headings.push(t);
  });
  const main = $("article, main, .content, #content, .post").first();
  const text = (main.length ? main.text() : $("body").text()).replace(/\s+/g, " ").trim();
  return { title, text: text.slice(0, 80000), headings: headings.slice(0, 40) };
}

export async function downloadPublicFile(url: string): Promise<{
  buffer: Buffer;
  mime: string;
  status: number;
  finalUrl: string;
} | null> {
  if (!isPublicHttpUrl(url)) return null;
  if (!(await allowedByRobots(url))) return null;
  const res = await httpGet(url);
  if (!res.ok || res.buffer.length === 0) return null;
  return { buffer: res.buffer, mime: res.contentType, status: res.status, finalUrl: res.finalUrl };
}

export function saveOriginal(id: string, buf: Buffer, ext: string) {
  const filename = `${id}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const storage_path = path.join(ASSETS.original, filename);
  fs.writeFileSync(storage_path, buf);
  return storage_path;
}

export function saveDocument(id: string, buf: Buffer, ext: string) {
  const filename = `${id}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const storage_path = path.join(ASSETS.documents, filename);
  fs.writeFileSync(storage_path, buf);
  return storage_path;
}

export function extFromUrlOrMime(url: string, mime: string): string {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/(\.[a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    /* skip */
  }
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("html")) return ".html";
  return ".bin";
}

export async function extractExif(buf: Buffer): Promise<Record<string, string>> {
  try {
    const exifr = await import("exifr");
    const parsed = await exifr.parse(buf, { pick: undefined, translateKeys: true, reviveValues: true });
    if (!parsed) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "object") out[k] = JSON.stringify(v);
      else out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Naive "OCR" for demo / text-in-filename; real OCR is pluggable. */
export function observeTextRegions(text: string): Array<{ type: string; text: string; confidence: number }> {
  if (!text.trim()) return [];
  return [{ type: "text_on_image", text: text.slice(0, 400), confidence: 0.5 }];
}
