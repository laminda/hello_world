import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initials, knownUnknown, nextActions, planQueries, scoreAction, transliterate, yoVariants } from "../src/planner.js";

describe("transliterate / yo / initials", () => {
  it("transliterates Cyrillic", () => {
    assert.equal(transliterate("Татарский"), "Tatarskiy");
    assert.equal(transliterate("Юлия"), "Yuliya");
  });

  it("yoVariants replaces ё with е", () => {
    const v = yoVariants("Фёдор");
    assert.ok(v.includes("Фёдор"));
    assert.ok(v.includes("Федор"));
  });

  it("initials for full name", () => {
    const i = initials("Виктор", "Сергеевич", "Татарский");
    assert.ok(i.some((x) => x.includes("В.С.") && x.includes("Татарский")));
  });
});

describe("planQueries", () => {
  it("includes filetype dork and quoted identity", () => {
    const qs = planQueries({
      name: "Алексей",
      last_name: "Ручкин",
      organization: "Самолет",
      email: "a@example.com",
    });
    assert.ok(qs.some((q) => q.query.includes("filetype:pdf")));
    assert.ok(qs.some((q) => q.query.includes('"Алексей Ручкин"')));
    assert.ok(qs.some((q) => q.queryClass === "EMAIL" && q.query.includes("a@example.com")));
  });

  it("knownUnknown lists missing fields", () => {
    const { known, unknown } = knownUnknown({ name: "A", last_name: "B" });
    assert.ok(known.some((k) => k.startsWith("first_name=")));
    assert.ok(unknown.includes("email"));
    assert.ok(unknown.includes("position"));
  });
});

describe("nextActions / scoreAction", () => {
  it("puts fetch_url first when seed URL and iteration 0", () => {
    const actions = nextActions({ url: "https://eraspb.ru/", name: "Виктор" }, {
      sourceCount: 0,
      factCount: 0,
      contradictionCount: 0,
      searched: [],
      iteration: 0,
    });
    assert.equal(actions[0].type, "fetch_url");
  });

  it("resolve_conflict when contradictions after first loops", () => {
    const actions = nextActions({ last_name: "Орлова" }, {
      sourceCount: 2,
      factCount: 2,
      contradictionCount: 1,
      searched: [],
      iteration: 2,
    });
    assert.equal(actions[0].type, "resolve_conflict");
  });

  it("penalizes duplicate queries", () => {
    const a = { type: "search" as const, query: "x", queryClass: "IDENTITY" as const, reason: "r" };
    assert.ok(scoreAction(a, []) > scoreAction(a, ["x"]));
  });
});
