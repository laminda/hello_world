import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailIntelligence,
  extractEntities,
  extractFacts,
  generateAliases,
  nameSimilarity,
} from "../src/nlp.js";

describe("extractFacts", () => {
  it("keeps full speaker title, not bare Директор", () => {
    const facts = extractFacts(
      "Юлия Лагутина, Директор департамента внутреннего контроля, ПАО «Магнит»",
      "Лагутина"
    );
    const pos = facts.filter((f) => f.predicate === "held_position").map((f) => f.value);
    assert.ok(pos.some((v) => /департамента внутреннего контроля/i.test(v)));
    assert.equal(
      pos.some((v) => v.trim().toLowerCase() === "директор"),
      false
    );
  });

  it("does not treat «Last First, Org» without a title as held_position", () => {
    const facts = extractFacts("Малов Дмитрий Николаевич, АО «Альфа-Банк»");
    const speakerPos = facts.filter((f) => f.predicate === "held_position" && f.confidence >= 0.78);
    assert.equal(speakerPos.some((f) => /Альфа/i.test(f.value)), false);
  });

  it("extracts born_on from explicit birth phrasing", () => {
    const facts = extractFacts("Иванов родился 12.03.1980 в Томске.");
    assert.ok(facts.some((f) => f.predicate === "born_on" && f.value.includes("1980")));
  });
});

describe("extractEntities", () => {
  it("finds email, org and a long position", () => {
    const ents = extractEntities(
      "Камилла Ковешникова, директор инвестиционного департамента BMS. email test@bms.ru https://bmsdevelopmentgroup.com/ru/team"
    );
    assert.ok(ents.some((e) => e.kind === "EMAIL" && e.text === "test@bms.ru"));
    assert.ok(ents.some((e) => e.kind === "URL"));
    assert.ok(ents.some((e) => e.kind === "POSITION" && /инвестиционного/i.test(e.text)));
  });
});

describe("generateAliases", () => {
  it("ё/е, order swap, transliteration, initials", () => {
    const aliases = generateAliases({ name: "Фёдор", middle_name: "Михайлович", last_name: "Достоевский" });
    const names = aliases.map((a) => a.alias);
    assert.ok(names.includes("Фёдор Михайлович Достоевский"));
    assert.ok(names.includes("Достоевский Фёдор"));
    assert.ok(names.some((a) => a.includes("Федор") || a.includes("Fedor") || a.includes("Fyodor")));
    assert.ok(names.some((a) => /Ф\.М\.\s*Достоевский/.test(a)));
  });
});

describe("emailIntelligence", () => {
  it("splits local_part/domain and keeps name tokens as hypothesis", () => {
    const intel = emailIntelligence("DMalov@alfabank.ru");
    assert.equal(intel.local_part, "DMalov");
    assert.equal(intel.domain, "alfabank.ru");
    assert.ok(intel.hypotheses.length >= 1);
    assert.ok(intel.hypotheses.every((h) => h.confidence <= 0.5));
  });

  it("empty on garbage", () => {
    const intel = emailIntelligence("not-an-email");
    assert.equal(intel.local_part, "");
  });
});

describe("nameSimilarity", () => {
  it("ё/е normalized identity", () => {
    assert.equal(nameSimilarity("Фёдор Достоевский", "Федор Достоевский"), 1);
  });

  it("unrelated names are low", () => {
    assert.ok(nameSimilarity("Камилла Ковешникова", "Екатерина Орлова") < 0.5);
  });
});
