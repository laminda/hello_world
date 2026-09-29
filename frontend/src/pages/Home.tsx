import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInvestigations } from "../api";
import type { InvestigationListItem } from "../types";

const PIPE = [
  "SEARCH",
  "ARCHIVE",
  "DOCUMENTS",
  "OCR",
  "EXIF",
  "ENTITIES",
  "RESOLUTION",
  "TIMELINE",
  "EVIDENCE GRAPH",
  "CONTRADICTIONS",
  "REPORT",
];

export default function Home() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const nav = useNavigate();
  useEffect(() => {
    listInvestigations().then(setItems).catch(() => setItems([]));
  }, []);
  const shown = items.filter((it) => {
    if (status !== "all" && it.status !== status) return false;
    const hay = `${it.id} ${it.title}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  const totals = {
    facts: items.reduce((s, i) => s + i.facts, 0),
    sources: items.reduce((s, i) => s + i.sources, 0),
    conflicts: items.reduce((s, i) => s + i.conflicts, 0),
  };

  return (
    <div className="page">
      <div className="home-hero">
        <div>
          <div className="kicker">OSINT Investigation Platform · v1.0</div>
          <h1>Не поисковик по людям. Система управления доказательствами.</h1>
          <p className="lede">
            SVOD восстанавливает идентичность и биографию публичного лица по разрозненным открытым
            свидетельствам: страницам, архивам, PDF, OCR, EXIF и графу фактов. Каждый факт связан с
            источником и имеет статус — система не считает найденное автоматически истинным.
          </p>
          <button className="btn primary" onClick={() => nav("/new")}>
            Начать расследование
          </button>
          <div className="pipeline">
            {PIPE.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="kicker">Принцип</div>
          <pre className="pre" style={{ color: "var(--text)", margin: 0 }}>
{`User
 ↓
Investigation
 ↓
Search Planner
 ↓
Sources / Archives / Documents
 ↓
Extraction → Entities → Facts
 ↓
Entity Resolution
 ↓
Evidence Graph
 ↓
Contradiction Detection
 ↓
Final Report`}
          </pre>
          <p className="legal" style={{ marginTop: 14 }}>
            Только publicly available information. robots.txt соблюдается. Нет обхода аутентификации,
            paywall и закрытых баз. Совпадение лица — сигнал, не доказательство личности.
          </p>
        </div>
      </div>

      <div className="kicker">Investigations</div>
      <div className="filter-bar">
        <input className="inp" placeholder="поиск по id / названию" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["all", "draft", "running", "paused", "complete", "failed"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="small muted">
          {shown.length}/{items.length} · facts {totals.facts} · sources {totals.sources} · conflicts {totals.conflicts}
        </span>
      </div>
      <div className="inv-grid" style={{ marginTop: 12 }}>
        {shown.map((it) => (
          <div key={it.id} className="card inv-card" onClick={() => nav(`/inv/${it.id}`)}>
            <div className="flex">
              <span className="mono small" style={{ color: "var(--gold)" }}>
                {it.id}
              </span>
              <span className={`badge st-${it.status}`}>{it.status}</span>
              {it.is_demo ? <span className="badge st-HYPOTHESIS">DEMO</span> : null}
            </div>
            <h3>{it.title}</h3>
            <div className="row">
              <span>facts {it.facts}</span>
              <span>sources {it.sources}</span>
              <span>conflicts {it.conflicts}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
