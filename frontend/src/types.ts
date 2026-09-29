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
}
