import type { InvestigationListItem, Workspace } from "./types";

export async function listInvestigations(): Promise<InvestigationListItem[]> {
  const r = await fetch("/api/investigations");
  return r.json();
}

export async function createInvestigation(body: Record<string, unknown>) {
  const r = await fetch("/api/investigations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("create failed");
  return r.json() as Promise<{ id: string; title: string; status: string }>;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const r = await fetch(`/api/investigations/${id}/workspace`);
  if (!r.ok) throw new Error("not found");
  return r.json();
}

export async function startInvestigation(id: string) {
  const r = await fetch(`/api/investigations/${id}/start`, { method: "POST" });
  return r.json();
}

export async function stopInvestigation(id: string) {
  const r = await fetch(`/api/investigations/${id}/stop`, { method: "POST" });
  return r.json();
}

export async function runTool(id: string, tool: string, args: Record<string, string>) {
  const r = await fetch(`/api/investigations/${id}/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  return r.json();
}

export async function ingestManual(id: string, body: Record<string, string>) {
  const r = await fetch(`/api/investigations/${id}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function getSettings() {
  const r = await fetch("/api/settings");
  return r.json() as Promise<{
    settings: {
      max_iterations: number;
      respect_robots: boolean;
      llm_base_url: string;
      llm_model: string;
      llm_api_key_set: boolean;
      google_api_key_set: boolean;
      google_cx: string;
      yandex_user: string;
      yandex_api_key_set: boolean;
      disabled_tools: string[];
      disabled_modules: string[];
    };
    llm: { configured: boolean; model: string | null; base_host: string | null };
    search_apis?: { google: { configured: boolean }; yandex: { configured: boolean } };
  }>;
}

export async function putSettings(body: Record<string, unknown>) {
  const r = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function getTools() {
  const r = await fetch("/api/tools");
  return r.json();
}

export async function setCatalogEnabled(id: string, enabled: boolean) {
  const r = await fetch(`/api/catalog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return r.json();
}

export async function getCatalog() {
  const r = await fetch("/api/catalog");
  return r.json() as Promise<{ catalog: CatalogRow[]; connectors: ConnectorRow[] }>;
}

export async function getPresets() {
  const r = await fetch("/api/presets");
  return r.json();
}

export async function createConnector(body: Record<string, unknown>) {
  const r = await fetch("/api/catalog/connectors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export interface CatalogRow {
  source_id: string;
  name: string;
  type: string;
  methods_json: string;
  reliability: number;
  cost: number;
  enabled: number;
  legal_note?: string;
  relevance_json: string;
}

export interface ConnectorRow {
  id: string;
  name: string;
  api_url: string;
  method: string;
  auth_type: string;
  enabled: number;
}

export function subscribeEvents(id: string, onEvent: (ev: unknown) => void) {
  const es = new EventSource(`/api/investigations/${id}/events`);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}
