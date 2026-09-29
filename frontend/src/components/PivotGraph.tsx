import { useMemo } from "react";

const COLORS: Record<string, string> = {
  NAME: "#d4a017",
  FIO: "#d4a017",
  INN: "#e85d5d",
  EMAIL: "#5b8def",
  USERNAME: "#a78bfa",
  ORG: "#3ec8d8",
  DOMAIN: "#3ec8d8",
  SOCIAL: "#a78bfa",
  PDF: "#8b9bb4",
  PHOTO: "#e8b84a",
  EXIF: "#e8b84a",
  ARCHIVE: "#3dd68c",
  URL: "#8b9bb4",
  YOUTUBE: "#e85d5d",
  REGISTRY: "#e85d5d",
};

export default function PivotGraph({
  graph,
}: {
  graph?: {
    nodes: Array<{ id: string; kind: string; label: string }>;
    edges: Array<{ from: string; to: string; reason: string; confidence: number }>;
  };
}) {
  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const n = Math.max(nodes.length, 1);
    return nodes.map((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = node.kind === "NAME" || node.kind === "FIO" ? 0 : 190;
      return { ...node, x: 420 + Math.cos(angle) * r, y: 230 + Math.sin(angle) * r * 0.72 };
    });
  }, [graph]);
  const byId = Object.fromEntries(layout.map((n) => [n.id, n]));
  const edges = (graph?.edges ?? []).map((e) => ({ ...e, a: byId[e.from], b: byId[e.to] })).filter((e) => e.a && e.b);

  if (!layout.length) return <div className="pad muted">Нет pivots</div>;

  return (
    <svg viewBox="0 0 840 460" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
      {edges.map((e, i) => (
        <g key={i}>
          <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="#31415c" strokeWidth="1.2" />
          <text className="rel-label" x={(e.a.x + e.b.x) / 2} y={(e.a.y + e.b.y) / 2 - 4} textAnchor="middle">
            {e.reason.slice(0, 42)}
          </text>
        </g>
      ))}
      {layout.map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`}>
          <circle r={n.kind === "NAME" ? 26 : 14} fill="#0c1118" stroke={COLORS[n.kind] || "#8b9bb4"} strokeWidth="2" />
          <text className="node-label" y={n.kind === "NAME" ? 42 : 28} textAnchor="middle">
            {n.kind}
          </text>
          <text className="rel-label" y={n.kind === "NAME" ? 54 : 40} textAnchor="middle">
            {n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
