import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getWorkspace, ingestManual, runTool, startInvestigation, stopInvestigation, subscribeEvents } from "../api";
import type { FactStatus, Workspace } from "../types";
import GraphView from "../components/GraphView";
import PivotGraph from "../components/PivotGraph";

const TABS = [
  "overview",
  "strategy",
  "pivots",
  "hypotheses",
  "sources",
  "documents",
  "images",
  "facts",
  "graph",
  "raw",
  "audit",
  "tools",
] as const;
type Tab = (typeof TABS)[number];

function Badge({ status }: { status: string }) {
  return <span className={`badge st-${status}`}>{status}</span>;
}

function fileUrl(img: Workspace["images"][number]) {
  if (!img.storage_path) return "";
  if (img.storage_path.endsWith(".svg")) return `/files/original/${img.id}.svg`;
  const ext = img.storage_path.split(".").pop();
  return `/files/original/${img.id}.${ext}`;
}

export default function Investigation() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [factId, setFactId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    if (!id) return;
    getWorkspace(id)
      .then(setWs)
      .catch(() => setErr("Не удалось загрузить расследование"));
  };

  useEffect(() => {
    reload();
    if (!id) return;
    const off = subscribeEvents(id, () => reload());
    const t = setInterval(reload, 4000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [id]);

  const fact = ws?.facts.find((f) => f.id === factId);
  const photo = ws?.images.find((i) => i.id === photoId);

  if (err) return <div className="page">{err}</div>;
  if (!ws) return <div className="page muted">Загрузка досье…</div>;

  const person = ws.entities.find((e) => e.kind === "PERSON");

  return (
    <div className="workspace">
      <div className="ws-head">
        <Link to="/" className="muted small">
          ←
        </Link>
        <span className="id">{ws.investigation.id}</span>
        <h1>{ws.investigation.title}</h1>
        <Badge status={ws.investigation.status} />
        {ws.investigation.is_demo ? <Badge status="HYPOTHESIS" /> : null}
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => startInvestigation(ws.investigation.id).then(reload)}>
          Run agent
        </button>
        <button className="btn ghost" onClick={() => stopInvestigation(ws.investigation.id)}>
          Pause
        </button>
      </div>

      {tab === "overview" && (
        <div className="overview-grid">
          <div className="ws-main">
            <div className="col">
              <div className="panel-h">Known</div>
              {ws.inputs.map((i) => (
                <div className="known-item" key={i.field}>
                  <div className="lbl">{i.field}</div>
                  <div className="val">{i.value}</div>
                </div>
              ))}
              <div className="panel-h">Unknown / unresolved</div>
              {ws.contradictions.map((c) => (
                <div className="warn-banner" key={c.id}>
                  CONFLICT {c.field}: {JSON.parse(c.values_json).join(" | ")} · {c.status}
                </div>
              ))}
              {person && (
                <div className="known-item">
                  <div className="lbl">canonical entity</div>
                  <div className="val">{person.canonical_name}</div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {ws.aliases
                      .filter((a) => a.entity_id === person.id)
                      .map((a) => a.alias)
                      .slice(0, 8)
                      .join(" · ")}
                  </div>
                </div>
              )}
            </div>
            <div className="col graph-wrap">
              <div className="panel-h" style={{ position: "absolute", zIndex: 2, width: "100%", background: "rgba(12,17,24,0.75)" }}>
                Entity graph
              </div>
              <GraphView graph={ws.graph} />
            </div>
            <div className="col">
              <div className="panel-h">Evidence</div>
              {ws.evidenceSummary.map((e) => (
                <div
                  className="ev-row"
                  key={e.predicate}
                  onClick={() => {
                    const f = ws.facts.find((x) => x.predicate === e.predicate);
                    if (f) setFactId(f.id);
                  }}
                >
                  <div>
                    <div className="lbl">{e.label}</div>
                    <div className="val">{e.value}</div>
                    <div className="meter">
                      <i style={{ width: `${Math.round(e.confidence * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <Badge status={e.status} />
                    <div className="mono small dim" style={{ marginTop: 6, textAlign: "right" }}>
                      {Math.round(e.confidence * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="panel-h">Timeline</div>
            <div className="timeline">
              {ws.timeline.map((t) => (
                <div className="tl-item" key={t.id}>
                  <div className="dot" />
                  <div className="yr">{t.date}</div>
                  <div className="ev">{t.event}</div>
                </div>
              ))}
            </div>
            <div className="panel-h">Investigation log</div>
            <div className="log" style={{ height: 96 }}>
              {ws.actions.slice(-40).map((a) => (
                <div className="log-line" key={a.id}>
                  <span>{a.ts.slice(11, 19)}</span>
                  <span className={`lv-${a.level}`}>{a.level.toUpperCase()}</span>
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "strategy" && <StrategyTab ws={ws} onIngest={reload} />}
      {tab === "pivots" && <PivotsTab ws={ws} />}
      {tab === "hypotheses" && <HypothesesTab ws={ws} />}
      {tab === "sources" && <SourcesTab ws={ws} />}
      {tab === "documents" && <DocsTab ws={ws} />}
      {tab === "images" && <ImagesTab ws={ws} onOpen={setPhotoId} />}
      {tab === "facts" && <FactsTab ws={ws} onOpen={setFactId} />}
      {tab === "graph" && (
        <div className="graph-wrap">
          <GraphView graph={ws.graph} />
        </div>
      )}
      {tab === "raw" && <RawTab ws={ws} />}
      {tab === "audit" && <AuditTab ws={ws} />}
      {tab === "tools" && <ToolsTab ws={ws} onRun={reload} />}

      {fact && (
        <aside className="drawer">
          <div className="pad">
            <div className="flex">
              <div className="kicker">Fact</div>
              <div className="grow" />
              <button className="btn ghost" onClick={() => setFactId(null)}>
                Close
              </button>
            </div>
            <h2>{fact.value}</h2>
            <div className="flex">
              <Badge status={fact.status as FactStatus} />
              <span className="mono small muted">{fact.id}</span>
            </div>
            <div className="kv">
              <div className="k">Predicate</div>
              <div>{fact.predicate}</div>
              <div className="k">Confidence</div>
              <div>{Math.round(fact.confidence * 100)}%</div>
              <div className="k">Temporal</div>
              <div>{fact.temporal_relevance || "UNKNOWN"}</div>
              <div className="k">Valid</div>
              <div>
                {fact.valid_from || "—"} → {fact.valid_to || "—"}
              </div>
              <div className="k">Doc date</div>
              <div>{fact.document_date || "—"}</div>
              <div className="k">Page</div>
              <div>{fact.page ?? "—"}</div>
              <div className="k">Extraction</div>
              <div>{fact.extraction_confidence != null ? Math.round(fact.extraction_confidence * 100) + "%" : "—"}</div>
              <div className="k">Src reliability</div>
              <div>{fact.source_reliability != null ? Math.round(fact.source_reliability * 100) + "%" : "—"}</div>
              <div className="k">Entity match</div>
              <div>{fact.entity_match != null ? Math.round(fact.entity_match * 100) + "%" : "—"}</div>
              <div className="k">Independence</div>
              <div>{fact.independence_score ?? "—"} independent sources</div>
            </div>
            <p className="small muted">
              Source reliability и fact confidence разделены. Старый официальный документ не делает должность текущей.
              Три копии одного пресс-релиза ≠ три независимых источника.
            </p>
            {fact.extract && <div className="extract">EXTRACT: “{fact.extract}”</div>}
            <div className="kicker" style={{ marginTop: 16 }}>
              Sources
            </div>
            {ws.factSources
              .filter((fs) => fs.fact_id === fact.id)
              .map((fs) => {
                const s = ws.sources.find((x) => x.id === fs.source_id);
                const d = ws.documents.find((x) => x.id === fs.document_id);
                return (
                  <div key={fs.source_id + (fs.document_id || "")} className="known-item">
                    <div className="lbl">
                      {s?.source_type} · {s?.id}
                    </div>
                    <div className="val">{s?.title}</div>
                    <div className="small muted">
                      {s?.url} {d ? `· ${d.filename}` : ""} {fs.page ? `· p.${fs.page}` : ""}
                    </div>
                  </div>
                );
              })}
          </div>
        </aside>
      )}

      {photo && (
        <aside className="drawer">
          <div className="pad">
            <div className="flex">
              <div className="kicker">Photo</div>
              <div className="grow" />
              <button className="btn ghost" onClick={() => setPhotoId(null)}>
                Close
              </button>
            </div>
            <h2>{photo.id}</h2>
            <object data={fileUrl(photo)} type="image/svg+xml" style={{ width: "100%", height: 280, background: "#0a0e14" }} />
            <div className="kv">
              <div className="k">Source</div>
              <div>{ws.sources.find((s) => s.id === photo.source_id)?.title || photo.source_id}</div>
              <div className="k">SHA-256</div>
              <div className="mono small">{photo.sha256}</div>
              <div className="k">Faces</div>
              <div>{ws.faces.filter((f) => f.image_id === photo.id).length}</div>
            </div>
            <div className="kicker">OCR</div>
            {ws.ocr
              .filter((o) => o.image_id === photo.id)
              .map((o, i) => (
                <div className="extract" key={i}>
                  “{o.text}” · {Math.round((o.confidence || 0) * 100)}%
                </div>
              ))}
            <div className="kicker">EXIF / metadata — evidence, not truth</div>
            {ws.metadata
              .filter((m) => m.image_id === photo.id)
              .map((m) => (
                <div className="kv" key={m.key}>
                  <div className="k">{m.key}</div>
                  <div>
                    {m.value} <span className="dim">({m.source})</span>
                  </div>
                </div>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function StrategyTab({ ws, onIngest }: { ws: Workspace; onIngest: () => void }) {
  const s = ws.strategy;
  const [form, setForm] = useState({ url: "", text: "", email: "", username: "", inn: "", hint: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await ingestManual(ws.investigation.id, form);
      onIngest();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ overflow: "auto", padding: 12 }}>
      <div className="kicker">Adaptive search</div>
      <h2 style={{ margin: "6px 0 10px" }}>
        {s?.profile.targetType} → {s?.preset?.name || s?.preset_id}
      </h2>
      <p className="muted small">{s?.preset?.description}</p>
      <div className="pipeline" style={{ margin: "10px 0 16px" }}>
        {(s?.profile.reasons || []).map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="kicker">What source is most likely to yield a new useful fact?</div>
      <table className="table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Score</th>
            <th>Relevance</th>
            <th>Gain</th>
            <th>Reliability</th>
            <th>FP risk</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {(s?.scored || []).map((row) => (
            <tr key={row.source_id}>
              <td>
                {row.name}
                <div className="mono small muted">{row.source_id}</div>
              </td>
              <td className="mono">{row.score}</td>
              <td className="mono">{row.target_relevance}</td>
              <td className="mono">{row.information_gain}</td>
              <td className="mono">{row.source_reliability}</td>
              <td className="mono">{row.false_positive_risk}</td>
              <td className="small muted">{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Score выбирает следующее действие, не достоверность человека.</p>
      <div className="kicker" style={{ marginTop: 18 }}>
        Manual source / USER_HINT
      </div>
      <div className="card form" style={{ maxWidth: 720 }}>
        <label>
          URL
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </label>
        <label>
          Email
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          Username
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          ИНН (публичный)
          <input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
        </label>
        <label className="wide">
          Text / document extract
          <textarea rows={2} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        </label>
        <label className="wide">
          Hint («кажется, никнейм fedor1985»)
          <input value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} />
        </label>
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={submit} type="button">
            Ingest as evidence / hint
          </button>
        </div>
      </div>
    </div>
  );
}

function PivotsTab({ ws }: { ws: Workspace }) {
  return (
    <div className="raw-grid">
      <div className="raw-nav">
        <div className="panel-h">Identifiers</div>
        {(ws.identifiers || []).map((i) => (
          <div className="known-item" key={i.id}>
            <div className="lbl">
              {i.kind} · {i.priority}
            </div>
            <div className="val">{i.value}</div>
            <div className="small muted">{i.note}</div>
          </div>
        ))}
      </div>
      <div className="graph-wrap">
        <div className="panel-h">Pivot graph · NAME → INN / EMAIL / USERNAME → documents → EXIF</div>
        <PivotGraph graph={ws.pivotGraph} />
      </div>
    </div>
  );
}

function HypothesesTab({ ws }: { ws: Workspace }) {
  return (
    <div style={{ overflow: "auto" }}>
      <div className="warn-banner">
        Запрещено: совпадение имени/username/лица = тот же человек; часть email = доказательство;
        зодиак = дата рождения; старый документ = текущая должность; копипаст = три источника.
        Всё это остаётся hypothesis.
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Level</th>
            <th>Type</th>
            <th>Statement</th>
            <th>Status</th>
            <th>Conf</th>
          </tr>
        </thead>
        <tbody>
          {ws.hypotheses.map((h) => (
            <tr key={h.id}>
              <td className="mono small">{h.id}</td>
              <td>{(h as { level?: number }).level ?? "—"}</td>
              <td>{(h as { hyp_type?: string }).hyp_type || "—"}</td>
              <td>
                {h.statement}
                <div className="small muted">{(h as { reason?: string }).reason}</div>
              </td>
              <td>
                <Badge status={h.status} />
              </td>
              <td className="mono">{Math.round(h.confidence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kicker" style={{ margin: 12 }}>
        Inferences (never written as facts)
      </div>
      <pre className="pre pad">{JSON.stringify(ws.inferences || [], null, 2)}</pre>
    </div>
  );
}

function SourcesTab({ ws }: { ws: Workspace }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Title</th>
            <th>Independence</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>
          {ws.sources.map((s) => (
            <tr key={s.id}>
              <td className="mono small">{s.id}</td>
              <td>{s.source_type}</td>
              <td>
                {s.title}
                <div className="small muted">{s.snippet}</div>
              </td>
              <td>
                {s.independence || "unknown"}
                {s.copied_from ? <div className="small muted">COPIED_FROM {s.copied_from}</div> : null}
              </td>
              <td className="small">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.domain}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsTab({ ws }: { ws: Workspace }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>File</th>
            <th>SHA-256</th>
            <th>Lang</th>
            <th>Extract</th>
          </tr>
        </thead>
        <tbody>
          {ws.documents.map((d) => (
            <tr key={d.id}>
              <td className="mono small">{d.id}</td>
              <td>
                {d.filename}
                <div className="small muted">
                  {d.mime_type} · {d.size} B · p.{d.page_count}
                </div>
              </td>
              <td className="mono small">{d.sha256?.slice(0, 16)}…</td>
              <td>{d.language}</td>
              <td className="small muted">{d.extracted_text?.slice(0, 180)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImagesTab({ ws, onOpen }: { ws: Workspace; onOpen: (id: string) => void }) {
  return (
    <div className="photo-grid">
      {ws.images.map((img) => (
        <div className="card photo-card" key={img.id} onClick={() => onOpen(img.id)} style={{ cursor: "pointer" }}>
          <div className="img">{img.id}</div>
          <div className="body">
            <div className="mono small" style={{ color: "var(--gold)" }}>
              {img.id}
            </div>
            <div>{img.caption || img.original_url}</div>
            <div className="small muted">
              faces {ws.faces.filter((f) => f.image_id === img.id).length} · OCR{" "}
              {ws.ocr.filter((o) => o.image_id === img.id).length}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FactsTab({ ws, onOpen }: { ws: Workspace; onOpen: (id: string) => void }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Predicate</th>
            <th>Value</th>
            <th>Status</th>
            <th>Conf</th>
          </tr>
        </thead>
        <tbody>
          {ws.facts.map((f) => (
            <tr key={f.id} onClick={() => onOpen(f.id)} style={{ cursor: "pointer" }}>
              <td className="mono small">{f.id}</td>
              <td>{f.predicate}</td>
              <td>
                {f.value}
                {f.extract ? <div className="small muted">{f.extract}</div> : null}
              </td>
              <td>
                <Badge status={f.status} />
              </td>
              <td className="mono">{Math.round(f.confidence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawTab({ ws }: { ws: Workspace }) {
  const [sel, setSel] = useState(ws.documents[0]?.id ?? "");
  const doc = ws.documents.find((d) => d.id === sel);
  const panes = ["ORIGINAL", "EXTRACTED TEXT", "OCR", "METADATA", "ENTITIES", "FACTS", "SOURCE", "ARCHIVE", "TIMELINE"];
  const [pane, setPane] = useState(panes[1]);
  const body = useMemo(() => {
    if (pane === "EXTRACTED TEXT") return doc?.extracted_text || "—";
    if (pane === "OCR")
      return ws.ocr.map((o) => `${o.text} (${Math.round((o.confidence || 0) * 100)}%)`).join("\n") || "—";
    if (pane === "METADATA")
      return ws.metadata.map((m) => `${m.key}: ${m.value}  [${m.source}]`).join("\n") || "—";
    if (pane === "ENTITIES")
      return ws.entities.map((e) => `${e.id}  ${e.kind}  ${e.canonical_name}  ${e.status}`).join("\n");
    if (pane === "FACTS")
      return ws.facts.map((f) => `${f.id}  ${f.predicate}=${f.value}  ${f.status}`).join("\n");
    if (pane === "SOURCE") return JSON.stringify(ws.sources, null, 2);
    if (pane === "ARCHIVE") return JSON.stringify(ws.snapshots, null, 2);
    if (pane === "TIMELINE") return ws.timeline.map((t) => `${t.date}  ${t.event}`).join("\n");
    if (pane === "ORIGINAL")
      return `filename: ${doc?.filename}\nmime: ${doc?.mime_type}\nsha256: ${doc?.sha256}\nmd5: ${doc?.md5}\nОригинал не перезаписывается.`;
    return "";
  }, [pane, doc, ws]);

  return (
    <div className="raw-grid">
      <div className="raw-nav">
        {ws.documents.map((d) => (
          <button key={d.id} className={sel === d.id ? "on" : ""} onClick={() => setSel(d.id)}>
            {d.id}
            <div className="small muted">{d.filename}</div>
          </button>
        ))}
      </div>
      <div className="raw-body">
        <div className="flex" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {panes.map((p) => (
            <button key={p} className={`btn ${pane === p ? "primary" : "ghost"}`} onClick={() => setPane(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="kicker">LLM не скрывает исходный материал</div>
        <pre className="pre">{body}</pre>
      </div>
    </div>
  );
}

function AuditTab({ ws }: { ws: Workspace }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Query</th>
            <th>Class</th>
            <th>Reason</th>
            <th>Selected</th>
          </tr>
        </thead>
        <tbody>
          {ws.queries.map((q) => {
            const sel = ws.results.filter((r) => r.query_id === q.id && r.selected);
            return (
              <tr key={q.id}>
                <td className="mono small">{q.executed_at.slice(11, 19)}</td>
                <td className="mono small">{q.query}</td>
                <td>{q.query_class}</td>
                <td>{q.reason}</td>
                <td className="small">
                  {sel.map((s) => (
                    <div key={s.url}>
                      {s.title} · {s.selection_reason}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pad muted small">Расследование воспроизводимо: query, engine, timestamp, results, reason.</div>
    </div>
  );
}

function ToolsTab({ ws, onRun }: { ws: Workspace; onRun: () => void }) {
  const calls = (ws as Workspace & { toolCalls?: Array<Record<string, unknown>> }).toolCalls || [];
  const [tool, setTool] = useState("web_search");
  const [args, setArgs] = useState("{\"query\":\"\"}");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  return (
    <div style={{ overflow: "auto" }}>
      <div className="warn-banner">
        Агент вызывает tools как LLM: name + JSON schema + execute. Планировщик выбирает следующий вызов.
        Аналитик может запустить тот же tool вручную. Public-only.
      </div>
      <div className="flex" style={{ gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
        <select value={tool} onChange={(e) => setTool(e.target.value)}>
          {(ws as { tools?: Array<{ name: string }> }).tools?.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          )) || <option>web_search</option>}
        </select>
        <input className="inp" style={{ flex: 1, minWidth: 240 }} value={args} onChange={(e) => setArgs(e.target.value)} />
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await runTool(ws.investigation.id, tool, JSON.parse(args || "{}"));
              setOut(JSON.stringify(r, null, 2).slice(0, 4000));
              onRun();
            } catch (e) {
              setOut(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Execute
        </button>
      </div>
      {out && <pre className="pre">{out}</pre>}
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Tool</th>
            <th>Args</th>
            <th>Ok</th>
            <th>Hits</th>
            <th>Summary</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={String(c.id)}>
              <td className="mono small">{String(c.ts).slice(11, 19)}</td>
              <td className="mono small">{String(c.tool)}</td>
              <td className="small">{String(c.args_json || "").slice(0, 80)}</td>
              <td>{Number(c.ok) ? "✓" : "✗"}</td>
              <td>{String(c.hits ?? 0)}</td>
              <td className="small">{String(c.result_summary || c.error || "")}</td>
              <td className="mono small">{String(c.duration_ms ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
