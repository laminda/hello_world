import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTarget, usernameHypotheses } from "../src/strategy.js";

describe("classifyTarget", () => {
  it("Cyrillic CEO → public_top_manager", () => {
    const p = classifyTarget({ position: "Генеральный директор", organization: "АО ЭРА" });
    assert.equal(p.targetType, "public_top_manager");
    assert.equal(p.publicity, "high");
  });

  it("department director → middle_manager", () => {
    const p = classifyTarget({ position: "директор департамента внутреннего контроля" });
    assert.equal(p.targetType, "middle_manager");
  });

  it("username without role → low_level_employee", () => {
    const p = classifyTarget({ username: "user123" });
    assert.equal(p.targetType, "low_level_employee");
    assert.equal(p.publicity, "low");
  });

  it("email without surname switches preset to known_email", () => {
    const p = classifyTarget({ email: "x@alfabank.ru" });
    assert.equal(p.presetId, "known_email");
  });

  it("INN switches preset to known_inn", () => {
    const p = classifyTarget({ last_name: "Татарский", inn: "7812018283", position: "генеральный директор" });
    assert.equal(p.presetId, "known_inn");
    assert.equal(p.targetType, "public_top_manager");
  });

  it("empty input is unknown", () => {
    assert.equal(classifyTarget({}).targetType, "unknown");
  });
});

describe("usernameHypotheses", () => {
  it("permutes email local-part and name, length ≥ 3", () => {
    const u = usernameHypotheses({ name: "Дмитрий", last_name: "Малов", email: "DMalov@alfabank.ru" });
    assert.ok(u.includes("DMalov"));
    assert.ok(u.some((x) => x.toLowerCase().includes("malov")));
    assert.ok(u.every((x) => x.length >= 3));
  });

  it("strips @ from username", () => {
    const u = usernameHypotheses({ username: "@camilla.k" });
    assert.ok(u.includes("camilla.k"));
    assert.ok(u.includes("camilla_k"));
  });
});
