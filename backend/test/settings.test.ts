import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearSetting, isToolEnabled, readSettings, writeSettings } from "../src/settings.js";

describe("settings", () => {
  it("persists iterations and masks API key", () => {
    writeSettings({ max_iterations: 5, llm_api_key: "sk-test-secret" });
    const pub = readSettings(false);
    assert.equal(pub.max_iterations, 5);
    assert.equal(pub.llm_api_key_set, true);
    assert.equal(pub.llm_api_key, undefined);
    const priv = readSettings(true);
    assert.equal(priv.llm_api_key, "sk-test-secret");
    clearSetting("llm_api_key");
  });

  it("disables tools", () => {
    writeSettings({ disabled_tools: ["web_search"] });
    assert.equal(isToolEnabled("web_search"), false);
    assert.equal(isToolEnabled("compile_dorks"), true);
    clearSetting("llm_api_key");
    clearSetting("disabled_tools");
  });
});
