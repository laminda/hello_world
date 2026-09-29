import { useEffect, useMemo, useState } from "react";

interface Tool {
  name: string;
  module: string;
  family: string;
  description: string;
  parameters: { properties: Record<string, { type: string; description?: string }>; required?: string[] };
  legal: string;
  cost: number;
  when: string;
}

interface Methodology {
  id: string;
  title: string;
  description: string;
  version: string;
  tools: string[];
}

const FAMILY: Record<string, string> = {
  dorks: "Search dorks",
  search: "Search",
  identity: "Identity",
  network: "Network / DNS / CT",
  archive: "Archive",
  document: "Documents",
  analysis: "Analysis",
  pivot: "Pivots",
  llm: "LLM copilot",
};

export default function Tools() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [methods, setMethods] = useState<Methodology[]>([]);
  const [llm, setLlm] = useState<{ configured: boolean; model: string | null; base_host: string | null } | null>(null);
  const [view, setView] = useState<"modules" | "tools">("modules");

  useEffect(() => {
    fetch("/api/tools")
      .then((r) => r.json())
      .then((d) => {
        setTools(d.tools || []);
        setMethods(d.methodologies || []);
        setLlm(d.llm || null);
      });
  }, []);

  const groups = useMemo(() => {
    const g: Record<string, Tool[]> = {};
    for (const t of tools) (g[t.family] ||= []).push(t);
    return g;
  }, [tools]);

  return (
    <div className="page">
      <div className="kicker">Agent toolbelt · modular OSINT</div>
      <h1 style={{ marginBottom: 8 }}>OSINT modules</h1>
      <p className="muted" style={{ maxWidth: 760, marginBottom: 14 }}>
        Каждая методика — отдельный модуль (name + JSON schema + execute). Агент выбирает tool, вызывает, пишет
        observation. Модуль можно дорабатывать независимо. LLM — опциональный OpenAI-compatible API, не обязателен.
      </p>
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        <button className={view === "modules" ? "btn" : "btn ghost"} onClick={() => setView("modules")}>
          Методики
        </button>
        <button className={view === "tools" ? "btn" : "btn ghost"} onClick={() => setView("tools")}>
          Все tools
        </button>
        <span className={`badge ${llm?.configured ? "st-SUPPORTED" : "st-HYPOTHESIS"}`}>
          LLM {llm?.configured ? `on · ${llm.model} @ ${llm.base_host}` : "off — set SVOD_LLM_API_KEY"}
        </span>
      </div>

      {view === "modules" && (
        <div className="inv-grid">
          {methods.map((m) => (
            <div className="card inv-card" key={m.id} style={{ cursor: "default" }}>
              <div className="flex">
                <span className="mono small" style={{ color: "var(--gold)" }}>
                  {m.id}
                </span>
                <span className="badge st-OBSERVED">v{m.version}</span>
              </div>
              <h3 style={{ fontSize: 16, marginTop: 8 }}>{m.title}</h3>
              <p className="small muted">{m.description}</p>
              <div className="small" style={{ marginTop: 8 }}>
                {m.tools.map((t) => (
                  <div key={t} className="mono" style={{ color: "var(--gold)" }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "tools" &&
        Object.entries(groups).map(([fam, list]) => (
          <div key={fam} style={{ marginBottom: 22 }}>
            <div className="kicker">{FAMILY[fam] || fam}</div>
            <div className="inv-grid" style={{ marginTop: 8 }}>
              {list.map((t) => (
                <div className="card inv-card" key={t.name} style={{ cursor: "default" }}>
                  <div className="flex">
                    <span className="mono small" style={{ color: "var(--gold)" }}>
                      {t.name}
                    </span>
                    <span className="badge st-OBSERVED">{t.module}</span>
                  </div>
                  <h3 style={{ fontSize: 15, marginTop: 8 }}>{t.description}</h3>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    when: {t.when}
                  </div>
                  <pre className="pre" style={{ marginTop: 8, fontSize: 11 }}>
                    {Object.keys(t.parameters.properties).join(", ") || "—"}
                    {t.parameters.required?.length ? `  required: ${t.parameters.required.join(", ")}` : ""}
                  </pre>
                  <div className="small dim" style={{ marginTop: 8 }}>
                    {t.legal}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
