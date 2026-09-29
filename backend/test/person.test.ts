import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySearchHit,
  extractCandidates,
  generatePersonQueries,
  scorePersonMatch,
  selectPlaybook,
} from "../src/person.js";

describe("selectPlaybook", () => {
  it("partial name + company + role → PERSON_FROM_COMPANY", () => {
    const p = selectPlaybook({
      name: "Юлия",
      organization: "Магнит",
      position: "Директор внутреннего аудита",
    });
    assert.equal(p.playbook, "PERSON_FROM_COMPANY");
  });

  it("email without surname → PERSON_FROM_EMAIL", () => {
    assert.equal(selectPlaybook({ email: "a@b.ru" }).playbook, "PERSON_FROM_EMAIL");
  });
});

describe("extractCandidates / score", () => {
  it("speaker line becomes a candidate", () => {
    const cands = extractCandidates(
      "Юлия Лагутина, Директор департамента внутреннего контроля, ПАО «Магнит»"
    );
    assert.ok(cands.some((c) => /Лагутина/.test(c.name) && /Магнит/.test(c.company || "")));
  });

  it("name-only is insufficient, name+company+role is likely", () => {
    const onlyName = scorePersonMatch(
      { name: "Юлия", organization: "Магнит", position: "директор внутреннего аудита" },
      { name: "Юлия Петрова", extract: "x" }
    );
    assert.equal(onlyName.same_person, "insufficient");
    const full = scorePersonMatch(
      { name: "Юлия", last_name: "Лагутина", organization: "Магнит", position: "директор внутреннего контроля" },
      {
        name: "Юлия Лагутина",
        company: "ПАО Магнит",
        position: "Директор департамента внутреннего контроля",
        extract: "x",
      }
    );
    assert.equal(full.same_person, "likely");
    assert.ok(full.independent_signals >= 2);
  });
});

describe("classifySearchHit", () => {
  it("pdf vs news vs youtube", () => {
    assert.equal(classifySearchHit({ url: "https://x.ru/a.pdf", title: "отчёт", snippet: "", provider: "x", rank: 1 }).kind, "DOCUMENT");
    assert.equal(
      classifySearchHit({ url: "https://rbc.ru/n", title: "Интервью", snippet: "пресс", provider: "x", rank: 1 }).kind,
      "NEWS"
    );
    assert.equal(
      classifySearchHit({ url: "https://youtube.com/watch?v=1", title: "talk", snippet: "", provider: "x", rank: 1 }).kind,
      "VIDEO"
    );
  });
});

describe("generatePersonQueries", () => {
  it("builds variants for Юлия + Магнит + role", () => {
    const qs = generatePersonQueries({
      name: "Юлия",
      organization: "Магнит",
      position: "Директор внутреннего аудита",
    });
    assert.ok(qs.length >= 5);
    assert.ok(qs.some((q) => q.query.includes("Юлия") && q.query.includes("Магнит")));
    assert.ok(qs.some((q) => q.query.includes("filetype:pdf")));
    assert.ok(qs.some((q) => q.query.includes("site:")));
  });
});
