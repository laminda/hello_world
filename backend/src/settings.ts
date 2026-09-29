import { all, get, nowIso, run } from "./db.js";

export interface AppSettings {
  max_iterations: number;
  respect_robots: boolean;
  llm_base_url: string;
  llm_model: string;
  llm_api_key_set: boolean;
  llm_api_key?: string;
  google_api_key_set: boolean;
  google_cx: string;
  google_api_key?: string;
  yandex_user: string;
  yandex_api_key_set: boolean;
  yandex_api_key?: string;
  disabled_tools: string[];
  disabled_modules: string[];
}

const DEFAULTS = {
  max_iterations: 8,
  respect_robots: true,
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "gpt-4o-mini",
  disabled_tools: [] as string[],
  disabled_modules: [] as string[],
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
  const gKey = raw("google_api_key") || process.env.SVOD_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || "";
  const gCx = raw("google_cx") || process.env.SVOD_GOOGLE_CX || process.env.GOOGLE_CSE_ID || "";
  const yUser = raw("yandex_user") || process.env.SVOD_YANDEX_USER || process.env.YANDEX_USER || "";
  const yKey = raw("yandex_api_key") || process.env.SVOD_YANDEX_API_KEY || process.env.YANDEX_API_KEY || "";
  return {
    max_iterations: getSettingNumber("max_iterations", DEFAULTS.max_iterations),
    respect_robots: (raw("respect_robots") ?? "1") !== "0",
    llm_base_url: raw("llm_base_url") || process.env.SVOD_LLM_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULTS.llm_base_url,
    llm_model: raw("llm_model") || process.env.SVOD_LLM_MODEL || process.env.OPENAI_MODEL || DEFAULTS.llm_model,
    llm_api_key_set: Boolean(key),
    llm_api_key: includeSecret ? key : undefined,
    google_api_key_set: Boolean(gKey),
    google_cx: gCx,
    google_api_key: includeSecret ? gKey : undefined,
    yandex_user: yUser,
    yandex_api_key_set: Boolean(yKey),
    yandex_api_key: includeSecret ? yKey : undefined,
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
    "google_api_key",
    "google_cx",
    "yandex_user",
    "yandex_api_key",
    "disabled_tools",
    "disabled_modules",
  ];
  const secrets = new Set(["llm_api_key", "google_api_key", "yandex_api_key"]);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    if (secrets.has(k) && (v === undefined || v === "" || v === "••••")) continue;
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
    if (k === "google_api_key") process.env.SVOD_GOOGLE_API_KEY = stored;
    if (k === "google_cx") process.env.SVOD_GOOGLE_CX = stored;
    if (k === "yandex_user") process.env.SVOD_YANDEX_USER = stored;
    if (k === "yandex_api_key") process.env.SVOD_YANDEX_API_KEY = stored;
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
  if (key === "google_api_key") delete process.env.SVOD_GOOGLE_API_KEY;
  if (key === "google_cx") delete process.env.SVOD_GOOGLE_CX;
  if (key === "yandex_user") delete process.env.SVOD_YANDEX_USER;
  if (key === "yandex_api_key") delete process.env.SVOD_YANDEX_API_KEY;
}
