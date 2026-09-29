import { initials, transliterate, yoVariants } from "./planner.js";

export interface ExtractedEntity {
  kind: string;
  text: string;
  confidence: number;
}

export interface ExtractedFact {
  predicate: string;
  value: string;
  subject?: string;
  object?: string;
  extract: string;
  confidence: number;
}

const POSITION_RE =
  /(?:заместитель\s+директора|директор|генеральный\s+директор|председатель|руководитель|начальник\s+отдела|head of|deputy director|ceo|cfo|cto|president|minister)/gi;

const ORG_RE =
  /(?:ООО|ОАО|АО|ПАО|ЗАО|ФГУП|НКО|Inc\.?|Ltd\.?|LLC|GmbH|Company|Компания)\s+[«"']?[\wА-Яа-яЁёA-Za-z0-9\-\. ]{2,60}/g;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g;
const DATE_RE =
  /\b(?:\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}[-./]\d{2}[-./]\d{2}|(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s+\d{4}|\b(?:19|20)\d{2}\b)/gi;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;

const PERSON_RE =
  /(?:[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.|[А-ЯЁ]\.\s*[А-ЯЁ]\.\s+[А-ЯЁ][а-яё]{2,}|[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё]{2,})?|[A-Z][a-z]+\s+[A-Z][a-z]+)/g;

export function extractEntities(text: string): ExtractedEntity[] {
  const out: ExtractedEntity[] = [];
  const add = (kind: string, value: string, confidence: number) => {
    const t = value.replace(/\s+/g, " ").trim();
    if (!t || t.length < 3) return;
    if (out.some((e) => e.kind === kind && e.text === t)) return;
    out.push({ kind, text: t, confidence });
  };
  for (const m of text.match(EMAIL_RE) ?? []) add("EMAIL", m, 0.95);
  for (const m of text.match(PHONE_RE) ?? []) add("PHONE", m, 0.8);
  for (const m of text.match(URL_RE) ?? []) add("URL", m.slice(0, 200), 0.9);
  for (const m of text.match(ORG_RE) ?? []) add("ORGANIZATION", m, 0.7);
  for (const m of text.match(POSITION_RE) ?? []) add("POSITION", m, 0.7);
  for (const m of text.match(DATE_RE) ?? []) add("DATE", m, 0.6);
  for (const m of text.match(PERSON_RE) ?? []) {
    if (m.length > 60) continue;
    add("PERSON", m, 0.55);
  }
  return out.slice(0, 80);
}

export function extractFacts(text: string, hintName?: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const sentences = text.split(/(?<=[\.!?])\s+/).slice(0, 200);
  for (const s of sentences) {
    const pos = s.match(POSITION_RE);
    if (pos) {
      facts.push({
        predicate: "held_position",
        value: pos[0],
        extract: s.slice(0, 280),
        confidence: 0.62,
      });
    }
    const org = s.match(ORG_RE);
    if (org) {
      facts.push({
        predicate: "works_at",
        value: org[0],
        extract: s.slice(0, 280),
        confidence: 0.6,
      });
    }
    const born = s.match(/род(?:ился|илась|ился в|илась в)?[^\.]{0,40}?(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4})/i);
    if (born) {
      facts.push({
        predicate: "born_on",
        value: born[1],
        extract: s.slice(0, 280),
        confidence: 0.7,
      });
    }
    const city = s.match(/род(?:ился|илась)\s+в\s+([А-ЯЁA-Z][А-Яа-яёA-Za-z\-]+)/);
    if (city) {
      facts.push({
        predicate: "born_in",
        value: city[1],
        extract: s.slice(0, 280),
        confidence: 0.65,
      });
    }
  }
  if (hintName && text.toLowerCase().includes(hintName.toLowerCase())) {
    facts.push({
      predicate: "mentioned_as",
      value: hintName,
      extract: snippetAround(text, hintName),
      confidence: 0.8,
    });
  }
  return facts.slice(0, 40);
}

function snippetAround(text: string, needle: string) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return needle;
  return text.slice(Math.max(0, i - 80), i + needle.length + 80).replace(/\s+/g, " ");
}

export function generateAliases(parts: {
  name?: string;
  middle_name?: string;
  last_name?: string;
}): Array<{ alias: string; confidence: number; evidence: string }> {
  const { name, middle_name, last_name } = parts;
  const set: Array<{ alias: string; confidence: number; evidence: string }> = [];
  const add = (alias: string, confidence: number, evidence: string) => {
    if (!alias.trim()) return;
    if (set.some((a) => a.alias === alias)) return;
    set.push({ alias, confidence, evidence });
  };
  if (name && last_name) {
    add(`${name} ${last_name}`, 0.95, "direct composition");
    add(`${last_name} ${name}`, 0.9, "inverted order");
    for (const v of yoVariants(`${name} ${last_name}`)) add(v, 0.85, "ё/е variant");
    add(transliterate(`${name} ${last_name}`), 0.7, "transliteration");
  }
  if (name && middle_name && last_name) {
    add(`${name} ${middle_name} ${last_name}`, 0.98, "full name");
    add(`${last_name} ${name} ${middle_name}`, 0.9, "official order");
    add(transliterate(`${name} ${middle_name} ${last_name}`), 0.72, "full transliteration");
    for (const ini of initials(name, middle_name, last_name)) add(ini, 0.8, "initials");
    const local = `${transliterate(name)[0]?.toLowerCase()}.${transliterate(last_name).toLowerCase()}`;
    add(local, 0.45, "email-style local part hypothesis");
    add(local.replace(".", "_"), 0.4, "username hypothesis");
  } else if (name && middle_name) {
    add(`${name} ${middle_name}`, 0.9, "given + patronymic");
    add(transliterate(`${name} ${middle_name}`), 0.65, "transliteration");
    for (const ini of initials(name, middle_name)) add(ini, 0.6, "initials");
  }
  return set;
}

export function emailIntelligence(email: string) {
  const [local_part, domain] = email.split("@");
  const hypotheses: Array<{ statement: string; confidence: number }> = [];
  if (!local_part || !domain) return { local_part: "", domain: "", hypotheses };
  const parts = local_part.split(/[._-]/);
  if (parts.length >= 2) {
    hypotheses.push({
      statement: `local_part suggests given-name initial or token "${parts[0]}" and surname token "${parts[1]}"`,
      confidence: 0.4,
    });
  }
  hypotheses.push({
    statement: `domain ${domain} may correspond to an organization website`,
    confidence: 0.5,
  });
  return { local_part, domain, hypotheses };
}

export function nameSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const dice = (2 * inter) / (ta.size + tb.size);
  return Math.max(dice, levenshteinSim(na, nb));
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinSim(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 12) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}
