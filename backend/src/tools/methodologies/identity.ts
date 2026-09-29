import { searchAll } from "../../search.js";
import { emailIntelligence, generateAliases } from "../../nlp.js";
import { usernameHypotheses } from "../../strategy.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

const alias: ToolModule = {
  meta: {
    name: "alias_expand",
    module: "identity",
    family: "identity",
    description: "Name aliases (ё/е, initials, transliteration). Each is a hypothesis.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, middle_name: { type: "string" }, last_name: { type: "string" } },
    },
    legal: "Local generation, not a lookup.",
    cost: 0.02,
    when: "start of investigation",
  },
  async execute(args) {
    const aliases = generateAliases({ name: args.name, middle_name: args.middle_name, last_name: args.last_name });
    return ok(`${aliases.length} aliases`, { data: { aliases } });
  },
};

const permute: ToolModule = {
  meta: {
    name: "username_permute",
    module: "identity",
    family: "identity",
    description: "Username hypotheses from name/email. Match ≠ same person.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" } },
    },
    legal: "Hypotheses only.",
    cost: 0.03,
    when: "email or name known, low-publicity target",
  },
  async execute(args) {
    const users = usernameHypotheses({ name: args.name, last_name: args.last_name, email: args.email });
    return ok(`${users.length} username hypotheses — not identity`, { data: { usernames: users } });
  },
};

const userSearch: ToolModule = {
  meta: {
    name: "username_search",
    module: "identity",
    family: "search",
    description: "Quoted-username web search. Result is a lead, not identity proof.",
    parameters: { type: "object", properties: { username: { type: "string" } }, required: ["username"] },
    legal: "Public web. No social login.",
    cost: 0.14,
    when: "username hypothesis exists",
  },
  async execute(args) {
    const hits = await searchAll(`"${args.username}"`);
    return ok(`${hits.length} hits for username (not proof)`, { hits });
  },
};

const email: ToolModule = {
  meta: {
    name: "email_pivot",
    module: "identity",
    family: "pivot",
    description: "Split email into local_part/domain; username + org-domain hypotheses.",
    parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    legal: "Parse only. local-part is not proof of given name.",
    cost: 0.03,
    when: "email observed",
  },
  async execute(args) {
    const intel = emailIntelligence(args.email || "");
    const users = usernameHypotheses({ email: args.email });
    return ok(`${intel.local_part} @ ${intel.domain}`, { data: { ...intel, usernames: users } });
  },
};

const inn: ToolModule = {
  meta: {
    name: "inn_public_query",
    module: "identity",
    family: "search",
    description: "Search INN as published text on the open web. No unofficial tax aggregators.",
    parameters: { type: "object", properties: { inn: { type: "string" } }, required: ["inn"] },
    legal: "INN is a strong ID only from a lawful public record. Org INN ≠ personal INN. INN ≠ job title.",
    cost: 0.2,
    when: "lawful public INN provided",
  },
  async execute(args) {
    const value = (args.inn || "").replace(/\D/g, "");
    if (value.length < 10) return fail("INN must be 10 (org) or 12 (individual) digits from a lawful source");
    const hits = await searchAll(`"${value}"`);
    return ok(`${hits.length} public mentions of INN ${value} — org INN ≠ person; INN ≠ job title`, { hits });
  },
};

export const methodology: Methodology = {
  id: "identity",
  title: "Identity pivots",
  description: "Алиасы, username, email, ИНН. Совпадение ≠ тот же человек.",
  version: "1.0",
  tools: [alias, permute, userSearch, email, inn],
};
