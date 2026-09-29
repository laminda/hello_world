import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileDorks } from "../src/tools/dorks.js";

describe("compileDorks", () => {
  it("builds ranked identity/document/site dorks from known fields", () => {
    const dorks = compileDorks({
      name: "Юлия",
      last_name: "Лагутина",
      organization: "ПАО Магнит",
      position: "директор департамента внутреннего контроля",
      email: "yl@magnit.ru",
    });
    const texts = dorks.map((d) => d.dork);
    assert.ok(dorks.length >= 10);
    assert.ok(texts.some((t) => t.includes('"Юлия Лагутина"') && t.includes('"ПАО Магнит"')));
    assert.ok(texts.some((t) => t.includes("filetype:pdf")));
    assert.ok(texts.some((t) => t.includes("site:magnit.ru")));
    assert.ok(texts.some((t) => t.includes("inurl:team")));
    assert.equal(dorks[0].score >= dorks[dorks.length - 1].score, true);
  });

  it("quotes INN and does not treat org INN as a person", () => {
    const dorks = compileDorks({ inn: "7812018283", last_name: "Татарский" });
    const inn = dorks.find((d) => d.family === "identifier");
    assert.ok(inn);
    assert.equal(inn!.dork, '"7812018283"');
    assert.match(inn!.reason, /Org INN ≠ personal INN/);
  });

  it("username match is a contact lead, not identity", () => {
    const dorks = compileDorks({ username: "@dmalov" });
    const u = dorks.find((d) => d.family === "contact");
    assert.ok(u);
    assert.equal(u!.dork, '"dmalov"');
    assert.match(u!.reason, /not the same person|match ≠ same person/i);
  });

  it("returns nothing useful for empty input", () => {
    assert.equal(compileDorks({}).length, 0);
  });

  it("latin alias for Cyrillic name", () => {
    const dorks = compileDorks({ name: "Виктор", last_name: "Татарский" });
    assert.ok(dorks.some((d) => /Viktor|Tatarsk/i.test(d.dork)));
  });
});
