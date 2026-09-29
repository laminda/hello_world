import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInvestigations } from "../api";
import type { InvestigationListItem } from "../types";

export default function Projects() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    listInvestigations().then(setItems).catch(() => setItems([]));
  }, []);
  const shown = items.filter((it) => `${it.id} ${it.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="card-h" style={{ marginBottom: 12 }}>
        Проекты
      </div>
      <input className="inp" placeholder="поиск по id / названию" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="inv-grid" style={{ marginTop: 14 }}>
        {shown.map((it) => (
          <div
            key={it.id}
            className="card inv-card"
            onClick={() => {
              try {
                sessionStorage.setItem("svod.lastInv", it.id);
              } catch {
                /* */
              }
              nav(`/inv/${it.id}`);
            }}
          >
            <div className="flex">
              <span className="mono small" style={{ color: "var(--accent)" }}>
                {it.id}
              </span>
              <span className={`badge st-${it.status}`}>{it.status}</span>
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
