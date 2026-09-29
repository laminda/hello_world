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
