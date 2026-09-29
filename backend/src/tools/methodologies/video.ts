import { searchYouTube } from "../../search.js";
import { ok, type Methodology, type ToolModule } from "../types.js";

const youtube: ToolModule = {
  meta: {
    name: "youtube_search",
    module: "video",
    family: "search",
    description: "Public YouTube via site:youtube.com. No login. Transcript only if public.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    legal: "Public videos only.",
    cost: 0.2,
    when: "CEO, speakers, interviews — low priority for obscure employees",
  },
  async execute(args) {
    const hits = await searchYouTube(args.query || "");
    return ok(`${hits.length} youtube hits`, { hits });
  },
};

export const methodology: Methodology = {
  id: "video",
  title: "Public video",
  description: "Интервью и выступления на открытом YouTube.",
  version: "1.0",
  tools: [youtube],
};
