export type FactStatus =
  | "OBSERVED"
  | "HYPOTHESIS"
  | "SUPPORTED"
  | "CONFIRMED"
  | "CONFLICT"
  | "UNVERIFIED"
  | "REJECTED";

export interface InvestigationListItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_demo: number;
  facts: number;
  sources: number;
  conflicts: number;
}

export interface Workspace {
  investigation: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
    stop_reason?: string;
    is_demo: number;
  };
  inputs: Array<{ field: string; value: string }>;
  facts: Array<{
    id: string;
    predicate: string;
    value: string;
    status: FactStatus;
    confidence: number;
    extract?: string;
    page?: number;
    valid_from?: string;
    valid_to?: string;
    document_date?: string;
    subject_entity_id?: string;
    object_entity_id?: string;
    temporal_relevance?: string;
    extraction_confidence?: number;
    source_reliability?: number;
    entity_match?: number;
    independence_score?: number;
  }>;
  factSources: Array<{
    fact_id: string;
    source_id: string;
    document_id?: string;
    extract?: string;
    page?: number;
  }>;
  sources: Array<{
    id: string;
    url?: string;
    domain?: string;
    source_type: string;
    title?: string;
    publisher?: string;
    published_at?: string;
    discovered_at: string;
    snippet?: string;
    independence?: string;
    copied_from?: string;
    http_status?: number;
  }>;
  documents: Array<{
    id: string;
    source_id?: string;
    filename?: string;
    mime_type?: string;
    size?: number;
    sha256?: string;
    md5?: string;
    document_date?: string;
    language?: string;
    page_count?: number;
    extracted_text?: string;
  }>;
  images: Array<{
    id: string;
    document_id?: string;
    source_id?: string;
    original_url?: string;
    storage_path?: string;
    sha256?: string;
    width?: number;
    height?: number;
    caption?: string;
  }>;
  metadata: Array<{ image_id: string; key: string; value: string; source: string }>;
  faces: Array<{ id: string; image_id: string; bbox_json: string }>;
  ocr: Array<{ image_id?: string; document_id?: string; text: string; confidence: number; bbox_json?: string }>;
  entities: Array<{
    id: string;
    kind: string;
    canonical_name: string;
    confidence: number;
    status: string;
  }>;
  aliases: Array<{ entity_id: string; alias: string; confidence: number; evidence?: string }>;
  timeline: Array<{
    id: string;
    date: string;
    event: string;
    source_id?: string;
    confidence: number;
    status: string;
  }>;
  contradictions: Array<{ id: string; field: string; values_json: string; status: string }>;
  hypotheses: Array<{ id: string; statement: string; confidence: number; status: string }>;
  actions: Array<{ id: number; ts: string; level: string; message: string }>;
  toolCalls?: Array<{
    id: string;
    ts: string;
    tool: string;
    args_json?: string;
    reason?: string;
    ok: number;
    result_summary?: string;
    hits?: number;
    duration_ms?: number;
    error?: string;
  }>;
  tools?: Array<{ name: string; family: string; description: string; legal: string; when: string }>;
  metrics?: {
    pct: number;
    facts: number;
    observed: number;
    sources: number;
    independent: number;
    tools: number;
    toolsOk: number;
    queries: number;
    conflicts: number;
    checks: Array<{ id: string; label: string; ok: boolean }>;
  };
  queries: Array<{
    id: string;
    query: string;
    engine: string;
    query_class?: string;
    reason?: string;
    executed_at: string;
  }>;
  results: Array<{
    query_id: string;
    url: string;
    title?: string;
    snippet?: string;
    provider?: string;
    rank?: number;
    selected?: number;
    selection_reason?: string;
  }>;
  snapshots: Array<{ id: string; source_id: string; archive_url?: string; snapshot_date?: string }>;
  graph: {
    entities: Array<{ id: string; kind: string; canonical_name: string; confidence: number; status: string }>;
    relationships: Array<{ from_id: string; to_id: string; rel_type: string; label: string; confidence: number }>;
    facts: Array<{ id: string; predicate: string; value: string; status: string }>;
  };
  evidenceSummary: Array<{
    label: string;
    predicate: string;
    status: string;
    confidence: number;
    value: string;
  }>;
  inferences?: Array<Record<string, unknown>>;
  identifiers?: Array<{
    id: string;
    kind: string;
    value: string;
    priority: string;
    status: string;
    confidence: number;
    note?: string;
  }>;
  pivots?: Array<{
    from_kind: string;
    from_value: string;
    to_kind: string;
    to_value: string;
    reason: string;
    confidence: number;
    status: string;
  }>;
  pivotGraph?: {
    nodes: Array<{ id: string; kind: string; label: string }>;
    edges: Array<{ from: string; to: string; reason: string; confidence: number }>;
    identifiers: Array<{ kind: string; value: string; priority: string; status: string }>;
  };
  hints?: Array<{ id: string; kind: string; value: string; note?: string; status: string }>;
  strategy?: {
    profile: {
      targetType: string;
      presetId: string;
      publicity: string;
      reasons: string[];
      known: string[];
      unknown: string[];
    };
    scored: Array<{
      source_id: string;
      name: string;
      score: number;
      target_relevance: number;
      source_reliability: number;
      information_gain: number;
      cost: number;
      false_positive_risk: number;
      reason: string;
      legal_note?: string | null;
    }>;
    target_type?: string;
    preset_id?: string;
    preset?: { name?: string; description?: string; sources_json?: string; stop_when?: string };
    effectiveness?: Array<Record<string, unknown>>;
  };
}
