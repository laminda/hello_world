import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const DATA_DIR = process.env.SVOD_DATA_DIR || path.join(ROOT, "data");
export const ASSETS = {
  original: path.join(DATA_DIR, "assets", "original"),
  thumbnail: path.join(DATA_DIR, "assets", "thumbnail"),
  ocr: path.join(DATA_DIR, "assets", "ocr"),
  faces: path.join(DATA_DIR, "assets", "faces"),
  previews: path.join(DATA_DIR, "assets", "previews"),
  documents: path.join(DATA_DIR, "assets", "documents"),
};

for (const dir of [DATA_DIR, ...Object.values(ASSETS)]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "svod.db");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stop_reason TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS investigation_inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id)
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'HYPOTHESIS',
  meta_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (investigation_id) REFERENCES investigations(id)
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  source_type TEXT NOT NULL,
  title TEXT,
  publisher TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  archived_at TEXT,
  hash TEXT,
  content_hash TEXT,
  http_status INTEGER,
  mime_type TEXT,
  independence TEXT DEFAULT 'unknown',
  copied_from TEXT,
  snippet TEXT,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id)
);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  archive_url TEXT,
  snapshot_date TEXT,
  status INTEGER,
  mime TEXT,
  content_path TEXT,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  source_id TEXT,
  filename TEXT,
  mime_type TEXT,
  size INTEGER,
  sha256 TEXT,
  md5 TEXT,
  created_at TEXT,
  modified_at TEXT,
  document_date TEXT,
  language TEXT,
  page_count INTEGER,
  storage_path TEXT,
  extracted_text TEXT,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id)
);

CREATE TABLE IF NOT EXISTS document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  text TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  document_id TEXT,
  source_id TEXT,
  original_url TEXT,
  storage_path TEXT,
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  created_at TEXT,
  caption TEXT
);

CREATE TABLE IF NOT EXISTS image_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  source TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS faces (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  bbox_json TEXT NOT NULL,
  embedding_note TEXT,
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS ocr_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT,
  document_id TEXT,
  text TEXT NOT NULL,
  confidence REAL,
  bbox_json TEXT,
  language TEXT
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  subject_entity_id TEXT,
  predicate TEXT NOT NULL,
  object_entity_id TEXT,
  value TEXT,
  valid_from TEXT,
  valid_to TEXT,
  document_date TEXT,
  publication_date TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OBSERVED',
  confidence REAL NOT NULL DEFAULT 0.5,
  extract TEXT,
  page INTEGER
);

CREATE TABLE IF NOT EXISTS fact_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  document_id TEXT,
  extract TEXT,
  page INTEGER
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  label TEXT,
  confidence REAL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  entity_id TEXT,
  date TEXT NOT NULL,
  date_precision TEXT DEFAULT 'year',
  event TEXT NOT NULL,
  source_id TEXT,
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'OBSERVED'
);

CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  query TEXT NOT NULL,
  engine TEXT NOT NULL,
  query_class TEXT,
  reason TEXT,
  executed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  provider TEXT,
  rank INTEGER,
  selected INTEGER DEFAULT 0,
  selection_reason TEXT
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence REAL DEFAULT 0.4,
  status TEXT DEFAULT 'HYPOTHESIS',
  evidence TEXT
);

CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  field TEXT NOT NULL,
  values_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNRESOLVED',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_facts_inv ON facts(investigation_id);
CREATE INDEX IF NOT EXISTS idx_sources_inv ON sources(investigation_id);
CREATE INDEX IF NOT EXISTS idx_entities_inv ON entities(investigation_id);
CREATE INDEX IF NOT EXISTS idx_actions_inv ON investigation_actions(investigation_id);

