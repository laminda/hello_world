import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { get } from "../src/db.js";
import { addFact, detectContradictions, evaluateStop, resolveEntities, upsertEntity } from "../src/graph.js";
import { detectCopies } from "../src/independence.js";
import { nowIso, run } from "../src/db.js";
import { createInvestigation } from "./helpers.js";

describe("facts + contradictions", () => {
  it("duplicate fact is not inserted twice", () => {
    const id = createInvestigation("dup-fact");
    const a = addFact({ investigationId: id, predicate: "works_at", value: "АО ЭРА", status: "OBSERVED" });
    const b = addFact({ investigationId: id, predicate: "works_at", value: "АО ЭРА", status: "OBSERVED" });
    assert.equal(a, b);
  });

  it("conflicting held_position marks CONFLICT", () => {
    const id = createInvestigation("conflict");
    addFact({ investigationId: id, predicate: "held_position", value: "вице-президент МКБ", status: "HYPOTHESIS" });
    addFact({ investigationId: id, predicate: "held_position", value: "вице-президент Российский капитал", status: "OBSERVED" });
    detectContradictions(id);
    const row = get<{ status: string }>(
      `SELECT status FROM contradictions WHERE investigation_id = ? AND field = 'held_position'`,
      id
    );
    assert.equal(row?.status, "UNRESOLVED");
  });

  it("substring variants of works_at are not a contradiction", () => {
    const id = createInvestigation("substr");
    addFact({ investigationId: id, predicate: "works_at", value: "АО ЭРА", status: "OBSERVED" });
    addFact({ investigationId: id, predicate: "works_at", value: "АО ЭРА Санкт-Петербург", status: "OBSERVED" });
    detectContradictions(id);
    const row = get(
      `SELECT id FROM contradictions WHERE investigation_id = ? AND field = 'works_at'`,
      id
    );
    assert.equal(row, undefined);
  });
});

describe("resolveEntities", () => {
  it("links ё/е name variants, does not merge unrelated FIO", () => {
    const id = createInvestigation("er");
    const a = upsertEntity(id, "PERSON", "Фёдор Достоевский", 0.7);
    const b = upsertEntity(id, "PERSON", "Федор Достоевский", 0.6);
    const c = upsertEntity(id, "PERSON", "Екатерина Орлова", 0.6);
    resolveEntities(id);
    const rel = get(
      `SELECT id FROM relationships WHERE investigation_id = ? AND rel_type = 'LIKELY_SAME_ENTITY'
       AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
      id,
      a,
      b,
      b,
      a
    );
    assert.ok(rel);
    const bad = get(
      `SELECT id FROM relationships WHERE investigation_id = ? AND rel_type = 'LIKELY_SAME_ENTITY'
       AND (from_id = ? OR to_id = ?)`,
      id,
      c,
      c
    );
    assert.equal(bad, undefined);
  });
});

describe("evaluateStop", () => {
  it("mention + role + org is NOT identified (mention ≠ person)", () => {
    const id = createInvestigation("stop");
    assert.equal(evaluateStop(id).complete, false);
    addFact({ investigationId: id, predicate: "mentioned_as", value: "Татарский", status: "SUPPORTED", confidence: 0.9 });
    addFact({ investigationId: id, predicate: "held_position", value: "генеральный директор", status: "SUPPORTED", confidence: 0.9 });
    addFact({ investigationId: id, predicate: "works_at", value: "АО ЭРА", status: "SUPPORTED", confidence: 0.9 });
    const stop = evaluateStop(id);
    assert.equal(stop.complete, false);
    assert.match(stop.reason, /mention|identit|candidate/i);
  });
});

describe("detectCopies", () => {
  it("marks near-duplicate snippets as derived", () => {
    const id = createInvestigation("copies");
    const text =
      "Пресс-релиз: компания объявила о назначении нового директора инвестиционного департамента на конференции";
    run(
      `INSERT INTO sources (id, investigation_id, url, source_type, title, snippet, discovered_at)
       VALUES (?, ?, ?, 'media', ?, ?, ?)`,
      `SRC-${id}-1`,
      id,
      "https://a.example/1",
      "press",
      text,
      nowIso()
    );
    run(
      `INSERT INTO sources (id, investigation_id, url, source_type, title, snippet, discovered_at)
       VALUES (?, ?, ?, 'media', ?, ?, ?)`,
      `SRC-${id}-2`,
      id,
      "https://b.example/2",
      "press",
      text,
      nowIso()
    );
    detectCopies(id);
    const later = get<{ independence: string | null; copied_from: string | null }>(
      `SELECT independence, copied_from FROM sources WHERE id = ?`,
      `SRC-${id}-2`
    );
    assert.equal(later?.independence, "derived");
    assert.equal(later?.copied_from, `SRC-${id}-1`);
  });
});
