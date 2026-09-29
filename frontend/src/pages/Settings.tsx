import { FormEvent, useEffect, useState } from "react";
import { getSettings, getTools, putSettings } from "../api";

export default function Settings() {
  const [form, setForm] = useState({
    max_iterations: 8,
    respect_robots: true,
    llm_base_url: "https://api.openai.com/v1",
    llm_model: "gpt-4o-mini",
    llm_api_key: "",
    llm_api_key_set: false,
    google_api_key: "",
    google_api_key_set: false,
    google_cx: "",
    yandex_user: "",
    yandex_api_key: "",
    yandex_api_key_set: false,
    disabled_tools: [] as string[],
    disabled_modules: [] as string[],
  });
  const [tools, setTools] = useState<Array<{ name: string; module: string; description: string }>>([]);
  const [modules, setModules] = useState<Array<{ id: string; title: string }>>([]);
  const [msg, setMsg] = useState("");
  const [llm, setLlm] = useState<{ configured: boolean; model: string | null; base_host: string | null } | null>(null);
  const [searchApis, setSearchApis] = useState<{ google: { configured: boolean }; yandex: { configured: boolean } } | null>(
    null
  );

  const load = () => {
    getSettings().then((d) => {
      setForm({
        ...form,
        ...d.settings,
        llm_api_key: "",
        google_api_key: "",
        yandex_api_key: "",
      });
      setLlm(d.llm);
      if (d.search_apis) setSearchApis(d.search_apis);
    });
    getTools().then((d) => {
      setTools(d.tools || []);
      setModules(d.methodologies || []);
    });
  };
  useEffect(load, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await putSettings({
      max_iterations: Number(form.max_iterations),
      respect_robots: form.respect_robots,
      llm_base_url: form.llm_base_url,
      llm_model: form.llm_model,
      llm_api_key: form.llm_api_key,
      google_api_key: form.google_api_key,
      google_cx: form.google_cx,
      yandex_user: form.yandex_user,
      yandex_api_key: form.yandex_api_key,
      disabled_tools: form.disabled_tools,
      disabled_modules: form.disabled_modules,
    });
    setMsg("Сохранено");
    setLlm(r.llm);
    if (r.search_apis) setSearchApis(r.search_apis);
    setForm({
      ...form,
      llm_api_key: "",
      llm_api_key_set: r.settings.llm_api_key_set,
      google_api_key: "",
      google_api_key_set: r.settings.google_api_key_set,
      google_cx: r.settings.google_cx,
      yandex_user: r.settings.yandex_user,
      yandex_api_key: "",
      yandex_api_key_set: r.settings.yandex_api_key_set,
    });
  };

  const toggle = (list: string[], name: string) =>
    list.includes(name) ? list.filter((x) => x !== name) : [...list, name];

  return (
    <div className="page">
      <div className="kicker">Control plane</div>
      <h1 style={{ marginBottom: 8 }}>Настройки системы</h1>
      <p className="muted" style={{ maxWidth: 720, marginBottom: 16 }}>
        Управление агентом, LLM и включёнными OSINT-модулями. Ключ API хранится только на этом хосте, в ответах не
        показывается.
      </p>
      <form className="card form" style={{ maxWidth: 860 }} onSubmit={onSubmit}>
        <label>
          Max iterations агента
          <input
            type="number"
            min={1}
            max={30}
            value={form.max_iterations}
            onChange={(e) => setForm({ ...form, max_iterations: Number(e.target.value) })}
          />
        </label>
        <label>
          robots.txt
          <select
            value={form.respect_robots ? "1" : "0"}
            onChange={(e) => setForm({ ...form, respect_robots: e.target.value === "1" })}
          >
            <option value="1">соблюдать (обязательно для public crawl)</option>
            <option value="0">не выключать — поле зарезервировано, crawl всё равно проверяет robots</option>
          </select>
        </label>
        <label>
          LLM base URL
          <input value={form.llm_base_url} onChange={(e) => setForm({ ...form, llm_base_url: e.target.value })} />
        </label>
        <label>
          LLM model
          <input value={form.llm_model} onChange={(e) => setForm({ ...form, llm_model: e.target.value })} />
        </label>
        <label className="wide">
          LLM API key {form.llm_api_key_set ? <span className="badge st-SUPPORTED">set</span> : <span className="badge st-HYPOTHESIS">empty</span>}
          <input
            type="password"
            placeholder={form.llm_api_key_set ? "••••••••  (оставьте пустым, чтобы не менять)" : "sk-… или ключ совместимого API"}
            value={form.llm_api_key}
            onChange={(e) => setForm({ ...form, llm_api_key: e.target.value })}
          />
        </label>
        <label>
          Google CSE CX (Search Engine ID)
          <input
            placeholder="cx…"
            value={form.google_cx}
            onChange={(e) => setForm({ ...form, google_cx: e.target.value })}
          />
        </label>
        <label>
          Google API key {form.google_api_key_set ? <span className="badge st-SUPPORTED">set</span> : <span className="badge st-HYPOTHESIS">empty</span>}
          <input
            type="password"
            placeholder={form.google_api_key_set ? "••••  (пустое = не менять)" : "AIza… Custom Search JSON API"}
            value={form.google_api_key}
            onChange={(e) => setForm({ ...form, google_api_key: e.target.value })}
          />
        </label>
        <label>
          Yandex user
          <input
            placeholder="логин XML API"
            value={form.yandex_user}
            onChange={(e) => setForm({ ...form, yandex_user: e.target.value })}
          />
        </label>
        <label>
          Yandex API key {form.yandex_api_key_set ? <span className="badge st-SUPPORTED">set</span> : <span className="badge st-HYPOTHESIS">empty</span>}
          <input
            type="password"
            placeholder={form.yandex_api_key_set ? "••••  (пустое = не менять)" : "ключ Yandex Search XML"}
            value={form.yandex_api_key}
            onChange={(e) => setForm({ ...form, yandex_api_key: e.target.value })}
          />
        </label>
        <p className="wide legal">
          Google: Programmable Search JSON API (ключ + CX). Yandex: официальный Search XML (user + key). Сниппеты
          публичного индекса, без обхода логина и paywall. Ключи только на этом хосте.
        </p>
        <div className="wide">
          <div className="kicker">Модули (выключить = агент не вызывает)</div>
          <div className="chip-row">
            {modules.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`chip ${form.disabled_modules.includes(m.id) ? "off" : "on"}`}
                onClick={() => setForm({ ...form, disabled_modules: toggle(form.disabled_modules, m.id) })}
              >
                {m.title}
              </button>
            ))}
          </div>
        </div>
        <div className="wide">
          <div className="kicker">Отдельные tools</div>
          <div className="chip-row" style={{ maxHeight: 160, overflow: "auto" }}>
            {tools.map((t) => (
              <button
                type="button"
                key={t.name}
                className={`chip ${form.disabled_tools.includes(t.name) ? "off" : "on"}`}
                title={t.description}
                onClick={() => setForm({ ...form, disabled_tools: toggle(form.disabled_tools, t.name) })}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <span className="small muted">
            LLM {llm?.configured ? `on · ${llm.model} @ ${llm.base_host}` : "off"}
            {searchApis ? ` · Google ${searchApis.google.configured ? "on" : "off"} · Yandex ${searchApis.yandex.configured ? "on" : "off"}` : ""}
            {msg ? ` · ${msg}` : ""}
          </span>
          <button className="btn primary">Сохранить</button>
        </div>
      </form>
    </div>
  );
}
