import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { all } from "../src/db.js";
import { inferFromEmail, inferFromText, listHypotheses, listInferences } from "../src/inference.js";
import { createInvestigation } from "./helpers.js";

describe("inferFromText zodiac", () => {
  it("does not treat «инвестиционный» as Libra (вес)", () => {
    const id = createInvestigation("zodiac-false-positive");
    inferFromText(id, "Директор инвестиционного департамента, инвестпроекты овенка нет");
    const inf = listInferences(id);
    assert.equal(
      inf.some((x) => String(x.input_fact).includes("Libra") || String(x.input_fact).includes("Aries")),
      false
    );
  });

  it("zodiac word becomes HYPOTHESIS period, never born_on", () => {
    const id = createInvestigation("zodiac-true");
    inferFromText(id, "В профиле указан знак: телец.");
    const inf = listInferences(id);
    assert.ok(inf.some((x) => String(x.input_fact).includes("Taurus")));
    assert.ok(inf.every((x) => x.status === "HYPOTHESIS"));
    const hyps = listHypotheses(id);
    assert.ok(hyps.some((h) => String(h.reason).includes("never write birth_date")));
  });
});

describe("inferFromEmail", () => {
  it("parses structure as hypothesis, not identity", () => {
    const id = createInvestigation("email");
    inferFromEmail(id, "DMalov@alfabank.ru");
    const hyps = listHypotheses(id) as Array<{ statement: string; type?: string; hyp_type?: string; level: number }>;
    assert.ok(hyps.some((h) => String(h.statement).includes("DMalov") && String(h.statement).includes("alfabank.ru")));
    assert.ok(hyps.some((h) => Number(h.level) === 3));
  });
});
