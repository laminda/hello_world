import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extFromUrlOrMime, extractHtmlContent, extractPdfStrings, md5, sha256 } from "../src/extract.js";

describe("hashes", () => {
  it("sha256/md5 of known bytes", () => {
    const buf = Buffer.from("abc", "utf8");
    assert.equal(sha256(buf), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(md5(buf), "900150983cd24fb0d6963f7d28e17f72");
  });
});

describe("extractHtmlContent", () => {
  it("drops script/nav and keeps article text", () => {
    const html = `<html><head><title>Team</title></head>
      <body>
        <nav>menu</nav>
        <script>alert(1)</script>
        <article><h1>Камилла Ковешникова</h1><p>Директор инвестиционного департамента</p></article>
        <footer>cookies</footer>
      </body></html>`;
    const { title, text, headings } = extractHtmlContent(html);
    assert.equal(title, "Team");
    assert.ok(text.includes("инвестиционного"));
    assert.equal(text.includes("alert"), false);
    assert.ok(headings.some((h) => /Камилла/.test(h)));
  });
});

describe("extractPdfStrings", () => {
  it("reads printable PDF literal strings", () => {
    const buf = Buffer.from("%PDF-1.4\n(General Director Tatarsky V.S.)\nend", "latin1");
    const text = extractPdfStrings(buf);
    assert.match(text, /Tatarsky/);
  });
});

describe("extFromUrlOrMime", () => {
  it("prefers URL extension then mime", () => {
    assert.equal(extFromUrlOrMime("https://x.com/a.PDF", "application/octet-stream"), ".pdf");
    assert.equal(extFromUrlOrMime("https://x.com/x", "application/pdf"), ".pdf");
    assert.equal(extFromUrlOrMime("https://x.com/x", "image/jpeg"), ".jpg");
    assert.equal(extFromUrlOrMime("https://x.com/x", "unknown"), ".bin");
  });
});
