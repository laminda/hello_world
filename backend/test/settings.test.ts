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

  it("masks Google/Yandex secrets and does not echo them", () => {
    writeSettings({
      google_api_key: "AIza-secret",
      google_cx: "cx-public",
      yandex_user: "xml-user",
      yandex_api_key: "ya-secret",
    });
    const pub = readSettings(false);
    assert.equal(pub.google_api_key_set, true);
    assert.equal(pub.google_api_key, undefined);
    assert.equal(pub.google_cx, "cx-public");
    assert.equal(pub.yandex_user, "xml-user");
    assert.equal(pub.yandex_api_key_set, true);
    assert.equal(pub.yandex_api_key, undefined);
    writeSettings({ google_api_key: "", yandex_api_key: "••••" });
    const still = readSettings(true);
    assert.equal(still.google_api_key, "AIza-secret");
    assert.equal(still.yandex_api_key, "ya-secret");
    clearSetting("google_api_key");
    clearSetting("google_cx");
    clearSetting("yandex_user");
    clearSetting("yandex_api_key");
  });

  it("disables tools", () => {
    writeSettings({ disabled_tools: ["web_search"] });
    assert.equal(isToolEnabled("web_search"), false);
    assert.equal(isToolEnabled("compile_dorks"), true);
    clearSetting("llm_api_key");
    clearSetting("disabled_tools");
  });
});
