import { waybackCdx } from "../../search.js";
import { ok, type Methodology, type ToolModule } from "../types.js";

const wayback: ToolModule = {
  meta: {
    name: "wayback_cdx",
    module: "archive",
    family: "archive",
    description: "Internet Archive CDX: historical snapshots of a URL.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    legal: "Public Wayback CDX API. Snapshots are historical, not current.",
    cost: 0.18,
    when: "old job titles, deleted about-pages",
  },
  async execute(args) {
    const snaps = await waybackCdx(args.url || "", 10);
    return ok(`${snaps.length} snapshots`, {
      hits: snaps.map((s, i) => ({
        url: s.archiveUrl,
        title: `Wayback ${s.timestamp}`,
        snippet: s.original,
        provider: "wayback",
        rank: i + 1,
      })),
      data: { snapshots: snaps },
    });
  },
};

export const methodology: Methodology = {
  id: "archive",
  title: "Web archive",
  description: "Исторические снимки. Старый документ ≠ текущая должность.",
  version: "1.0",
  tools: [wayback],
};
