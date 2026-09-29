import { searchYouTubeOutcome, toToolResult } from "../../search.js";
import { type Methodology, type ToolModule } from "../types.js";

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
    return toToolResult(await searchYouTubeOutcome(args.query || ""), "youtube hits");
  },
};

export const methodology: Methodology = {
  id: "video",
  title: "Public video",
  description: "Интервью и выступления на открытом YouTube.",
  version: "1.0",
  tools: [youtube],
};
