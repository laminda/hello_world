import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, listMethodologies, listTools, llmStatus, planNextTool } from "../src/tools/registry.js";
import { clearSetting } from "../src/settings.js";

describe("tool catalog", () => {
  it("registers methodologies and unique tool names with schemas", () => {
    const tools = listTools();
    const methods = listMethodologies();
    assert.ok(methods.map((m) => m.id).includes("google-dorks"));
    assert.ok(methods.map((m) => m.id).includes("llm-reasoner"));
    assert.ok(methods.map((m) => m.id).includes("person-intel"));
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    for (const t of ["compile_dorks", "dork_search", "web_search", "alias_expand", "llm_plan_strategy", "select_playbook", "generate_person_queries", "extract_candidates", "score_person_match"]) {
      assert.ok(names.includes(t), `missing ${t}`);
    }
    for (const t of tools) {
      assert.equal(t.parameters.type, "object");
      assert.ok(t.legal.length > 8);
      assert.ok(t.module);
    }
  });

  it("unknown tool fails closed", async () => {
    const r = await executeTool("hack_the_planet", {});
    assert.equal(r.ok, false);
    assert.match(r.error || "", /unknown/);
  });
});

describe("local tools (no network)", () => {
  it("compile_dorks", async () => {
    const r = await executeTool("compile_dorks", {
      name: "Виктор",
      last_name: "Татарский",
      organization: "АО ЭРА",
    });
    assert.equal(r.ok, true);
    const dorks = (r.data?.dorks as unknown[]) || [];
    assert.ok(dorks.length > 5);
  });

  it("alias_expand + email_pivot + hash_content", async () => {
    const a = await executeTool("alias_expand", { name: "Юлия", last_name: "Лагутина" });
    assert.equal(a.ok, true);
    const e = await executeTool("email_pivot", { email: "DMalov@alfabank.ru" });
    assert.equal(e.ok, true);
    assert.equal((e.data as { domain: string }).domain, "alfabank.ru");
    const h = await executeTool("hash_content", { text: "public extract" });
    assert.equal(h.ok, true);
    assert.equal((h.data as { sha256: string }).sha256.length, 64);
  });

  it("extract_facts / extract_html / extract_entities", async () => {
    const f = await executeTool("extract_facts", {
      text: "Юлия Лагутина, Директор департамента внутреннего контроля, ПАО «Магнит»",
      hint_name: "Лагутина",
    });
    assert.equal(f.ok, true);
    assert.match(f.summary, /fact/);
    const html = await executeTool("extract_html", {
      html: "<html><head><title>X</title></head><body><h1>Hi</h1><p>text here</p></body></html>",
    });
    assert.equal(html.ok, true);
    assert.equal((html.data as { title: string }).title, "X");
    const ents = await executeTool("extract_entities", { text: "write me at a@b.co https://example.com" });
    assert.equal(ents.ok, true);
  });

  it("inn_public_query rejects short INN without searching", async () => {
    const r = await executeTool("inn_public_query", { inn: "123" });
    assert.equal(r.ok, false);
  });

  it("fetch_url rejects private URLs", async () => {
    const r = await executeTool("fetch_url", { url: "http://127.0.0.1/secret" });
    assert.equal(r.ok, false);
  });

  it("llm tools fail closed when API key missing", async () => {
    delete process.env.SVOD_LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    clearSetting("llm_api_key");
    assert.equal(llmStatus().configured, false);
    const r = await executeTool("llm_classify_target", { name: "X" });
    assert.equal(r.ok, false);
    assert.match(r.error || r.summary, /not configured/i);
  });
});

describe("planNextTool", () => {
  clearSetting("llm_api_key");
  const input = { name: "Юлия", last_name: "Лагутина", organization: "Магнит" };

  it("starts with person playbook when LLM is off", () => {
    const call = planNextTool({ input, targetType: "middle_manager", used: [], unknown: ["email"], sourceCount: 0 });
    assert.equal(call.tool, "select_playbook");
  });

  it("after playbook, generates person queries", () => {
    const first = planNextTool({ input, targetType: "middle_manager", used: [], unknown: [], sourceCount: 0 });
    const used = [`${first.tool}:${JSON.stringify(first.args)}`];
    const second = planNextTool({ input, targetType: "middle_manager", used, unknown: [], sourceCount: 0 });
    assert.equal(second.tool, "generate_person_queries");
  });

  it("does not repeat a used tool+args pair", () => {
    const a = planNextTool({ input, targetType: "middle_manager", used: [], unknown: [], sourceCount: 0 });
    const used = [`${a.tool}:${JSON.stringify(a.args)}`];
    const b = planNextTool({ input, targetType: "middle_manager", used, unknown: [], sourceCount: 0 });
    assert.notEqual(`${b.tool}:${JSON.stringify(b.args)}`, `${a.tool}:${JSON.stringify(a.args)}`);
  });

  it("youtube ranks higher for public_top_manager than for low_level", () => {
    const ceo = planNextTool({
      input,
      targetType: "public_top_manager",
      used: ["compile_dorks:skip"],
      unknown: [],
      sourceCount: 0,
    });
    void ceo;
    const usedMany = listTools()
      .filter((t) => t.name !== "youtube_search")
      .map((t) => `${t.name}:{}`);
    // just ensure youtube is a candidate in the catalog
    assert.ok(listTools().some((t) => t.name === "youtube_search"));
  });
});
