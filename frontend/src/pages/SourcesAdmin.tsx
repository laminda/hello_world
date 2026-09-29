import { FormEvent, useEffect, useState } from "react";
import { createConnector, getCatalog, getPresets, type CatalogRow } from "../api";

const TARGETS = ["public_top_manager", "public_person", "middle_manager", "low_level_employee"];

export default function SourcesAdmin() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [presets, setPresets] = useState<Array<Record<string, string>>>([]);
  const [eff, setEff] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    name: "",
    api_url: "https://api.example.com/search?q={{QUERY}}",
    method: "GET",
    auth_type: "api_key",
    legal_note: "Public API only. No closed databases.",
  });
  const [msg, setMsg] = useState("");

  const load = () => {
    getCatalog().then((d) => setCatalog(d.catalog || []));
    getPresets().then((d) => {
      setPresets(d.presets || []);
      setEff(d.effectiveness || []);
    });
  };
  useEffect(load, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await createConnector(form);
    setMsg(r.id ? `Connected ${r.id}` : r.error || "error");
    load();
  };

  return (
    <div className="page">
      <div className="kicker">Source registry</div>
      <h1 style={{ marginBottom: 8 }}>Диспетчер источников</h1>
      <p className="muted" style={{ maxWidth: 720, marginBottom: 18 }}>
        Источник подключается не потому что «его много», а потому что он релевантен типу цели.
        Score выбирает следующее действие — это не оценка человека.
      </p>

      <div className="kicker">Search presets</div>
      <div className="inv-grid" style={{ margin: "10px 0 22px" }}>
        {presets.map((p) => (
          <div className="card inv-card" key={p.preset_id} style={{ cursor: "default" }}>
            <div className="mono small" style={{ color: "var(--gold)" }}>
              {p.name}
            </div>
            <h3 style={{ fontSize: 15 }}>{p.preset_id}</h3>
            <p className="small muted">{p.description}</p>
            <div className="pipeline">
              {JSON.parse(p.sources_json || "[]").map((s: string) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="kicker">Catalog · relevance by target type</div>
      <div style={{ overflow: "auto", margin: "10px 0 24px" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Rel.</th>
              {TARGETS.map((t) => (
                <th key={t}>{t.replaceAll("_", " ")}</th>
              ))}
              <th>Legal</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((c) => {
              const rel = JSON.parse(c.relevance_json || "{}") as Record<string, number>;
              return (
                <tr key={c.source_id}>
                  <td>
                    <b>{c.name}</b>
                    <div className="mono small muted">{c.source_id}</div>
                  </td>
                  <td>{c.type}</td>
                  <td className="mono">{c.reliability}</td>
                  {TARGETS.map((t) => (
                    <td key={t} className="mono">
                      {rel[t] ?? "—"}
                    </td>
                  ))}
                  <td className="small muted">{c.legal_note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="kicker">Observed effectiveness (feedback loop)</div>
      <div style={{ overflow: "auto", margin: "10px 0 24px" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Target</th>
              <th>Queries</th>
              <th>Hits</th>
              <th>Useful facts</th>
            </tr>
          </thead>
          <tbody>
            {eff.map((e, i) => (
              <tr key={i}>
                <td className="mono">{String(e.source_id)}</td>
                <td>{String(e.target_type)}</td>
                <td>{String(e.queries)}</td>
                <td>{String(e.successful_hits)}</td>
                <td>{String(e.useful_facts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kicker">Add custom HTTP API</div>
      <form className="card form" style={{ maxWidth: 760 }} onSubmit={onSubmit}>
        <label>
          Source name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Method
          <input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
        </label>
        <label className="wide">
          API URL
          <input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} />
        </label>
        <label className="wide">
          Legal note
          <input value={form.legal_note} onChange={(e) => setForm({ ...form, legal_note: e.target.value })} />
        </label>
        <div className="actions">
          <span className="muted small">{msg}</span>
          <button className="btn primary">Register connector</button>
        </div>
      </form>
      <p className="legal" style={{ marginTop: 16 }}>
        localhost и RFC1918 блокируются. Закрытые налоговые базы, paywall и обход аутентификации не
        подключаются. ИНН — только из законного публичного источника; ИНН ≠ подтверждённая должность.
      </p>
    </div>
  );
}
