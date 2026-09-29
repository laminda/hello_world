/**
 * OSINT search-dork cookbook.
 * Operators are Google-style; DuckDuckGo honours quotes, OR, -, site:, filetype:.
 * intitle:/inurl:/intext:/AROUND are compiled anyway — useful if a Google-compatible
 * connector is added later; DDG may treat them as literal tokens.
 */
import type { InvestigationInput } from "../types.js";
import { transliterate } from "../planner.js";

export interface Dork {
  dork: string;
  family:
    | "identity"
    | "organization"
    | "document"
    | "news"
    | "site"
    | "conference"
    | "video"
    | "image"
    | "contact"
    | "identifier";
  operators: string[];
  reason: string;
  engine: "ddg" | "google" | "both";
  score: number;
}

function quoted(s: string) {
  const t = s.trim();
  if (!t) return "";
  return t.includes(" ") || /[«»]/.test(t) ? `"${t.replaceAll('"', "")}"` : `"${t}"`;
}

export function compileDorks(input: InvestigationInput): Dork[] {
  const full = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ").trim();
  const short = [input.name, input.last_name].filter(Boolean).join(" ").trim();
  const last = (input.last_name || "").trim();
  const org = (input.organization || "").trim();
  const pos = (input.position || "").trim();
  const city = (input.city || "").trim();
  const email = (input.email || "").trim();
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const user = (input.username || "").replace(/^@/, "");
  const inn = String(input.inn || "").replace(/\D/g, "");
  const latin = full ? transliterate(full) : "";
  const qn = full ? quoted(full) : "";
  const qs = short && short !== full ? quoted(short) : "";
  const qo = org ? quoted(org) : "";
  const qp = pos ? quoted(pos) : "";
  const out: Dork[] = [];
  const add = (d: Dork) => {
    if (!d.dork.replace(/\s+/g, " ").trim()) return;
    if (out.some((x) => x.dork === d.dork)) return;
    out.push(d);
  };

  if (qn) {
    add({
      dork: [qn, qo].filter(Boolean).join(" "),
      family: "identity",
      operators: ["quotes"],
      reason: "exact full name ± organization",
      engine: "both",
      score: 0.95,
    });
    add({
      dork: `${qn} (биография OR CV OR резюме OR biography OR «о спикере»)`,
      family: "identity",
      operators: ["quotes", "OR"],
      reason: "bio / CV pages",
      engine: "both",
      score: 0.72,
    });
    add({
      dork: `${qn} (интервью OR назначен OR должность OR «возглавил»)${qo ? " " + qo : ""}`,
      family: "news",
      operators: ["quotes", "OR"],
      reason: "appointment / interview news",
      engine: "both",
      score: 0.7,
    });
    add({
      dork: `${qn}${qo ? " " + qo : ""} (filetype:pdf OR filetype:docx)`,
      family: "document",
      operators: ["filetype", "OR", "quotes"],
      reason: "staff lists, reports, speaker PDFs",
      engine: "both",
      score: 0.88,
    });
    add({
      dork: `${qn} (конференция OR спикер OR программа OR speaker) filetype:pdf`,
      family: "conference",
      operators: ["filetype", "OR", "quotes"],
      reason: "conference programmes",
      engine: "both",
      score: 0.8,
    });
    add({
      dork: `${qn} intitle:(руководство OR команда OR team OR about)`,
      family: "site",
      operators: ["intitle", "OR", "quotes"],
      reason: "team/about pages by title",
      engine: "google",
      score: 0.62,
    });
    add({
      dork: `${last ? quoted(last) : qn} (inurl:team OR inurl:about OR inurl:rukovodstvo OR inurl:management)`,
      family: "site",
      operators: ["inurl", "OR"],
      reason: "org team URLs",
      engine: "google",
      score: 0.64,
    });
    add({
      dork: `${qn} site:youtube.com (интервью OR interview OR выступление)`,
      family: "video",
      operators: ["site", "OR", "quotes"],
      reason: "public talks",
      engine: "both",
      score: 0.66,
    });
    add({
      dork: `${qn} (фото OR portrait OR badge OR «табличка»)`,
      family: "image",
      operators: ["OR", "quotes"],
      reason: "public photos — face ≠ identity",
      engine: "both",
      score: 0.4,
    });
    add({
      dork: `${qn} (site:vedomosti.ru OR site:rbc.ru OR site:kommersant.ru OR site:forbes.ru OR site:interfax.ru)`,
      family: "news",
      operators: ["site", "OR", "quotes"],
      reason: "major RU media",
      engine: "both",
      score: 0.68,
    });
  }
  if (qs && qs !== qn) {
    add({
      dork: [qs, qo].filter(Boolean).join(" "),
      family: "identity",
      operators: ["quotes"],
      reason: "name without patronymic",
      engine: "both",
      score: 0.78,
    });
  }
  if (qn && qp) {
    add({
      dork: `${qn} ${qp}${qo ? " " + qo : ""}`,
      family: "identity",
      operators: ["quotes"],
      reason: "name + claimed title",
      engine: "both",
      score: 0.84,
    });
  }
  if (qo) {
    add({
      dork: `${qo} (годовой отчёт OR annual report OR «список аффилированных») filetype:pdf`,
      family: "document",
      operators: ["filetype", "OR", "quotes"],
      reason: "org filings / annual reports",
      engine: "both",
      score: 0.74,
    });
    add({
      dork: `${last ? quoted(last) : qn} ${qo} (директор OR руководитель OR начальник)`,
      family: "organization",
      operators: ["quotes", "OR"],
      reason: "role language near org",
      engine: "both",
      score: 0.7,
    });
  }
  if (domain) {
    add({
      dork: `${qn || qs} site:${domain}`,
      family: "site",
      operators: ["site", "quotes"],
      reason: "mailbox domain as org site",
      engine: "both",
      score: 0.86,
    });
    add({
      dork: `site:${domain} (inurl:team OR inurl:about OR «руководство»)${last ? " " + quoted(last) : ""}`,
      family: "site",
      operators: ["site", "inurl", "OR"],
      reason: "team page on org domain",
      engine: "google",
      score: 0.73,
    });
  }
  if (city && qn) {
    add({
      dork: `${qn} ${quoted(city)}`,
      family: "identity",
      operators: ["quotes"],
      reason: "geo constraint",
      engine: "both",
      score: 0.5,
    });
  }
  if (latin && latin !== full) {
    add({
      dork: `${quoted(latin)}${qo ? " " + qo : ""}`,
      family: "identity",
      operators: ["quotes"],
      reason: "latin / passport spelling",
      engine: "both",
      score: 0.6,
    });
  }
  if (email) {
    add({
      dork: `"${email}"`,
      family: "contact",
      operators: ["quotes"],
      reason: "email as published string",
      engine: "both",
      score: 0.82,
    });
  }
  if (user) {
    add({
      dork: `"${user}"`,
      family: "contact",
      operators: ["quotes"],
      reason: "username — match ≠ same person",
      engine: "both",
      score: 0.55,
    });
  }
  if (inn.length >= 10) {
    add({
      dork: `"${inn}"`,
      family: "identifier",
      operators: ["quotes"],
      reason: "INN as published text. Org INN ≠ personal INN. INN ≠ job title.",
      engine: "both",
      score: 0.9,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
