import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicHttpUrl, looksLikeDocument } from "../src/crawler.js";

describe("isPublicHttpUrl", () => {
  it("allows public https", () => {
    assert.equal(isPublicHttpUrl("https://eraspb.ru/about"), true);
    assert.equal(isPublicHttpUrl("http://example.com"), true);
  });

  it("blocks localhost and loopback", () => {
    assert.equal(isPublicHttpUrl("http://localhost:3001/api"), false);
    assert.equal(isPublicHttpUrl("http://127.0.0.1/"), false);
    assert.equal(isPublicHttpUrl("http://something.local/x"), false);
  });

  it("blocks RFC1918 and link-local", () => {
    assert.equal(isPublicHttpUrl("http://10.0.0.8/"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.1/"), false);
    assert.equal(isPublicHttpUrl("http://172.16.0.1/"), false);
    assert.equal(isPublicHttpUrl("http://172.31.255.1/"), false);
    assert.equal(isPublicHttpUrl("http://169.254.1.1/"), false);
  });

  it("rejects non-http schemes", () => {
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isPublicHttpUrl("ftp://example.com/a"), false);
    assert.equal(isPublicHttpUrl("not a url"), false);
  });
});

describe("looksLikeDocument", () => {
  it("detects pdf/docx/images", () => {
    assert.equal(looksLikeDocument("https://eraspb.ru/God_otchet_2011.pdf"), true);
    assert.equal(looksLikeDocument("https://x.com/a.docx"), true);
    assert.equal(looksLikeDocument("https://x.com/photo.jpg"), true);
    assert.equal(looksLikeDocument("https://x.com/team"), false);
  });
});
