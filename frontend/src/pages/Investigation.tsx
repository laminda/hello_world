import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createInvestigation, getWorkspace, ingestManual, runTool, startInvestigation, stopInvestigation, subscribeEvents } from "../api";
import type { FactStatus, Workspace } from "../types";
import GraphView from "../components/GraphView";
import PivotGraph from "../components/PivotGraph";
import Avatar from "../components/Avatar";
import SearchPanel from "../components/SearchPanel";

const VIEW = [
  ["overview", "Обзор"],
  ["sources", "Источники"],
  ["documents", "Документы"],
  ["images", "Изображения"],
  ["social", "Соц. сети"],
  ["timeline", "Хронология"],
  ["graph", "Граф связей"],
  ["funnel", "Воронка"],
  ["history", "История"],
  ["tools", "Tools"],
  ["facts", "Факты"],
] as const;
type Tab = (typeof VIEW)[number][0];

function Badge({ status }: { status: string }) {
  return <span className={`badge st-${status}`}>{status}</span>;
}

function fileUrl(img: Workspace["images"][number]) {
  if (!img.storage_path) return "";
  if (img.storage_path.endsWith(".svg")) return `/files/original/${img.id}.svg`;
  const ext = img.storage_path.split(".").pop();
  return `/files/original/${img.id}.${ext}`;
}

function val(ws: Workspace, pred: string) {
  return ws.facts.find((f) => f.predicate === pred)?.value;
}

function scoreClass(n: number) {
  if (n >= 0.75) return "hi";
  if (n >= 0.45) return "mid";
  return "lo";
}

