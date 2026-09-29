import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jaccard } from "../src/independence.js";

describe("jaccard", () => {
  it("identical long press-releases score high", () => {
    const a =
      "Компания объявила о назначении директора инвестиционного департамента на ежегодной конференции в Москве сегодня утром";
    assert.ok(jaccard(a, a) > 0.9);
  });

  it("unrelated snippets score low", () => {
    assert.ok(
      jaccard("годовой отчёт акционерного общества ЭРА Санкт-Петербург", "рецепт борща с говядиной и сметаной") < 0.2
    );
  });

  it("short tokens under 4 chars are ignored", () => {
    assert.equal(jaccard("а б в г", "а б в г"), 0);
  });
});
