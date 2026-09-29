import { searchWeb, toToolResult } from "../../search.js";
import { fail, type Methodology, type ToolModule } from "../types.js";

function siteTool(
  name: string,
  site: string,
  description: string,
  when: string,
  extra = ""
): ToolModule {
  return {
    meta: {
      name,
      module: "digital-search",
      family: "search",
      description: `${description} Public site:${site} only.`,
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      legal: "Public search snippets. No login scrape, no closed DB, no paywall bypass.",
      cost: 0.15,
      when,
    },
    async execute(args) {
      const q = (args.query || "").trim();
      if (!q) return fail("query required");
      const dork = `${q} site:${site}${extra ? ` ${extra}` : ""}`;
      return toToolResult(await searchWeb(dork), `${name} hits`);
    },
  };
}

function phraseTool(name: string, description: string, when: string, wrap: (q: string) => string): ToolModule {
  return {
    meta: {
      name,
      module: "digital-search",
      family: "dorks",
      description,
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      legal: "Public web queries only.",
      cost: 0.14,
      when,
    },
    async execute(args) {
      const q = (args.query || "").trim();
      if (!q) return fail("query required");
      return toToolResult(await searchWeb(wrap(q)), `${name} hits`);
    },
  };
}

export const methodology: Methodology = {
  id: "digital-search",
  title: "Digital public search",
  description:
    "Много узких публичных поисков: спикеры, конференции, GitHub, HH, СМИ, госсайты, суды. Не логин, не агрегаторы ФНС.",
  version: "1.0",
  tools: [
    phraseTool("exact_phrase_search", "Quoted exact phrase search.", "full name / unique string", (q) =>
      q.includes('"') ? q : `"${q}"`
    ),
    phraseTool("intitle_search", "intitle: operator on public search.", "bio / about pages", (q) => `intitle:${q}`),
    phraseTool("inurl_search", "inurl: operator on public search.", "team/about/speaker paths", (q) => `inurl:${q}`),
    phraseTool(
      "speaker_search",
      "Speaker / bio / CV public pages.",
      "partial name + company/role",
      (q) => `${q} спикер OR biography OR биография OR CV OR «список спикеров»`
    ),
    phraseTool(
      "conference_search",
      "Conference programmes and speaker lists.",
      "middle managers, awards",
      (q) => `${q} конференция OR forum OR «программа» OR speaker`
    ),
    phraseTool(
      "press_search",
      "Press releases and interviews.",
      "public executives",
      (q) => `${q} «пресс-релиз» OR interview OR интервью OR «комментирует»`
    ),
    phraseTool(
      "education_search",
      "Alumni / university mentions. Hypothesis, not identity.",
      "need education pivot",
      (q) => `${q} университет OR alumni OR выпускник OR MBA OR «высшая школа»`
    ),
    phraseTool(
      "award_search",
      "Awards and ratings pages.",
      "publicity signal",
      (q) => `${q} лауреат OR премия OR рейтинг OR award`
    ),
    phraseTool(
      "company_people_search",
      "Org + role without requiring surname.",
      "PERSON_FROM_COMPANY playbook",
      (q) => `${q} команда OR руководство OR «наш коллектив» OR about OR team`
    ),
    phraseTool(
      "pdf_cv_search",
      "Public PDF CVs / staff lists.",
      "low-publicity, documents",
      (q) => `${q} filetype:pdf (CV OR резюме OR «список» OR staff)`
    ),
    siteTool("github_search", "github.com", "Public GitHub profiles/commits.", "username / developer"),
    siteTool("gitlab_search", "gitlab.com", "Public GitLab profiles.", "username"),
    siteTool("habr_search", "habr.com", "Habr articles / user pages.", "tech middle managers"),
    siteTool("vc_search", "vc.ru", "vc.ru posts.", "product / marketing roles"),
    siteTool("linkedin_public_search", "linkedin.com", "LinkedIn snippets via public search. Not a login scrape.", "public profiles only"),
    siteTool("vk_public_search", "vk.com", "VK public pages via search snippets.", "username hypothesis"),
    siteTool("telegram_public_search", "t.me", "Public Telegram links in search.", "username / channel"),
    siteTool("hh_public_search", "hh.ru", "Public vacancy/resume snippets. Job ≠ identity.", "low-publicity, career"),
    siteTool("superjob_search", "superjob.ru", "Public job-board snippets.", "career pivot"),
    siteTool("scholar_search", "scholar.google.com", "Scholar snippets.", "academic footprint"),
    siteTool("elibrary_search", "elibrary.ru", "eLIBRARY public pages.", "RU academic"),
    siteTool("gov_search", "gov.ru", "Official .gov.ru pages.", "public officials"),
    siteTool("cbr_search", "cbr.ru", "Bank of Russia public pages.", "finance executives"),
    siteTool("sudact_search", "sudact.ru", "Public court acts. Not a closed docket login.", "legal mentions"),
    siteTool("arbitr_search", "kad.arbitr.ru", "Public arbitration cards if indexed.", "legal mentions"),
    siteTool("dzen_search", "dzen.ru", "Dzen public articles.", "media"),
    siteTool("rutube_search", "rutube.ru", "RuTube public videos via search.", "talks if not YouTube"),
    siteTool("pastebin_search", "pastebin.com", "Public pastes. Leaks are still public text.", "username / email"),
    siteTool("stackoverflow_search", "stackoverflow.com", "Public SO profiles.", "developer username"),
  ],
};
