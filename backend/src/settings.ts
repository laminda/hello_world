import { all, get, nowIso, run } from "./db.js";

export interface AppSettings {
  max_iterations: number;
  respect_robots: boolean;
  llm_base_url: string;
  llm_model: string;
  llm_api_key_set: boolean;
  llm_api_key?: string;
  disabled_tools: string[];
  disabled_modules: string[];
}

const DEFAULTS: Omit<AppSettings, "llm_api_key_set" | "llm_api_key"> = {
  max_iterations: 8,
  respect_robots: true,
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "gpt-4o-mini",
  disabled_tools: [],
  disabled_modules: [],
};

function raw(key: string): string | undefined {
  return get<{ value: string }>(`SELECT value FROM app_settings WHERE key = ?`, key)?.value;
}

export function getSetting(key: string, fallback = ""): string {
  return raw(key) ?? fallback;
}

export function getSettingNumber(key: string, fallback: number): number {
  const v = Number(raw(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parseJson<T>(key: string, fallback: T): T {
  const v = raw(key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export function readSettings(includeSecret = false): AppSettings {
  const key = raw("llm_api_key") || process.env.SVOD_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  return {
    max_iterations: getSettingNumber("max_iterations", DEFAULTS.max_iterations),
    respect_robots: (raw("respect_robots") ?? "1") !== "0",
    llm_base_url: raw("llm_base_url") || process.env.SVOD_LLM_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULTS.llm_base_url,
    llm_model: raw("llm_model") || process.env.SVOD_LLM_MODEL || process.env.OPENAI_MODEL || DEFAULTS.llm_model,
    llm_api_key_set: Boolean(key),
    llm_api_key: includeSecret ? key : undefined,
    disabled_tools: parseJson("disabled_tools", [] as string[]),
    disabled_modules: parseJson("disabled_modules", [] as string[]),
  };
}

export function writeSettings(patch: Record<string, unknown>) {
  const allowed = [
    "max_iterations",
    "respect_robots",
    "llm_base_url",
    "llm_model",
    "llm_api_key",
    "disabled_tools",
    "disabled_modules",
  ];
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    if (k === "llm_api_key" && (v === undefined || v === "" || v === "••••")) continue;
    const stored =
      typeof v === "boolean" ? (v ? "1" : "0") : typeof v === "object" ? JSON.stringify(v) : String(v);
    run(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      k,
      stored,
      nowIso()
    );
    if (k === "llm_api_key") process.env.SVOD_LLM_API_KEY = stored;
    if (k === "llm_base_url") process.env.SVOD_LLM_BASE_URL = stored;
    if (k === "llm_model") process.env.SVOD_LLM_MODEL = stored;
  }
  return readSettings(false);
}

export function isToolEnabled(name: string, module?: string): boolean {
  const s = readSettings();
  if (s.disabled_tools.includes(name)) return false;
  if (module && s.disabled_modules.includes(module)) return false;
  return true;
}

export function listSettingsRows() {
  return all<{ key: string; value: string; updated_at: string }>(`SELECT key, value, updated_at FROM app_settings`);
}

export function clearSetting(key: string) {
  run(`DELETE FROM app_settings WHERE key = ?`, key);
  if (key === "llm_api_key") delete process.env.SVOD_LLM_API_KEY;
}
