import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeOutcomes, toToolResult, type SearchOutcome } from "../src/search.js";

describe("toToolResult", () => {
  it("hits → ok", () => {
    const o: SearchOutcome = {
      hits: [{ url: "https://a.ru", title: "A", snippet: "", provider: "x", rank: 1 }],
      engine: "x",
      error: "ok",
    };
    const r = toToolResult(o);
    assert.equal(r.ok, true);
    assert.equal(r.hits?.length, 1);
  });

  it("empty ≠ ok", () => {
    const r = toToolResult({ hits: [], engine: "ddg", error: "empty" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "empty");
  });

  it("tls ≠ ok", () => {
    const r = toToolResult({ hits: [], engine: "ddg", error: "tls", detail: "CERT" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "tls");
  });
});

describe("mergeOutcomes", () => {
  it("prefers hits over tls", () => {
    const m = mergeOutcomes([
      { hits: [], engine: "ddg", error: "tls" },
      {
        hits: [{ url: "https://a.ru", title: "A", snippet: "", provider: "wiki", rank: 1 }],
        engine: "wiki",
        error: "ok",
      },
    ]);
    assert.equal(m.error, "ok");
    assert.equal(m.hits.length, 1);
  });

  it("all empty → empty", () => {
    const m = mergeOutcomes([
      { hits: [], engine: "a", error: "empty" },
      { hits: [], engine: "b", error: "empty" },
    ]);
    assert.equal(m.error, "empty");
  });
});
