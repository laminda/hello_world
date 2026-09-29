import { extractEntities, extractFacts } from "../../nlp.js";
import { ok, type Methodology, type ToolModule } from "../types.js";

const entities: ToolModule = {
  meta: {
    name: "extract_entities",
    module: "nlp",
    family: "analysis",
    description: "NER: PERSON, ORG, POSITION, EMAIL, DATE, URL from text.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    legal: "Local NLP.",
    cost: 0.04,
    when: "after extraction",
  },
  async execute(args) {
    const ents = extractEntities(args.text || "");
    return ok(`${ents.length} entities`, { data: { entities: ents } });
  },
};

const facts: ToolModule = {
  meta: {
    name: "extract_facts",
    module: "nlp",
    family: "analysis",
    description: "Pull held_position / works_at / born_on from text. Direct facts only.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" }, hint_name: { type: "string" } },
      required: ["text"],
    },
    legal: "Local NLP. Inferences must go through hypothesis tools.",
    cost: 0.04,
    when: "after extraction",
  },
  async execute(args) {
    const list = extractFacts(args.text || "", args.hint_name);
    return ok(`${list.length} fact candidates`, { data: { facts: list } });
  },
};

const copies: ToolModule = {
  meta: {
    name: "detect_copies",
    module: "nlp",
    family: "analysis",
    description: "Jaccard text-reuse: copies of one press release are not independent sources.",
    parameters: { type: "object", properties: { investigation_id: { type: "string" } } },
    legal: "Local analysis.",
    cost: 0.05,
    when: "multiple similar snippets",
  },
  async execute(args) {
    return ok("run detectCopies on investigation (agent-side)", { data: { investigation_id: args.investigation_id } });
  },
};

export const methodology: Methodology = {
  id: "nlp",
  title: "Local NLP",
  description: "Правиловый NER и факты. Не LLM.",
  version: "1.0",
  tools: [entities, facts, copies],
};
