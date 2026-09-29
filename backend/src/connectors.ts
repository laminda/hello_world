import { all, get, nowIso, run } from "./db.js";
import { isPublicHttpUrl } from "./crawler.js";
import { httpGet, USER_AGENT } from "./search.js";
import type { SearchHit } from "./types.js";

function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function listConnectors() {
  return all<Record<string, unknown>>(`SELECT id, name, api_url, method, auth_type, enabled, legal_note, created_at FROM connectors`);
}

export function createConnector(body: {
  name: string;
  api_url: string;
  method?: string;
  auth_type?: string;
  headers?: Record<string, string>;
  request_template?: string;
  response_mapping?: Record<string, string>;
  legal_note?: string;
}) {
  if (!isPublicHttpUrl(body.api_url)) {
    throw new Error("Connector URL must be public http(s) — localhost and private nets are blocked");
  }
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM connectors`)!.c;
  const id = `CON-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO connectors (id, name, api_url, method, auth_type, headers_json, request_template, response_mapping_json, enabled, legal_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    body.name,
    body.api_url,
    (body.method || "GET").toUpperCase(),
    body.auth_type || "none",
    JSON.stringify(body.headers || {}),
    body.request_template ?? '{"query":"{{QUERY}}"}',
    JSON.stringify(body.response_mapping || { title: "title", url: "url", snippet: "snippet" }),
    body.legal_note ?? "Admin-defined public API. Keys stay on this host.",
    nowIso()
  );
  run(
    `INSERT OR REPLACE INTO source_catalog
     (source_id, name, type, methods_json, api_available, auth_method, cost, reliability, legal_note, enabled, plugin, relevance_json, params_json, output_json)
     VALUES (?, ?, 'custom_http_api', '["search"]', 1, ?, 0.2, 0.5, ?, 1, 'custom', '{}', '{}', '["mapped"]')`,
    id,
    body.name,
    body.auth_type || "none",
    body.legal_note ?? "custom connector"
  );
  return id;
}

export async function runConnector(id: string, query: string, apiKey?: string): Promise<SearchHit[]> {
  const c = get<{
    api_url: string;
    method: string;
    auth_type: string;
    headers_json: string;
    request_template: string;
    response_mapping_json: string;
    enabled: number;
  }>(`SELECT * FROM connectors WHERE id = ?`, id);
  if (!c || !c.enabled) return [];
  if (!isPublicHttpUrl(c.api_url)) return [];
  const headers = JSON.parse(c.headers_json || "{}") as Record<string, string>;
  const filled: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    filled[k] = v.replaceAll("{{API_KEY}}", apiKey || process.env.SVOD_CONNECTOR_KEY || "");
  }
  filled["User-Agent"] = USER_AGENT;
  const url = c.api_url.includes("{{QUERY}}")
    ? c.api_url.replaceAll("{{QUERY}}", encodeURIComponent(query))
    : c.api_url;
  let text = "";
  if (c.method === "GET") {
    const res = await httpGet(url);
    if (!res.ok) return [];
    text = res.text;
  } else {
    const body = (c.request_template || "{}").replaceAll("{{QUERY}}", query);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: c.method,
        headers: { "Content-Type": "application/json", ...filled },
        body,
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch {
      return [];
    } finally {
      clearTimeout(t);
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const mapping = JSON.parse(c.response_mapping_json || "{}") as Record<string, string>;
  const rows = Array.isArray(json)
    ? json
    : Array.isArray((json as { results?: unknown[] }).results)
      ? (json as { results: unknown[] }).results
      : Array.isArray((json as { data?: unknown[] }).data)
        ? (json as { data: unknown[] }).data
        : [json];
  return rows.slice(0, 12).map((row, i) => ({
    url: String(pick(row, mapping.url || "url") || ""),
    title: String(pick(row, mapping.title || mapping.name || "title") || "untitled"),
    snippet: String(pick(row, mapping.snippet || mapping.birth_date || mapping.organization || "snippet") || ""),
    provider: id,
    rank: i + 1,
  })).filter((h) => h.url.startsWith("http"));
}
