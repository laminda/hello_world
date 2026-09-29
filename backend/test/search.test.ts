import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  googleCreds,
  mergeOutcomes,
  searchApiStatus,
  searchGoogleOutcome,
  searchYandexOutcome,
  toToolResult,
  yandexCreds,
  type SearchOutcome,
} from "../src/search.js";
import { clearSetting } from "../src/settings.js";

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

describe("official search APIs fail closed", () => {
  it("unconfigured google/yandex → config, not fake hits", async () => {
    delete process.env.SVOD_GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.SVOD_GOOGLE_CX;
    delete process.env.GOOGLE_CSE_ID;
    delete process.env.SVOD_YANDEX_USER;
    delete process.env.YANDEX_USER;
    delete process.env.SVOD_YANDEX_API_KEY;
    delete process.env.YANDEX_API_KEY;
    clearSetting("google_api_key");
    clearSetting("google_cx");
    clearSetting("yandex_user");
    clearSetting("yandex_api_key");
    assert.equal(googleCreds().configured, false);
    assert.equal(yandexCreds().configured, false);
    assert.equal(searchApiStatus().google.configured, false);
    assert.equal(searchApiStatus().yandex.configured, false);
    const g = await searchGoogleOutcome("test");
    assert.equal(g.error, "config");
    assert.equal(g.hits.length, 0);
    const y = await searchYandexOutcome("test");
    assert.equal(y.error, "config");
    assert.equal(y.hits.length, 0);
    const r = toToolResult(g, "google hits");
    assert.equal(r.ok, false);
    assert.equal(r.error, "config");
  });
});