export default function Investigation() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [sel, setSel] = useState(0);
  const [factId, setFactId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    if (!id) return;
    getWorkspace(id)
      .then(setWs)
      .catch(() => setErr("Не удалось загрузить расследование"));
  };

  useEffect(() => {
    const t = sp.get("tab");
    if (t === "docs") setTab("documents");
    else if (t === "archive") setTab("sources");
    else if (t && VIEW.some((v) => v[0] === t)) setTab(t as Tab);
  }, [sp]);

  useEffect(() => {
    if (id) {
      try { sessionStorage.setItem("svod.lastInv", id); } catch { /* */ }
    }
    reload();
    if (!id) return;
    const off = subscribeEvents(id, () => reload());
    const t = setInterval(reload, 4000);
    return () => { off(); clearInterval(t); };
  }, [id]);

  const fact = ws?.facts.find((f) => f.id === factId);
  const photo = ws?.images.find((i) => i.id === photoId);

  if (err) return <div className="page">{err}</div>;
  if (!ws) return <div className="page muted">Загрузка досье…</div>;

  const input: Record<string, string> = {};
  for (const i of ws.inputs) input[i.field] = i.value;
  const cands = (ws.candidates && ws.candidates.length
    ? ws.candidates
    : ws.entities.filter((e) => e.kind === "PERSON").map((e) => ({
        id: e.id,
        name: e.canonical_name,
        company: val(ws, "works_at"),
        position: val(ws, "held_position"),
        same_person: e.status === "CONFIRMED" ? "likely" : "insufficient",
        confidence: e.confidence,
      }))) as NonNullable<Workspace["candidates"]>;
  const chosen = cands[Math.min(sel, Math.max(0, cands.length - 1))];
  const ident = ws.identity;
  const conf = ident?.identity_confidence ?? chosen?.confidence ?? 0;
  const personName = ident?.person || chosen?.name || [input.name, input.last_name].filter(Boolean).join(" ") || "—";
  const identified = Boolean(ident?.identified);
  const photoSrc = ws.images[0] ? fileUrl(ws.images[0]) : undefined;

  const onSearch = async (form: Record<string, string>) => {
    setBusy(true);
    try {
      const created = await createInvestigation(form);
      try { sessionStorage.setItem("svod.lastInv", created.id); } catch { /* */ }
      await startInvestigation(created.id);
      nav(`/inv/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page workspace">
      <SearchPanel initial={input} busy={busy} onSearch={onSearch} />
      <div className="flex" style={{ marginBottom: 10, justifyContent: "space-between" }}>
        <div className="flex">
          <span className="mono small" style={{ color: "var(--accent)" }}>{ws.investigation.id}</span>
          <Badge status={ws.investigation.status} />
          <button className="btn ghost" onClick={() => startInvestigation(ws.investigation.id).then(reload)}>Запустить агент</button>
          <button className="btn ghost" onClick={() => stopInvestigation(ws.investigation.id)}>Пауза</button>
        </div>
        <div className="flex">
          <a className="btn ghost" href={`/api/investigations/${ws.investigation.id}/report`} target="_blank" rel="noreferrer">Отчёт</a>
          <button className="btn ghost" onClick={() => {
            const blob = new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${ws.investigation.id}.json`;
            a.click();
          }}>Экспорт JSON</button>
        </div>
      </div>

      <div className="pi-split">
        <aside className="cand-rail">
          <div className="cand-h">
            <b>Результаты поиска ({cands.length})</b>
            <span className="tiny muted">по релевантности</span>
          </div>
          {cands.map((c, i) => (
            <div key={c.id} className={`cand-item ${i === sel ? "on" : ""}`} onClick={() => setSel(i)}>
              <Avatar name={c.name} size={40} />
              <div>
                <div className="nm">{c.name}</div>
                <div className="sub">{c.position || "—"}</div>
                <div className="sub">{c.company || "—"}</div>
              </div>
              <span className={`score ${scoreClass(c.confidence || 0)}`}>{(c.confidence || 0).toFixed(2)}</span>
            </div>
          ))}
          {!cands.length && <p className="pad muted small">Кандидатов пока нет — агент ищет по открытым источникам. Упоминание ≠ идентификация.</p>}
        </aside>

        <section className="profile">
          <div className="profile-head">
            <Avatar name={personName} src={photoSrc} size={96} />
            <div>
              <h2>{personName}</h2>
              <div className="meta">{chosen?.position || val(ws, "held_position") || input.position || "—"} · {chosen?.company || val(ws, "works_at") || input.organization || "—"}</div>
              <div className="kv-mini">
                <div className="k">Компания</div><div>{val(ws, "works_at") || input.organization || "—"}</div>
                <div className="k">Должность</div><div>{val(ws, "held_position") || input.position || "—"}</div>
                <div className="k">Город</div><div>{val(ws, "born_in") || input.city || "—"}</div>
                <div className="k">Email</div><div>{val(ws, "has_email") || input.email || "—"}</div>
                <div className="k">Playbook</div><div className="mono small">{ident?.playbook?.playbook || "—"}</div>
              </div>
            </div>
            <div className="status-col">
              <span className={`status-pill ${identified ? "" : "warn"}`}>
                {identified ? "Идентифицирована" : "Кандидат — не идентифицирован"}
              </span>
              <div className="conf-box">
                <div className="flex"><span>Уверенность в идентификации</span><b>{conf.toFixed(2)}</b></div>
                <div className="meter"><i style={{ width: `${Math.round(conf * 100)}%` }} /></div>
                <small>{identified ? "Высокая уверенность" : "Нужно ≥2 независимых сигнала"}</small>
                <small>Независимые источники: {ident?.independent_sources ?? 0}</small>
                <small>Подтверждённых атрибутов: {(ident?.why || []).length}</small>
              </div>
            </div>
          </div>

          <div className="ptabs">
            {VIEW.map(([id, label]) => (
              <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
                {id === "sources" ? ` (${ws.sources.length})` : ""}
                {id === "documents" ? ` (${ws.documents.length})` : ""}
                {id === "images" ? ` (${ws.images.length})` : ""}
              </button>
            ))}
          </div>

          <div className="ws-body">
            {tab === "overview" && (
              <>
                <div className="overview-3">
                  <div>
                    <div className="card-h">Ключевая информация</div>
                    <div className="kv-mini">
                      <div className="k">Полное имя</div><div>{personName}</div>
                      <div className="k">Должность</div><div>{val(ws, "held_position") || "—"}</div>
                      <div className="k">Компания</div><div>{val(ws, "works_at") || "—"}</div>
                      <div className="k">Город</div><div>{input.city || "—"}</div>
                      <div className="k">Email</div><div>{val(ws, "has_email") || "—"}</div>
                      <div className="k">Алиасы</div>
                      <div>{ws.aliases.slice(0, 6).map((a) => a.alias).join(" · ") || "—"}</div>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 10 }}>{(ident?.why || []).join(" · ")}</p>
                  </div>
                  <div>
                    <div className="card-h">Хронология карьеры</div>
                    <ul className="career">
                      {ws.timeline.length ? ws.timeline.map((t) => (
                        <li key={t.id}>
                          <span className="dot" />
                          <div>
                            <div className="yr">{t.date}</div>
                            <div>{t.event}</div>
                          </div>
                        </li>
                      )) : <li><span className="dot" /><div className="muted">Пока нет датированных событий</div></li>}
                    </ul>
                  </div>
                  <div>
                    <div className="card-h">Граф связей</div>
                    <div className="mini-graph graph-wrap"><GraphView graph={ws.graph} /></div>
                  </div>
                </div>
                <div className="bottom-3">
                  <div>
                    <div className="card-h">Последние источники</div>
                    {ws.sources.slice(0, 5).map((s) => (
                      <div className="list-row" key={s.id}>
                        <span>{s.title || s.domain || s.id}</span>
                        <span className={`score ${s.independence === "derived" ? "lo" : "hi"}`}>{s.source_type}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="card-h">Найденные документы</div>
                    {ws.documents.slice(0, 5).map((d) => (
                      <div className="list-row" key={d.id}>
                        <span>{d.filename}</span>
                        <span className="tiny muted">{d.mime_type}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="card-h">Изображения</div>
                    <div className="thumbs">
                      {ws.images.slice(0, 6).map((img) => (
                        <div className="ph" key={img.id} onClick={() => setPhotoId(img.id)}>{img.id}</div>
                      ))}
                      {!ws.images.length && <div className="ph">нет публичных фото</div>}
                    </div>
                  </div>
                </div>
              </>
            )}
            {tab === "sources" && <SourcesTab ws={ws} />}
            {tab === "documents" && <DocsTab ws={ws} />}
            {tab === "images" && <ImagesTab ws={ws} onOpen={setPhotoId} />}
            {tab === "social" && (
              <div className="pad">
                <p className="muted">Публичные сниппеты, без логина. Совпадение username ≠ тот же человек.</p>
                <table className="table">
                  <thead><tr><th>Hint</th><th>Value</th></tr></thead>
                  <tbody>
                    {(ws.hints || []).filter((h) => /user|social|vk|telegram|github/i.test(h.kind + h.value)).map((h) => (
                      <tr key={h.id}><td>{h.kind}</td><td>{h.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "timeline" && (
              <ul className="career pad">
                {ws.timeline.map((t) => (
                  <li key={t.id}><span className="dot" /><div><div className="yr">{t.date}</div>{t.event}</div></li>
                ))}
              </ul>
            )}
            {tab === "graph" && <div className="graph-wrap"><GraphView graph={ws.graph} /></div>}
            {tab === "funnel" && <FunnelTab ws={ws} />}
            {tab === "history" && <HistoryTab ws={ws} />}
            {tab === "tools" && <ToolsTab ws={ws} onRun={reload} />}
            {tab === "facts" && <FactsTab ws={ws} onOpen={setFactId} />}
          </div>
        </section>
      </div>

      {fact && (
        <aside className="drawer">
          <div className="pad">
            <div className="flex"><div className="kicker">Fact</div><div className="grow" /><button className="btn ghost" onClick={() => setFactId(null)}>Close</button></div>
            <h2>{fact.value}</h2>
            <Badge status={fact.status as FactStatus} />
            <p className="small muted">{fact.extract}</p>
          </div>
        </aside>
      )}
      {photo && (
        <aside className="drawer">
          <div className="pad">
            <div className="flex"><div className="kicker">Photo</div><div className="grow" /><button className="btn ghost" onClick={() => setPhotoId(null)}>Close</button></div>
            <object data={fileUrl(photo)} type="image/svg+xml" style={{ width: "100%", height: 280 }} />
          </div>
        </aside>
      )}
    </div>
  );
}

function FunnelTab({ ws }: { ws: Workspace }) {
  const f = ws.funnel;
  if (!f) return <p className="muted pad">Нет воронки — запустите агент.</p>;
  const err = Object.entries(f.by_error || {});
  const kinds = Object.entries(f.by_kind || {});
  return (
    <div style={{ overflow: "auto", padding: 12 }}>
      <div className="kicker">SEARCH FUNNEL · system metrics</div>
      <h2 style={{ margin: "6px 0 8px" }}>Как система ищет</h2>
      <p className="muted small">
        tls/empty ≠ успех. Waste — итерации с 0 hits и 0 фактов. Identified только при ≥2 сигналах.
      </p>
      <div className="chip-row" style={{ margin: "10px 0" }}>
        <span className="chip on">queries {f.queries}</span>
        <span className="chip on">hits {f.hits}</span>
        <span className="chip on">ingested {f.ingested}</span>
        <span className="chip on">skipped {f.skipped}</span>
        <span className={`chip ${f.waste_pct > 50 ? "off" : "on"}`}>waste {f.waste_pct}%</span>
        <span className={`chip ${f.search_down ? "off" : "on"}`}>{f.search_down ? "search DOWN" : "search up"}</span>
        <span className={`chip ${f.identified ? "on" : "off"}`}>
          identity {Math.round((f.identity_confidence || 0) * 100)}%
        </span>
      </div>
      <div className="kicker">Error class</div>
      <div className="chip-row">
        {err.map(([k, n]) => (
          <span key={k} className={`chip ${k === "ok" ? "on" : "off"}`}>
            {k} {n as number}
          </span>
        ))}
        {!err.length && <span className="muted small">пока нет поисковых вызовов</span>}
      </div>
      <div className="kicker" style={{ marginTop: 12 }}>
        Hit kinds
      </div>
      <div className="chip-row">
        {kinds.map(([k, n]) => (
          <span key={k} className="chip on">
            {k} {n as number}
          </span>
        ))}
      </div>
      <div className="kicker" style={{ marginTop: 16 }}>
        Per tool
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Calls</th>
            <th>Ok%</th>
            <th>Hits</th>
            <th>Facts</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {(f.per_tool || []).map((t) => (
            <tr key={t.tool}>
              <td className="mono small">{t.tool}</td>
              <td>{t.calls}</td>
              <td>{t.ok_pct}%</td>
              <td>{t.hits}</td>
              <td>{t.facts}</td>
              <td className="mono">{t.mean_ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidatesTab({ ws }: { ws: Workspace }) {
  const rows = ws.candidates || [];
  return (
    <div style={{ overflow: "auto", padding: 12 }}>
      <div className="kicker">SEARCH → CANDIDATES → MATCH → IDENTITY</div>
      <h2 style={{ margin: "6px 0 8px" }}>Person candidates</h2>
      <p className="muted small">
        Упоминание ≠ идентифицированное лицо. Совпадение только при ≥2 независимых сигналах (имя + компания / должность / email).
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Position</th>
            <th>same_person</th>
            <th>Conf</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            let why = "";
            try {
              why = ((JSON.parse(c.match_json || "{}") as { why?: string[] }).why || []).join("; ");
            } catch {
              why = "";
            }
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.company || "—"}</td>
                <td>{c.position || "—"}</td>
                <td>
                  <span className={`badge ${c.same_person === "likely" ? "st-SUPPORTED" : "st-HYPOTHESIS"}`}>
                    {c.same_person || "insufficient"}
                  </span>
                </td>
                <td className="mono">{Math.round((c.confidence || 0) * 100)}%</td>
                <td className="small muted">{why}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Пока нет кандидатов — ingest публичного текста или extract_candidates.</p>}
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
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const types = ["all", ...new Set(ws.sources.map((s) => s.source_type))];
  const rows = ws.sources.filter((s) => {
    if (type !== "all" && s.source_type !== type) return false;
    const hay = `${s.title || ""} ${s.url || ""} ${s.snippet || ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  return (
    <div style={{ overflow: "auto" }}>
      <div className="filter-bar">
        <input className="inp" placeholder="фильтр источников" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="small muted">{rows.length}/{ws.sources.length}</span>
      </div>
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
          {rows.map((s) => (
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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = ws.facts.filter((f) => {
    if (status !== "all" && f.status !== status) return false;
    const hay = `${f.predicate} ${f.value} ${f.extract || ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  return (
    <div style={{ overflow: "auto" }}>
      <div className="filter-bar">
        <input className="inp" placeholder="фильтр фактов" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["all", "OBSERVED", "HYPOTHESIS", "SUPPORTED", "CONFIRMED", "CONFLICT", "UNVERIFIED", "REJECTED"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="small muted">{rows.length}/{ws.facts.length}</span>
      </div>
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
          {rows.map((f) => (
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

function HistoryTab({ ws }: { ws: Workspace }) {
  const [q, setQ] = useState("");
  const calls = ws.toolCalls || [];
  const queries = ws.queries.filter((x) => !q || `${x.query} ${x.reason || ""}`.toLowerCase().includes(q.toLowerCase()));
  const tools = calls.filter(
    (c) => !q || `${c.tool} ${c.args_json || ""} ${c.result_summary || ""}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div style={{ overflow: "auto" }}>
      <div className="filter-bar">
        <input className="inp" placeholder="поиск по истории запросов и tools" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small muted">
          queries {queries.length} · tools {tools.length}
        </span>
      </div>
      <div className="kicker">Search queries</div>
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Query</th>
            <th>Class</th>
            <th>Engine</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {queries.map((x) => (
            <tr key={x.id}>
              <td className="mono small">{x.executed_at.slice(11, 19)}</td>
              <td className="mono small">{x.query}</td>
              <td>{x.query_class}</td>
              <td className="small">{x.engine}</td>
              <td className="small muted">{x.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kicker" style={{ marginTop: 16 }}>
        Tool calls
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Tool</th>
            <th>Args</th>
            <th>Ok</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((c) => (
            <tr key={c.id}>
              <td className="mono small">{c.ts.slice(11, 19)}</td>
              <td className="mono small">{c.tool}</td>
              <td className="small">{(c.args_json || "").slice(0, 100)}</td>
              <td>{c.ok ? "✓" : "✗"}</td>
              <td className="small">{c.result_summary || c.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
