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
    disabled_tools: [] as string[],
    disabled_modules: [] as string[],
  });
  const [tools, setTools] = useState<Array<{ name: string; module: string; description: string }>>([]);
  const [modules, setModules] = useState<Array<{ id: string; title: string }>>([]);
  const [msg, setMsg] = useState("");
  const [llm, setLlm] = useState<{ configured: boolean; model: string | null; base_host: string | null } | null>(null);

  const load = () => {
    getSettings().then((d) => {
      setForm({
        ...form,
        ...d.settings,
        llm_api_key: "",
      });
      setLlm(d.llm);
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
      disabled_tools: form.disabled_tools,
      disabled_modules: form.disabled_modules,
    });
    setMsg("Сохранено");
    setLlm(r.llm);
    setForm({ ...form, llm_api_key: "", llm_api_key_set: r.settings.llm_api_key_set });
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
            {msg ? ` · ${msg}` : ""}
          </span>
          <button className="btn primary">Сохранить</button>
        </div>
      </form>
    </div>
  );
}
