/**
 * Optional OpenAI-compatible LLM. Used only as tools:
 * classify, interpret public text, propose strategy, suggest dorks, disambiguate.
 * Never invents sources. Disabled unless API key is set.
 */
import { readSettings } from "../settings.js";
export interface LlmStatus {
  configured: boolean;
  model: string | null;
  base_host: string | null;
}

function live() {
  try {
    return readSettings(true);
  } catch {
    return null;
  }
}

function baseUrl() {
  return (
    live()?.llm_base_url ||
    process.env.SVOD_LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
}

function apiKey() {
  return live()?.llm_api_key || process.env.SVOD_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
}

function model() {
  return live()?.llm_model || process.env.SVOD_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function llmStatus(): LlmStatus {
  const key = apiKey();
  let host: string | null = null;
  try {
    host = new URL(baseUrl()).host;
  } catch {
    host = null;
  }
  return { configured: Boolean(key), model: key ? model() : null, base_host: key ? host : null };
}

export const OSINT_SYSTEM = `You are an OSINT analyst copilot inside SVOD.
Rules:
- Use only the text the user provides. Do not invent URLs, dates, employers, or titles.
- Direct quote → OBSERVED. Inference → HYPOTHESIS. Need 2+ independent sources → SUPPORTED.
- Same name / username / face / email local-part ≠ same person.
- Organization INN ≠ personal INN. INN ≠ job title.
- Old document ≠ current position.
- Copypaste of one press release ≠ independent sources.
- Do not merge homonyms.
- Do not recommend logging in, scraping behind auth, unofficial tax DBs, or paywall bypass.
- Reply with JSON only.`;

export async function chatJson(user: string, extraSystem?: string): Promise<{ ok: boolean; json?: Record<string, unknown>; error?: string; raw?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: "LLM not configured (set SVOD_LLM_API_KEY or OPENAI_API_KEY)" };
  const url = `${baseUrl()}/chat/completions`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model(),
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: extraSystem ? `${OSINT_SYSTEM}\n${extraSystem}` : OSINT_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `LLM HTTP ${res.status}: ${text.slice(0, 240)}` };
    let content = "";
    try {
      const body = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
      content = body.choices?.[0]?.message?.content || "";
    } catch {
      return { ok: false, error: "LLM response not JSON envelope" };
    }
    try {
      return { ok: true, json: JSON.parse(content) as Record<string, unknown>, raw: content };
    } catch {
      return { ok: false, error: "model did not return JSON object", raw: content };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}
