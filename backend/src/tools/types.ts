import type { InvestigationInput, SearchHit } from "../types.js";

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export type ToolFamily =
  | "search"
  | "dorks"
  | "identity"
  | "network"
  | "archive"
  | "document"
  | "analysis"
  | "pivot"
  | "llm";

export interface OsintToolMeta {
  name: string;
  module: string;
  family: ToolFamily;
  description: string;
  parameters: JsonSchema;
  legal: string;
  cost: number;
  when: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  hits?: SearchHit[];
  data?: Record<string, unknown>;
  error?: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
  reason: string;
}

export interface ToolContext {
  investigationId?: string;
  input?: InvestigationInput;
}

export interface ToolModule {
  meta: OsintToolMeta;
  execute: (args: Record<string, string>, ctx?: ToolContext) => Promise<ToolResult>;
}

export interface Methodology {
  id: string;
  title: string;
  description: string;
  version: string;
  tools: ToolModule[];
}

export function fail(error: string, summary?: string): ToolResult {
  return { ok: false, error, summary: summary || error };
}

export function ok(summary: string, extra: Partial<ToolResult> = {}): ToolResult {
  return { ok: true, summary, ...extra };
}
