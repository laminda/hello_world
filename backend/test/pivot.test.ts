import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { get } from "../src/db.js";
import { addIdentifier, addPivot } from "../src/pivot.js";
import { createInvestigation } from "./helpers.js";

describe("identifiers / pivots", () => {
  it("stores INN as hypothesis with the org≠person note", () => {
    const id = createInvestigation("inn");
    addIdentifier({
      investigationId: id,
      kind: "inn",
      value: "7812018283",
      priority: "high",
      status: "HYPOTHESIS",
      note: "INN ≠ confirmed position; org INN ≠ personal INN",
    });
    const row = get<{ status: string; note: string }>(
      `SELECT status, note FROM identifiers WHERE investigation_id = ? AND kind = 'inn'`,
      id
    );
    assert.equal(row?.status, "HYPOTHESIS");
    assert.match(row?.note || "", /org INN ≠ personal INN/i);
  });

  it("does not duplicate the same pivot edge", () => {
    const id = createInvestigation("pivot");
    addPivot(id, "EMAIL", "a@b.ru", "DOMAIN", "b.ru", "parse", 0.5);
    addPivot(id, "EMAIL", "a@b.ru", "DOMAIN", "b.ru", "parse", 0.5);
    const c = get<{ c: number }>(
      `SELECT COUNT(*) as c FROM pivots WHERE investigation_id = ?`,
      id
    );
    assert.equal(c?.c, 1);
  });
});
