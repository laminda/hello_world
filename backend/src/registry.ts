import { all, get, nowIso, run } from "./db.js";

export type TargetType =
  | "public_top_manager"
  | "public_person"
  | "middle_manager"
  | "low_level_employee"
  | "unknown";

export interface SourceProvider {
  id: string;
  name: string;
  capabilities(): string[];
  search(query: string): Promise<Array<{ url: string; title: string; snippet: string; provider: string; rank: number }>>;
}

export interface CatalogEntry {
  source_id: string;
  name: string;
  type: string;
  methods_json: string;
  api_available: number;
  auth_method: string;
  rate_limit: string | null;
  cost: number;
  reliability: number;
  legal_note: string | null;
  enabled: number;
  plugin: string | null;
  relevance_json: string;
  params_json: string;
  output_json: string;
}

const CATALOG: Array<Omit<CatalogEntry, never> & { relevance: Record<string, number>; methods: string[] }> = [
  {
    source_id: "google",
    name: "Google (Custom Search API)",
    type: "search_api",
    methods: ["search"],
    api_available: 1,
    auth_method: "api_key",
    rate_limit: "Custom Search quota",
    cost: 0.12,
    reliability: 0.9,
    legal_note: "Official Google Programmable Search JSON API. Public snippets only. Key stored locally.",
    enabled: 1,
    plugin: "google_search",
    relevance: { public_top_manager: 0.95, public_person: 0.92, middle_manager: 0.9, low_level_employee: 0.85 },
    params_json: "{}",
    output_json: '["url","title","snippet"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "yandex",
    name: "Yandex (Search XML API)",
    type: "search_api",
    methods: ["search"],
    api_available: 1,
    auth_method: "api_key",
    rate_limit: "XML API quota",
    cost: 0.12,
    reliability: 0.9,
    legal_note: "Official Yandex Search XML API. Public snippets. No login scrape.",
    enabled: 1,
    plugin: "yandex_search",
    relevance: { public_top_manager: 0.95, public_person: 0.92, middle_manager: 0.92, low_level_employee: 0.88 },
    params_json: "{}",
    output_json: '["url","title","snippet"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "official_website",
    name: "Official website / crawler",
    type: "http",
    methods: ["crawl", "sitemap", "documents"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "1 rps / host + robots.txt",
    cost: 0.25,
    reliability: 0.88,
    legal_note: "Public pages only. robots.txt enforced. No auth bypass.",
    enabled: 1,
    plugin: "crawler",
    relevance: { public_top_manager: 0.95, public_person: 0.85, middle_manager: 0.75, low_level_employee: 0.2 },
    params_json: "{}",
    output_json: '["html","links","documents"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "news",
    name: "News / media search",
    type: "search_api",
    methods: ["search"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared search",
    cost: 0.2,
    reliability: 0.7,
    legal_note: "Open web snippets. Paywalls are not bypassed.",
    enabled: 1,
    plugin: "search",
    relevance: { public_top_manager: 0.92, public_person: 0.9, middle_manager: 0.45, low_level_employee: 0.08 },
    params_json: "{}",
    output_json: '["url","title","snippet"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "youtube",
    name: "YouTube",
    type: "video",
    methods: ["search", "transcript", "metadata"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "via public search",
    cost: 0.22,
    reliability: 0.72,
    legal_note: "Public videos only. Transcripts when the platform exposes them. No login.",
    enabled: 1,
    plugin: "youtube",
    relevance: { public_top_manager: 0.95, public_person: 0.9, middle_manager: 0.6, low_level_employee: 0.1 },
    params_json: "{}",
    output_json: '["video","title","description","transcript?"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "conference_sites",
    name: "Conferences / speaker lists",
    type: "search_api",
    methods: ["search", "documents"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared",
    cost: 0.18,
    reliability: 0.74,
    legal_note: "Public programs and PDFs.",
    enabled: 1,
    plugin: "search",
    relevance: { public_top_manager: 0.88, public_person: 0.8, middle_manager: 0.7, low_level_employee: 0.25 },
    params_json: "{}",
    output_json: '["url","pdf"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "annual_reports",
    name: "Annual / financial reports",
    type: "document_search",
    methods: ["search", "pdf"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared",
    cost: 0.28,
    reliability: 0.9,
    legal_note: "Published reports only.",
    enabled: 1,
    plugin: "documents",
    relevance: { public_top_manager: 0.93, public_person: 0.55, middle_manager: 0.8, low_level_employee: 0.15 },
    params_json: "{}",
    output_json: '["pdf","text"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "web_archive",
    name: "Web Archive (Wayback)",
    type: "archive_api",
    methods: ["cdx", "snapshot"],
    api_available: 1,
    auth_method: "none",
    rate_limit: "CDX public API",
    cost: 0.2,
    reliability: 0.86,
    legal_note: "Internet Archive public CDX. Historical, not current.",
    enabled: 1,
    plugin: "wayback",
    relevance: { public_top_manager: 0.8, public_person: 0.75, middle_manager: 0.78, low_level_employee: 0.55 },
    params_json: "{}",
    output_json: '["snapshot","date"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "wikipedia",
    name: "Wikipedia / Wikidata",
    type: "open_data_api",
    methods: ["search", "entity"],
    api_available: 1,
    auth_method: "none",
    rate_limit: "API etiquette",
    cost: 0.1,
    reliability: 0.8,
    legal_note: "Public encyclopedic APIs.",
    enabled: 1,
    plugin: "wikipedia",
    relevance: { public_top_manager: 0.85, public_person: 0.95, middle_manager: 0.25, low_level_employee: 0.05 },
    params_json: "{}",
    output_json: '["page","wikidata"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "document_search",
    name: "Document discovery (PDF/Office)",
    type: "document_search",
    methods: ["search", "extract", "ocr"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared",
    cost: 0.3,
    reliability: 0.84,
    legal_note: "Publicly linked files only.",
    enabled: 1,
    plugin: "documents",
    relevance: { public_top_manager: 0.7, public_person: 0.5, middle_manager: 0.88, low_level_employee: 0.8 },
    params_json: "{}",
    output_json: '["pdf","doc","xls"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "image_search",
    name: "Image search",
    type: "image_search_api",
    methods: ["search", "ocr", "exif"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared",
    cost: 0.25,
    reliability: 0.55,
    legal_note: "Public images. Face match is a signal, never identity proof.",
    enabled: 1,
    plugin: "search",
    relevance: { public_top_manager: 0.65, public_person: 0.7, middle_manager: 0.45, low_level_employee: 0.4 },
    params_json: "{}",
    output_json: '["image","ocr","exif"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "social_media",
    name: "Social / professional profiles",
    type: "social_media_api",
    methods: ["search"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "public search only",
    cost: 0.22,
    reliability: 0.45,
    legal_note: "No login, no scraping behind auth. Username match ≠ same person.",
    enabled: 1,
    plugin: "username",
    relevance: { public_top_manager: 0.55, public_person: 0.7, middle_manager: 0.5, low_level_employee: 0.65 },
    params_json: "{}",
    output_json: '["profile","username"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "username_web",
    name: "Username web search",
    type: "search_api",
    methods: ["search"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "shared",
    cost: 0.12,
    reliability: 0.4,
    legal_note: "Quoted username search. Result is a hypothesis until resolved.",
    enabled: 1,
    plugin: "username",
    relevance: { public_top_manager: 0.35, public_person: 0.5, middle_manager: 0.55, low_level_employee: 0.8 },
    params_json: "{}",
    output_json: '["url"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "inn_public",
    name: "Tax ID (INN) — permitted public records only",
    type: "open_data_api",
    methods: ["identifier", "search"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "manual / permitted API",
    cost: 0.2,
    reliability: 0.9,
    legal_note:
      "INN is a strong identifier ONLY from a lawful public source. No closed tax DBs, no unofficial aggregators, no paywall bypass. INN ≠ confirmed position.",
    enabled: 1,
    plugin: "inn",
    relevance: { public_top_manager: 0.5, public_person: 0.4, middle_manager: 0.55, low_level_employee: 0.45 },
    params_json: "{}",
    output_json: '["inn","fio","org"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
  {
    source_id: "duckduckgo",
    name: "DuckDuckGo (open web)",
    type: "search_api",
    methods: ["search"],
    api_available: 0,
    auth_method: "none",
    rate_limit: "html endpoint",
    cost: 0.12,
    reliability: 0.65,
    legal_note: "Public HTML search. Not a people-search DB.",
    enabled: 1,
    plugin: "search",
    relevance: { public_top_manager: 0.7, public_person: 0.7, middle_manager: 0.7, low_level_employee: 0.7 },
    params_json: "{}",
    output_json: '["url","snippet"]',
    relevance_json: "{}",
    methods_json: "[]",
  },
];

export function seedCatalog() {
  for (const s of CATALOG) {
    run(
      `INSERT OR REPLACE INTO source_catalog
       (source_id, name, type, methods_json, api_available, auth_method, rate_limit, cost, reliability, legal_note, enabled, plugin, relevance_json, params_json, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.source_id,
      s.name,
      s.type,
      JSON.stringify(s.methods),
      s.api_available,
      s.auth_method,
      s.rate_limit,
      s.cost,
      s.reliability,
      s.legal_note,
      s.enabled,
      s.plugin,
      JSON.stringify(s.relevance),
      s.params_json,
      s.output_json
    );
  }

  const presets: Array<[string, string, string, string[], string[], string[], string]> = [
    [
      "public_top_manager",
      "PUBLIC_EXECUTIVE",
      "CEO / public top manager — media, YouTube, conferences, reports, archive",
      ["official_website", "news", "youtube", "conference_sites", "annual_reports", "web_archive", "wikipedia"],
      ["official_document", "corporate_email", "unique_id"],
      ["username", "face", "email_local_part"],
      "critical identity + independent evidence, no unresolved critical conflict",
    ],
    [
      "middle_manager",
      "MIDDLE_MANAGER",
      "Deputy / department head — documents, reports, archive, conferences",
      ["document_search", "annual_reports", "official_website", "web_archive", "conference_sites", "youtube", "news"],
      ["staff_list_pdf", "press_release", "corporate_email"],
      ["username", "face"],
      "name+org+position supported by ≥2 independent sources",
    ],
    [
      "low_publicity_person",
      "LOW_PUBLICITY_PERSON",
      "Low public profile — documents, email, username, event lists, archive",
      ["document_search", "username_web", "social_media", "web_archive", "official_website", "image_search"],
      ["corporate_email", "internal_document_publicly_posted"],
      ["same_username", "same_given_name", "face"],
      "do not assert identity on username/face alone",
    ],
    [
      "known_inn",
      "KNOWN_INN",
      "Lawful public tax-id pivot — identifier first, position still needs corroboration",
      ["inn_public", "document_search", "official_website", "web_archive"],
      ["permitted_registry_record"],
      ["name_only"],
      "INN confirms the registry record, not the job title",
    ],
    [
      "known_email",
      "KNOWN_EMAIL",
      "Email pivot — local-part and domain as hypotheses",
      ["username_web", "official_website", "document_search", "social_media", "web_archive"],
      ["corporate_mailbox_on_org_domain"],
      ["local_part_guess"],
      "email local-part is a search hypothesis, not identity proof",
    ],
    [
      "known_photo",
      "KNOWN_PHOTO",
      "Image-led discovery — OCR, EXIF, reverse image, documents",
      ["image_search", "document_search", "web_archive", "official_website"],
      ["embedded_in_named_document"],
      ["face_similarity", "exif_artist"],
      "face/EXIF never auto-confirm identity",
    ],
  ];
  for (const [id, name, description, sources, strong, weak, stop] of presets) {
    run(
      `INSERT OR REPLACE INTO search_presets (preset_id, name, description, sources_json, strong_signals_json, weak_signals_json, stop_when)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      description,
      JSON.stringify(sources),
      JSON.stringify(strong),
      JSON.stringify(weak),
      stop
    );
  }
}

export function listCatalog(): CatalogEntry[] {
  return all<CatalogEntry>(`SELECT * FROM source_catalog ORDER BY name`);
}

export function getCatalog(id: string): CatalogEntry | undefined {
  return get<CatalogEntry>(`SELECT * FROM source_catalog WHERE source_id = ?`, id);
}

export function setCatalogEnabled(id: string, enabled: boolean) {
  run(`UPDATE source_catalog SET enabled = ? WHERE source_id = ?`, enabled ? 1 : 0, id);
  return getCatalog(id);
}

export function relevanceFor(entry: CatalogEntry, target: TargetType): number {
  try {
    const rel = JSON.parse(entry.relevance_json || "{}") as Record<string, number>;
    return rel[target] ?? rel.unknown ?? 0.4;
  } catch {
    return 0.4;
  }
}

export function recordEffectiveness(opts: {
  sourceId: string;
  targetType: string;
  queries?: number;
  hits?: number;
  usefulFacts?: number;
  uniqueFacts?: number;
}) {
  const row = get<{ id: number }>(
    `SELECT id FROM source_effectiveness WHERE source_id = ? AND target_type = ?`,
    opts.sourceId,
    opts.targetType
  );
  if (!row) {
    run(
      `INSERT INTO source_effectiveness (source_id, target_type, queries, successful_hits, useful_facts, unique_facts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      opts.sourceId,
      opts.targetType,
      opts.queries ?? 1,
      opts.hits ?? 0,
      opts.usefulFacts ?? 0,
      opts.uniqueFacts ?? 0,
      nowIso()
    );
    return;
  }
  run(
    `UPDATE source_effectiveness SET
       queries = queries + ?,
       successful_hits = successful_hits + ?,
       useful_facts = useful_facts + ?,
       unique_facts = unique_facts + ?,
       updated_at = ?
     WHERE id = ?`,
    opts.queries ?? 1,
    opts.hits ?? 0,
    opts.usefulFacts ?? 0,
    opts.uniqueFacts ?? 0,
    nowIso(),
    row.id
  );
}