CREATE TABLE IF NOT EXISTS source_catalog (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  methods_json TEXT NOT NULL DEFAULT '[]',
  api_available INTEGER NOT NULL DEFAULT 0,
  auth_method TEXT DEFAULT 'none',
  rate_limit TEXT,
  cost REAL DEFAULT 0.15,
  reliability REAL DEFAULT 0.7,
  legal_note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  plugin TEXT,
  relevance_json TEXT NOT NULL DEFAULT '{}',
  params_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS search_presets (
  preset_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sources_json TEXT NOT NULL,
  strong_signals_json TEXT NOT NULL DEFAULT '[]',
  weak_signals_json TEXT NOT NULL DEFAULT '[]',
  stop_when TEXT
);

CREATE TABLE IF NOT EXISTS source_effectiveness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  queries INTEGER DEFAULT 0,
  successful_hits INTEGER DEFAULT 0,
  useful_facts INTEGER DEFAULT 0,
  unique_facts INTEGER DEFAULT 0,
  false_positive_rate REAL DEFAULT 0,
  time_cost REAL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS identifiers (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'OBSERVED',
  source TEXT,
  confidence REAL DEFAULT 0.5,
  note TEXT
);

CREATE TABLE IF NOT EXISTS inferences (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 2,
  input_fact TEXT,
  inference_json TEXT NOT NULL,
  confidence REAL DEFAULT 0.4,
  status TEXT NOT NULL DEFAULT 'HYPOTHESIS',
  reason TEXT
);

CREATE TABLE IF NOT EXISTS pivots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  from_kind TEXT NOT NULL,
  from_value TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_value TEXT NOT NULL,
  reason TEXT,
  confidence REAL DEFAULT 0.4,
  status TEXT DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  auth_type TEXT DEFAULT 'none',
  headers_json TEXT DEFAULT '{}',
  request_template TEXT,
  response_mapping_json TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  legal_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_hints (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'USER_HINT',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  target_type TEXT,
  preset_id TEXT,
  recommendation_json TEXT,
  selected_source TEXT,
  score REAL
);
`);

function ensureColumn(table: string, column: string, def: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch {
    /* already exists */
  }
}

ensureColumn("investigations", "target_type", "TEXT");
ensureColumn("investigations", "preset_id", "TEXT");
ensureColumn("facts", "temporal_relevance", "TEXT DEFAULT 'UNKNOWN'");
ensureColumn("facts", "extraction_confidence", "REAL");
ensureColumn("facts", "source_reliability", "REAL");
ensureColumn("facts", "entity_match", "REAL");
ensureColumn("facts", "independence_score", "REAL");
ensureColumn("hypotheses", "hyp_type", "TEXT");
ensureColumn("hypotheses", "level", "INTEGER DEFAULT 3");
ensureColumn("hypotheses", "reason", "TEXT");
ensureColumn("hypotheses", "supporting_json", "TEXT");
ensureColumn("hypotheses", "contradicting_json", "TEXT");
ensureColumn("hypotheses", "source_id", "TEXT");
ensureColumn("sources", "catalog_id", "TEXT");
ensureColumn("sources", "reliability", "REAL");
ensureColumn("search_queries", "source_id", "TEXT");
ensureColumn("search_queries", "target_type", "TEXT");
ensureColumn("search_queries", "error_class", "TEXT");
ensureColumn("search_queries", "hits_count", "INTEGER DEFAULT 0");
ensureColumn("search_queries", "ingested", "INTEGER DEFAULT 0");
ensureColumn("search_queries", "facts_delta", "INTEGER DEFAULT 0");
ensureColumn("search_queries", "candidates_delta", "INTEGER DEFAULT 0");

db.exec(`
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT,
  reason TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  result_summary TEXT,
  hits INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_tools_inv ON tool_calls(investigation_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS person_candidates (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  position TEXT,
  city TEXT,
  extract TEXT,
  source_id TEXT,
  match_json TEXT,
  same_person TEXT NOT NULL DEFAULT 'insufficient',
  confidence REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cand_inv ON person_candidates(investigation_id);

CREATE TABLE IF NOT EXISTS search_funnel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  tool TEXT,
  query TEXT,
  engine TEXT,
  error_class TEXT,
  hits INTEGER DEFAULT 0,
  classified_json TEXT,
  ingested INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  facts_delta INTEGER DEFAULT 0,
  candidates_delta INTEGER DEFAULT 0,
  duration_ms INTEGER,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_funnel_inv ON search_funnel(investigation_id);
`);

ensureColumn("tool_calls", "error_class", "TEXT");
ensureColumn("tool_calls", "facts_delta", "INTEGER DEFAULT 0");
ensureColumn("tool_calls", "candidates_delta", "INTEGER DEFAULT 0");
ensureColumn("tool_calls", "ingested", "INTEGER DEFAULT 0");
ensureColumn("tool_calls", "funnel_json", "TEXT");

export function nowIso() {
  return new Date().toISOString();
}

export function padId(prefix: string, n: number, width = 6) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export function nextId(prefix: string, table: string, width = 6): string {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return padId(prefix, Number(row.c) + 1, width);
}

export function logAction(
  investigationId: string,
  level: string,
  message: string,
  data?: unknown
) {
  db.prepare(
    `INSERT INTO investigation_actions (investigation_id, ts, level, message, data_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(investigationId, nowIso(), level, message, data ? JSON.stringify(data) : null);
}

export function audit(action: string, target?: string, detail?: string, actor = "system") {
  db.prepare(
    `INSERT INTO audit_log (ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)`
  ).run(nowIso(), actor, action, target ?? null, detail ?? null);
}

export function toObj<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return (db.prepare(sql).all(...(params as never[])) as object[]).map((r) => ({ ...r })) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = db.prepare(sql).get(...(params as never[])) as object | undefined;
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}
