import { extractExif, extractHtmlContent, extractPdfStrings, md5, sha256 } from "../../extract.js";
import { isPublicHttpUrl } from "../../crawler.js";
import { httpGet } from "../../search.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

const html: ToolModule = {
  meta: {
    name: "extract_html",
    module: "documents",
    family: "document",
    description: "Extract title, headings, readable text from HTML.",
    parameters: { type: "object", properties: { html: { type: "string" } }, required: ["html"] },
    legal: "Operates on already-obtained public HTML.",
    cost: 0.05,
    when: "after fetch_url",
  },
  async execute(args) {
    const { title, text, headings } = extractHtmlContent(args.html || "");
    return ok(`html ${text.length} chars`, { data: { title, text: text.slice(0, 5000), headings } });
  },
};

const pdf: ToolModule = {
  meta: {
    name: "extract_pdf_text",
    module: "documents",
    family: "document",
    description: "Extract strings from a public PDF URL.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Public PDFs only.",
    cost: 0.25,
    when: "annual report, speaker list",
  },
  async execute(args) {
    if (!isPublicHttpUrl(args.url || "")) return fail("url not public");
    const res = await httpGet(args.url);
    if (!res.ok) return fail("pdf download failed");
    const text = extractPdfStrings(res.buffer);
    return ok(`pdf ${text.length} chars`, { data: { text: text.slice(0, 8000), sha256: sha256(res.buffer) } });
  },
};

const exif: ToolModule = {
  meta: {
    name: "extract_exif",
    module: "documents",
    family: "document",
    description: "Read EXIF/XMP/IPTC. Evidence, never ground truth.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Metadata of a public image.",
    cost: 0.12,
    when: "photograph ingested",
  },
  async execute(args) {
    const res = await httpGet(args.url || "");
    if (!res.ok) return fail("image download failed");
    const meta = await extractExif(res.buffer);
    return ok(`${Object.keys(meta).length} exif keys (evidence, not truth)`, { data: { meta } });
  },
};

const hash: ToolModule = {
  meta: {
    name: "hash_content",
    module: "documents",
    family: "analysis",
    description: "SHA-256 / MD5 — duplicate detection across sites.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    legal: "Local hashing.",
    cost: 0.01,
    when: "same PDF on 7 sites",
  },
  async execute(args) {
    const buf = Buffer.from(args.text || "", "utf8");
    return ok(sha256(buf).slice(0, 16) + "…", { data: { sha256: sha256(buf), md5: md5(buf), size: buf.length } });
  },
};

export const methodology: Methodology = {
  id: "documents",
  title: "Document / EXIF / hash",
  description: "Извлечение текста и метаданных из уже полученных публичных файлов.",
  version: "1.0",
  tools: [html, pdf, exif, hash],
};
