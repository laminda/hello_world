import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConnector } from "../src/connectors.js";

describe("createConnector", () => {
  it("rejects localhost / private API URLs", () => {
    assert.throws(
      () => createConnector({ name: "local", api_url: "http://127.0.0.1:8080/search" }),
      /public http/
    );
    assert.throws(
      () => createConnector({ name: "lan", api_url: "http://192.168.0.5/x" }),
      /public http/
    );
  });
});
