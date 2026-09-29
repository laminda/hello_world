import type { InvestigationInput, PlannedAction, QueryClass } from "./types.js";

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function transliterate(s: string): string {
  return s
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = CYR_TO_LAT[lower];
      if (mapped === undefined) return ch;
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join("");
}

export function yoVariants(s: string): string[] {
  const set = new Set([s]);
  if (s.includes("ё") || s.includes("Ё")) {
    set.add(s.replaceAll("ё", "е").replaceAll("Ё", "Е"));
  }
  if (s.includes("е") || s.includes("Е")) {
    // only swap first е→ё as a hypothesis, not every occurrence
    set.add(s);
  }
  return [...set];
}

export function initials(name?: string, middle?: string, last?: string): string[] {
  const out: string[] = [];
  const n = name?.trim();
  const m = middle?.trim();
  const l = last?.trim();
  if (n && m && l) {
    const ni = n[0];
    const mi = m[0];
    out.push(`${ni}.${mi}. ${l}`, `${ni}. ${mi}. ${l}`, `${l} ${ni}.${mi}.`, `${l} ${ni}. ${mi}.`);
  } else if (n && m) {
    const ni = n[0];
    const mi = m[0];
    out.push(`${ni}.${mi}.`, `${n} ${m}`);
  }
  return out;
}

export function knownUnknown(input: InvestigationInput) {
  const known: string[] = [];
  const unknown: string[] = [];
  const map: Array<[keyof InvestigationInput, string]> = [
    ["name", "first_name"],
    ["middle_name", "middle_name"],
    ["last_name", "last_name"],
    ["full_name", "full_name"],
    ["position", "position"],
    ["organization", "organization"],
    ["city", "city"],
    ["email", "email"],
    ["phone", "phone"],
    ["username", "username"],
    ["url", "url"],
    ["birth_year", "birth_year"],
  ];
  for (const [k, label] of map) {
    const v = input[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      known.push(`${label}=${v}`);
    } else {
      unknown.push(label);
    }
  }
  return { known, unknown };
}

function q(parts: Array<string | undefined>, extra = ""): string | null {
  const core = parts.filter(Boolean).join(" ").trim();
  if (!core) return null;
  return extra ? `${core} ${extra}`.trim() : core;
}

export function planQueries(input: InvestigationInput): Array<{
  query: string;
  queryClass: QueryClass;
  reason: string;
}> {
  const name = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const quotedName = name ? `"${name}"` : "";
  const latin = name ? `"${transliterate(name)}"` : "";
  const items: Array<{ query: string; queryClass: QueryClass; reason: string }> = [];
  const add = (query: string | null, queryClass: QueryClass, reason: string) => {
    if (!query) return;
    if (items.some((i) => i.query === query)) return;
    items.push({ query, queryClass, reason });
  };

  add(q([quotedName, input.position ? `"${input.position}"` : undefined]), "IDENTITY", "identify surname / full identity");
  add(q([quotedName, input.organization ? `"${input.organization}"` : undefined]), "ORGANIZATION", "link person to organization");
  add(q([quotedName, input.city]), "IDENTITY", "constrain by city");
  add(q([quotedName, "биография"]), "BIOGRAPHY", "find biographical pages");
  add(q([quotedName, "biography"]), "BIOGRAPHY", "find english biographical pages");
  add(q([quotedName, "filetype:pdf"]), "DOCUMENT", "discover documents mentioning the person");
  add(q([quotedName, input.position, "filetype:pdf"]), "DOCUMENT", "find staff lists / reports");
  add(q([quotedName, "email OR почта OR @"]), "EMAIL", "discover contact addresses");
  add(q([quotedName, "фото OR photo OR portrait"]), "IMAGE", "find photographs");
  add(q([input.organization ? `"${input.organization}"` : undefined, "годовой отчёт OR annual report"]), "DOCUMENT", "organization reports");
  add(q([quotedName, "заместитель OR директор OR CV OR резюме"]), "POSITION", "career / position evidence");
  if (latin && latin !== quotedName) {
    add(q([latin, input.organization]), "IDENTITY", "latin alias search");
  }
  if (input.email) add(input.email, "EMAIL", "search by known email");
  if (input.username) add(`"${input.username}"`, "CONTACT", "search by username");
  if (input.url) add(input.url, "ORGANIZATION", "seed url provided by analyst");
  if (input.birth_year) add(q([quotedName, String(input.birth_year)]), "TIMELINE", "birth year constraint");

  return items;
}

export function nextActions(
  input: InvestigationInput,
  state: {
    sourceCount: number;
    factCount: number;
    contradictionCount: number;
    searched: string[];
    iteration: number;
  }
): PlannedAction[] {
  const planned = planQueries(input).filter((p) => !state.searched.includes(p.query));
  const actions: PlannedAction[] = planned.slice(0, 6).map((p) => ({
    type: "search" as const,
    query: p.query,
    queryClass: p.queryClass,
    reason: p.reason,
    provider: "multi",
  }));

  if (input.url && state.iteration === 0) {
    actions.unshift({
      type: "fetch_url",
      url: input.url,
      reason: "analyst-provided seed URL",
    });
  }

  if (state.contradictionCount > 0 && state.iteration > 1) {
    actions.unshift({
      type: "resolve_conflict",
      reason: "Resolve unresolved critical contradictions",
    });
  }

  if (state.iteration > 8 || (state.sourceCount >= 12 && state.factCount >= 8)) {
    actions.push({ type: "stop", reason: "stop conditions approaching" });
  }

  return actions;
}

export function scoreAction(action: PlannedAction, searched: string[]): number {
  const information_gain =
    action.type === "search" && action.queryClass === "IDENTITY"
      ? 0.9
      : action.type === "fetch_url"
        ? 0.85
        : action.type === "crawl_site"
          ? 0.8
          : action.type === "archive_lookup"
            ? 0.7
            : action.type === "resolve_conflict"
              ? 0.75
              : 0.6;
  const source_quality =
    action.queryClass === "DOCUMENT" || action.queryClass === "ARCHIVE" ? 0.85 : 0.7;
  const identity_relevance = action.queryClass === "IDENTITY" || action.queryClass === "BIOGRAPHY" ? 0.9 : 0.65;
  const cost = action.type === "crawl_site" ? 0.4 : 0.15;
  const duplicate_probability = action.query && searched.includes(action.query) ? 0.9 : 0.1;
  return information_gain * source_quality * identity_relevance - cost - duplicate_probability;
}
