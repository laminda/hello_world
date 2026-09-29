import { useMemo } from "react";
import type { Workspace } from "../types";

const COLORS: Record<string, string> = {
  PERSON: "#d4a017",
  ORGANIZATION: "#3ec8d8",
  LOCATION: "#3dd68c",
  POSITION: "#a78bfa",
  EMAIL: "#5b8def",
  DOCUMENT: "#8b9bb4",
  IMAGE: "#e8b84a",
  SOURCE: "#8b9bb4",
};

export default function GraphView({ graph }: { graph: Workspace["graph"] }) {
  const layout = useMemo(() => {
    const nodes = graph.entities.map((e, i) => {
      const n = graph.entities.length || 1;
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = e.kind === "PERSON" ? 0 : 170;
      return {
        ...e,
        x: 320 + Math.cos(angle) * r,
        y: 230 + Math.sin(angle) * (r * 0.72),
      };
    });
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = graph.relationships
      .map((r) => ({ ...r, a: byId[r.from_id], b: byId[r.to_id] }))
      .filter((e) => e.a && e.b);
    return { nodes, edges };
  }, [graph]);

  return (
    <svg viewBox="0 0 640 460" preserveAspectRatio="xMidYMid meet">
      {layout.edges.map((e, i) => (
        <g key={i}>
          <line
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke="#31415c"
            strokeWidth="1.2"
          />
          <text className="rel-label" x={(e.a.x + e.b.x) / 2} y={(e.a.y + e.b.y) / 2 - 6} textAnchor="middle">
            {e.rel_type}
          </text>
        </g>
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`}>
          <circle r={n.kind === "PERSON" ? 28 : 16} fill="#0c1118" stroke={COLORS[n.kind] || "#8b9bb4"} strokeWidth="2" />
          <text className="node-label" y={n.kind === "PERSON" ? 44 : 30} textAnchor="middle">
            {n.canonical_name.length > 28 ? n.canonical_name.slice(0, 26) + "…" : n.canonical_name}
          </text>
        </g>
      ))}
    </svg>
  );
}
