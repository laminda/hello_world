export type InvestigationStatus =
  | "draft"
  | "running"
  | "paused"
  | "complete"
  | "failed";

export type FactStatus =
  | "OBSERVED"
  | "HYPOTHESIS"
  | "SUPPORTED"
  | "CONFIRMED"
  | "CONFLICT"
  | "UNVERIFIED"
  | "REJECTED";

export type QueryClass =
  | "IDENTITY"
  | "POSITION"
  | "BIOGRAPHY"
  | "DOCUMENT"
  | "ARCHIVE"
  | "CONTACT"
  | "EMAIL"
  | "IMAGE"
  | "ORGANIZATION"
  | "TIMELINE";

export type EntityKind =
  | "PERSON"
  | "ORGANIZATION"
  | "LOCATION"
  | "DOCUMENT"
  | "IMAGE"
  | "SOURCE"
  | "EVENT"
  | "POSITION"
  | "PROJECT"
  | "EMAIL"
  | "PHONE"
  | "USERNAME";

export type SourceType =
  | "url"
  | "archive"
  | "official_site"
  | "media"
  | "document"
  | "social"
  | "search"
  | "wikipedia"
  | "user_upload"
  | "demo";

export interface InvestigationInput {
  full_name?: string;
  name?: string;
  middle_name?: string;
  last_name?: string;
  position?: string;
  organization?: string;
  city?: string;
  age?: number;
  birth_year?: number;
  url?: string;
  email?: string;
  phone?: string;
  username?: string;
  notes?: string;
  inn?: string;
}

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  provider: string;
  rank: number;
}

export interface AgentEvent {
  ts: string;
  level: "info" | "search" | "extract" | "graph" | "warn" | "success" | "conflict";
  message: string;
  data?: Record<string, unknown>;
}

export interface ActionScore {
  action: PlannedAction;
  information_gain: number;
  source_quality: number;
  identity_relevance: number;
  cost: number;
  duplicate_probability: number;
  score: number;
}

export interface PlannedAction {
  type:
    | "search"
    | "fetch_url"
    | "crawl_site"
    | "archive_lookup"
    | "extract_document"
    | "resolve_conflict"
    | "generate_aliases"
    | "stop";
  query?: string;
  queryClass?: QueryClass;
  url?: string;
  reason: string;
  provider?: string;
}
