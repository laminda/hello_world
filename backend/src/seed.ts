import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ASSETS, db, nowIso, run } from "./db.js";
import { addAlias, addFact, addTimelineEvent, relate, upsertEntity } from "./graph.js";
import { generateAliases } from "./nlp.js";
import { md5, saveDocument, saveOriginal, sha256 } from "./extract.js";
import { logAction } from "./db.js";

const INV = "INV-000001";

function src(
  id: string,
  url: string,
  type: string,
  title: string,
  publisher: string,
  snippet: string,
  publishedAt?: string
) {
  run(
    `INSERT OR REPLACE INTO sources (id, investigation_id, url, domain, source_type, title, publisher, published_at, discovered_at, snippet)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    INV,
    url,
    (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "demo.svod.local";
      }
    })(),
    type,
    title,
    publisher,
    publishedAt ?? null,
    nowIso(),
    snippet
  );
}

async function buildAnnualReportPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("COMPANY X  —  ANNUAL REPORT 2018", { x: 48, y: 780, size: 16, font, color: rgb(0.1, 0.15, 0.25) });
  page.drawText("Leadership and governance", { x: 48, y: 740, size: 12, font });
  const lines = [
    "Page 47. Executive management.",
    "Deputy Director: F.M. Ivanov (Fedor Mikhailovich Ivanov).",
    "Responsible for operations of the Moscow office since 2016.",
    "Email contact for the office of the deputy director: f.ivanov@company-x.ru",
    "The 2018 annual meeting confirmed the appointment first recorded in 2016.",
  ];
  lines.forEach((line, i) => {
    page.drawText(line, { x: 48, y: 700 - i * 22, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

export async function seedDemo() {
  const exists = db.prepare(`SELECT id FROM investigations WHERE id = ?`).get(INV) as { id: string } | undefined;
  if (exists) return INV;

  run(
    `INSERT INTO investigations (id, title, status, created_at, updated_at, stop_reason, is_demo)
     VALUES (?, ?, 'complete', ?, ?, ?, 1)`,
    INV,
    "Identification of Fedor Mikhailovich",
    nowIso(),
    nowIso(),
    "demo corpus — critical identity fields resolved with independent public-style evidence"
  );

  const inputs: Array<[string, string]> = [
    ["name", "Фёдор"],
    ["middle_name", "Михайлович"],
    ["position", "заместитель директора"],
    ["organization", "Компания X"],
    ["city", "Москва"],
  ];
  for (const [field, value] of inputs) {
    run(`INSERT INTO investigation_inputs (investigation_id, field, value) VALUES (?, ?, ?)`, INV, field, value);
  }

  const person = upsertEntity(INV, "PERSON", "Иванов Фёдор Михайлович", 0.96, "CONFIRMED", {
    birth_place: "Москва",
  });
  const orgX = upsertEntity(INV, "ORGANIZATION", "Компания X", 0.95, "CONFIRMED");
  const orgA = upsertEntity(INV, "ORGANIZATION", "Company A", 0.8, "SUPPORTED");
  const orgB = upsertEntity(INV, "ORGANIZATION", "Company B", 0.8, "SUPPORTED");
  const posDep = upsertEntity(INV, "POSITION", "заместитель директора", 0.99, "CONFIRMED");
  const posDir = upsertEntity(INV, "POSITION", "директор", 0.7, "SUPPORTED");
  const posHead = upsertEntity(INV, "POSITION", "начальник отдела", 0.75, "SUPPORTED");
  const moscow = upsertEntity(INV, "LOCATION", "Москва", 0.9, "SUPPORTED");
  const emailE = upsertEntity(INV, "EMAIL", "f.ivanov@company-x.ru", 0.72, "HYPOTHESIS");

  for (const a of generateAliases({ name: "Фёдор", middle_name: "Михайлович", last_name: "Иванов" })) {
    addAlias(person, a.alias, a.confidence, a.evidence);
  }
  addAlias(person, "Ф.М. Иванов", 0.93, "Annual Report 2018 p.47");
  addAlias(person, "F.M. Ivanov", 0.9, "Annual Report 2018 p.47");
  addAlias(person, "Fedor Ivanov", 0.85, "transliteration + press release");
  addAlias(person, "f.ivanov", 0.45, "email local-part hypothesis");

  src(
    "SRC-000001",
    "https://company-x.example/about",
    "official_site",
    "Компания X — руководство",
    "company-x.example",
    "Ф.М. Иванов, заместитель директора",
    "2019-05-01"
  );
  src(
    "SRC-000002",
    "https://web.archive.org/web/20190315000000/https://company-x.example/about",
    "archive",
    "Archived company page 2019",
    "web.archive.org",
    "Deputy Director F.M. Ivanov — Moscow office",
    "2019-03-15"
  );
  src(
    "SRC-000003",
    "https://company-x.example/reports/annual-2018.pdf",
    "document",
    "Annual Report 2018",
    "Компания X",
    "Page 47: Deputy Director F.M. Ivanov",
    "2019-03-15"
  );
  src(
    "SRC-000004",
    "https://media.example/press/2020-03-ivanov",
    "media",
    "Press release 2020: appointment confirmed",
    "Media Example",
    "Фёдор Михайлович Иванов продолжит работу в должности заместителя директора",
    "2020-03-12"
  );
  src(
    "SRC-000005",
    "https://conf.example/program-2017.pdf",
    "document",
    "Conference program 2017",
    "Industry Conf",
    "Speaker: Fedor M. Ivanov, Head of Department, Company X",
    "2017-09-01"
  );
  src(
    "SRC-000006",
    "https://staff.example/leaks-are-not-used",
    "media",
    "Secondary bio note (low independence)",
    "Mirror Daily",
    "Copy of the 2018 annual report paragraph — likely copied from SRC-000003",
    "2019-04-02"
  );
  run(`UPDATE sources SET copied_from = 'SRC-000003', independence = 'derived' WHERE id = 'SRC-000006'`);
  run(`UPDATE sources SET independence = 'independent' WHERE id IN ('SRC-000001','SRC-000003','SRC-000004','SRC-000005')`);
  run(`UPDATE sources SET independence = 'temporal' WHERE id = 'SRC-000002'`);

  run(
    `INSERT INTO source_snapshots (id, source_id, archive_url, snapshot_date, status, mime)
     VALUES ('SNAP-000001','SRC-000002','https://web.archive.org/web/20190315000000/https://company-x.example/about','20190315000000',200,'text/html')`
  );

  const pdfBuf = await buildAnnualReportPdf();
  const pdfPath = saveDocument("DOC-000001", pdfBuf, ".pdf");
  run(
    `INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, size, sha256, md5, created_at, document_date, language, page_count, storage_path, extracted_text)
     VALUES ('DOC-000001', ?, 'SRC-000003', 'Annual_Report_2018.pdf', 'application/pdf', ?, ?, ?, ?, '2019-03-15', 'en', 1, ?, ?)`,
    INV,
    pdfBuf.length,
    sha256(pdfBuf),
    md5(pdfBuf),
    nowIso(),
    pdfPath,
    "COMPANY X ANNUAL REPORT 2018. Page 47. Deputy Director: F.M. Ivanov (Fedor Mikhailovich Ivanov). Moscow office since 2016. f.ivanov@company-x.ru"
  );
  run(
    `INSERT INTO document_pages (document_id, page_number, text) VALUES ('DOC-000001', 47, ?)`,
    "Deputy Director: F.M. Ivanov (Fedor Mikhailovich Ivanov). Responsible for operations of the Moscow office since 2016."
  );

  const htmlAbout = `<!doctype html><html lang="ru"><head><title>Компания X — руководство</title></head>
<body><h1>Руководство</h1><p>Заместитель директора — Ф.М. Иванов (Фёдор Михайлович Иванов), Москва.</p>
<p>Назначен в 2016 году, подтверждён годовым собранием 2018.</p></body></html>`;
  const htmlBuf = Buffer.from(htmlAbout, "utf8");
  const htmlPath = saveDocument("DOC-000002", htmlBuf, ".html");
  run(
    `INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, size, sha256, md5, created_at, document_date, language, page_count, storage_path, extracted_text)
     VALUES ('DOC-000002', ?, 'SRC-000001', 'about.html', 'text/html', ?, ?, ?, ?, '2019-05-01', 'ru', 1, ?, ?)`,
    INV,
    htmlBuf.length,
    sha256(htmlBuf),
    md5(htmlBuf),
    nowIso(),
    htmlPath,
    "Заместитель директора — Ф.М. Иванов (Фёдор Михайлович Иванов), Москва. Назначен в 2016 году."
  );

  const press = `Press release 12 March 2020. Company X confirms that Fedor Mikhailovich Ivanov, deputy director, continues to oversee the Moscow office. Previously Head of Department (2016).`;
  const pressBuf = Buffer.from(press, "utf8");
  const pressPath = saveDocument("DOC-000003", pressBuf, ".txt");
  run(
    `INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, size, sha256, md5, created_at, document_date, language, page_count, storage_path, extracted_text)
     VALUES ('DOC-000003', ?, 'SRC-000004', 'press-2020.txt', 'text/plain', ?, ?, ?, ?, '2020-03-12', 'en', 1, ?, ?)`,
    INV,
    pressBuf.length,
    sha256(pressBuf),
    md5(pressBuf),
    nowIso(),
    pressPath,
    press
  );

  // Synthetic image (original never overwritten)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800">
    <rect width="100%" height="100%" fill="#1a2332"/>
    <rect x="40" y="40" width="560" height="720" fill="#0e1622" stroke="#d4a017" stroke-width="2"/>
    <text x="320" y="90" fill="#d4a017" font-size="18" font-family="sans-serif" text-anchor="middle">COMPANY X  ·  2018</text>
    <circle cx="320" cy="280" r="90" fill="#243044" stroke="#3ec8d8" stroke-width="3"/>
    <text x="320" y="430" fill="#e8eef7" font-size="22" font-family="sans-serif" text-anchor="middle">Ф.М. Иванов</text>
    <text x="320" y="465" fill="#8b9bb4" font-size="14" font-family="sans-serif" text-anchor="middle">заместитель директора</text>
    <text x="320" y="520" fill="#3ec8d8" font-size="12" font-family="monospace" text-anchor="middle">BADGE / NAMEPLATE</text>
  </svg>`;
  const imgBuf = Buffer.from(svg);
  const imgPath = saveOriginal("IMG-000001", imgBuf, ".svg");
  fs.copyFileSync(imgPath, path.join(ASSETS.previews, "IMG-000001.svg"));
  run(
    `INSERT INTO images (id, investigation_id, document_id, source_id, original_url, storage_path, sha256, width, height, created_at, caption)
     VALUES ('IMG-000001', ?, 'DOC-000001', 'SRC-000003', 'embedded:annual-2018-p47', ?, ?, 640, 800, ?, 'Nameplate on page 47 of Annual Report 2018')`,
    INV,
    imgPath,
    sha256(imgBuf),
    nowIso()
  );
  run(
    `INSERT INTO image_metadata (image_id, key, value, source, extracted_at) VALUES
     ('IMG-000001','Artist','F.M. Ivanov','EXIF',?),
     ('IMG-000001','DateTimeOriginal','2018:04:17 14:31:22','EXIF',?),
     ('IMG-000001','Software','Report layout engine','EXIF',?),
     ('IMG-000001','Copyright','Company X','EXIF',?)`,
    nowIso(),
    nowIso(),
    nowIso(),
    nowIso()
  );
  run(
    `INSERT INTO faces (id, image_id, bbox_json, embedding_note) VALUES ('FACE-001','IMG-000001', ?, 'clustering signal only — not proof of identity')`,
    JSON.stringify([220, 190, 420, 370])
  );
  run(
    `INSERT INTO ocr_results (image_id, document_id, text, confidence, bbox_json, language)
     VALUES ('IMG-000001','DOC-000001','Ф.М. Иванов', 0.91, ?, 'ru')`,
    JSON.stringify([120, 300, 540, 370])
  );
  run(
    `INSERT INTO ocr_results (image_id, document_id, text, confidence, bbox_json, language)
     VALUES ('IMG-000001','DOC-000001','заместитель директора', 0.88, ?, 'ru')`,
    JSON.stringify([140, 445, 500, 480])
  );

  const fact = (
    id: string,
    pred: string,
    value: string,
    status: string,
    conf: number,
    extract: string,
    page: number | null,
    extra: { from?: string; to?: string; docDate?: string; object?: string } = {}
  ) => {
    run(
      `INSERT INTO facts (id, investigation_id, subject_entity_id, predicate, object_entity_id, value, valid_from, valid_to, document_date, created_at, status, confidence, extract, page)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      INV,
      person,
      pred,
      extra.object ?? null,
      value,
      extra.from ?? null,
      extra.to ?? null,
      extra.docDate ?? null,
      nowIso(),
      status,
      conf,
      extract,
      page
    );
  };

  fact("FACT-000001", "full_name", "Иванов Фёдор Михайлович", "CONFIRMED", 0.96, "Ф.М. Иванов / Fedor Mikhailovich Ivanov", 47);
  fact("FACT-000002", "held_position", "заместитель директора", "CONFIRMED", 0.99, "...Deputy Director: F.M. Ivanov...", 47, {
    from: "2018-01-01",
    to: "2020-12-31",
    docDate: "2019-03-15",
    object: posDep,
  });
  fact("FACT-000003", "works_at", "Компания X", "CONFIRMED", 0.95, "operations of the Moscow office", 47, { object: orgX });
  fact("FACT-000004", "born_on", "1981", "CONFLICT", 0.62, "Secondary bio note lists birth year 1981", null);
  fact("FACT-000005", "born_on", "1982", "CONFLICT", 0.58, "Conference bio lists birth year 1982", null);
  fact("FACT-000006", "born_in", "Москва", "UNVERIFIED", 0.61, "city mentioned without vital-record source", null, {
    object: moscow,
  });
  fact("FACT-000007", "has_email", "f.ivanov@company-x.ru", "HYPOTHESIS", 0.55, "f.ivanov@company-x.ru in annual report", 47, {
    object: emailE,
  });
  fact("FACT-000008", "held_position", "начальник отдела", "SUPPORTED", 0.78, "Head of Department, Company X", null, {
    from: "2016-01-01",
    to: "2018-12-31",
    object: posHead,
  });
  fact("FACT-000009", "held_position", "директор", "SUPPORTED", 0.7, "2024 directory lists Director", null, {
    from: "2024-01-01",
    object: posDir,
  });

  const links: Array<[string, string, string | null, number | null]> = [
    ["FACT-000001", "SRC-000003", "DOC-000001", 47],
    ["FACT-000001", "SRC-000001", "DOC-000002", null],
    ["FACT-000001", "SRC-000004", "DOC-000003", null],
    ["FACT-000002", "SRC-000003", "DOC-000001", 47],
    ["FACT-000002", "SRC-000002", null, null],
    ["FACT-000002", "SRC-000004", "DOC-000003", null],
    ["FACT-000003", "SRC-000001", "DOC-000002", null],
    ["FACT-000003", "SRC-000003", "DOC-000001", 47],
    ["FACT-000004", "SRC-000006", null, null],
    ["FACT-000005", "SRC-000005", null, null],
    ["FACT-000006", "SRC-000001", "DOC-000002", null],
    ["FACT-000007", "SRC-000003", "DOC-000001", 47],
    ["FACT-000008", "SRC-000005", null, null],
    ["FACT-000009", "SRC-000004", "DOC-000003", null],
  ];
  for (const [fid, sid, did, page] of links) {
    run(
      `INSERT INTO fact_sources (fact_id, source_id, document_id, extract, page) VALUES (?, ?, ?, ?, ?)`,
      fid,
      sid,
      did,
      null,
      page
    );
  }

  relate(INV, person, orgX, "WORKED_AT", "Компания X", 0.95);
  relate(INV, person, orgA, "WORKED_AT", "Company A", 0.7);
  relate(INV, person, orgB, "WORKED_AT", "Company B", 0.7);
  relate(INV, person, posDep, "HELD_POSITION", "заместитель директора", 0.99);
  relate(INV, person, posDir, "HELD_POSITION", "директор", 0.7);
  relate(INV, person, moscow, "BORN_IN", "Москва", 0.61);
  relate(INV, person, emailE, "HAS_EMAIL", "f.ivanov@company-x.ru", 0.55);
  relate(INV, person, "DOC-000001", "APPEARS_IN", "Annual Report 2018", 0.9);
  relate(INV, person, "IMG-000001", "PHOTOGRAPHED_IN", "page 47 nameplate", 0.7);
  relate(INV, "SRC-000006", "SRC-000003", "COPIED_FROM", "text reuse", 0.8);

  const tl: Array<[string, string, string, string, number, string]> = [
    ["TL-000001", "2008", "Company A — аналитик", "SRC-000005", 0.55, "OBSERVED"],
    ["TL-000002", "2012", "Company B — руководитель группы", "SRC-000005", 0.6, "OBSERVED"],
    ["TL-000003", "2016", "Компания X — начальник отдела", "SRC-000005", 0.78, "SUPPORTED"],
    ["TL-000004", "2018", "Компания X — заместитель директора (годовой отчёт)", "SRC-000003", 0.99, "CONFIRMED"],
    ["TL-000005", "2019", "Архивная страница компании подтверждает должность", "SRC-000002", 0.9, "SUPPORTED"],
    ["TL-000006", "2020", "Пресс-релиз: должность подтверждена", "SRC-000004", 0.92, "SUPPORTED"],
    ["TL-000007", "2024", "Директор (независимых источников мало)", "SRC-000004", 0.7, "SUPPORTED"],
  ];
  for (const [id, date, event, source, conf, status] of tl) {
    run(
      `INSERT INTO timeline_events (id, investigation_id, entity_id, date, event, source_id, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      INV,
      person,
      date,
      event,
      source,
      conf,
      status
    );
  }

  run(
    `INSERT INTO contradictions (id, investigation_id, field, values_json, status, created_at)
     VALUES ('CONF-000001', ?, 'born_on', ?, 'UNRESOLVED', ?)`,
    INV,
    JSON.stringify(["1981", "1982"]),
    nowIso()
  );

  run(
    `INSERT INTO hypotheses (id, investigation_id, statement, confidence, status, evidence)
     VALUES ('HYP-000001', ?, 'f = Fedor, ivanov = Ivanov from email local_part f.ivanov', 0.4, 'HYPOTHESIS', 'SRC-000003'),
            ('HYP-000002', ?, 'Birth year is 1981 or 1982 — do not guess', 0.5, 'HYPOTHESIS', 'CONF-000001')`,
    INV,
    INV
  );

  const queries: Array<[string, string, string, string, string]> = [
    ["Q-000001", `"Фёдор Михайлович" "заместитель директора"`, "duckduckgo", "IDENTITY", "identify surname"],
    ["Q-000002", `"Фёдор Михайлович" "Компания X"`, "duckduckgo", "ORGANIZATION", "link person to organization"],
    ["Q-000003", `"Фёдор Михайлович" Москва`, "duckduckgo", "IDENTITY", "constrain by city"],
    ["Q-000004", `"Фёдор Михайлович" filetype:pdf`, "duckduckgo", "DOCUMENT", "discover documents"],
    ["Q-000005", `"F.M. Ivanov" "Company X"`, "duckduckgo", "IDENTITY", "latin alias search"],
  ];
  for (const [id, query, engine, qc, reason] of queries) {
    run(
      `INSERT INTO search_queries (id, investigation_id, query, engine, query_class, reason, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      INV,
      query,
      engine,
      qc,
      reason,
      nowIso()
    );
  }
  run(
    `INSERT INTO search_results (query_id, url, title, snippet, provider, rank, selected, selection_reason)
     VALUES ('Q-000001','https://company-x.example/reports/annual-2018.pdf','Annual Report 2018','Deputy Director F.M. Ivanov','demo',1,1,'identify surname'),
            ('Q-000001','https://company-x.example/about','Компания X — руководство','Ф.М. Иванов, заместитель директора','demo',2,1,'official site'),
            ('Q-000002','https://media.example/press/2020-03-ivanov','Press release 2020','Фёдор Михайлович Иванов','demo',1,1,'position confirmation')`
  );

  const log: Array<[string, string]> = [
    ["info", "Investigation agent started"],
    ["info", "Search planner generated 11 strategies"],
    ["graph", "Alias engine produced 12 variants for Фёдор Михайлович"],
    ["search", 'QUERY [IDENTITY] "Фёдор Михайлович" "заместитель директора"'],
    ["search", "Reason: identify surname"],
    ["search", "Result: company-x.example/reports/annual-2018.pdf"],
    ["extract", "Action: download · SHA-256 recorded · PDF page 47 extracted"],
    ["extract", 'OCR on page image: "Ф.М. Иванов" conf=0.91'],
    ["extract", "EXIF Artist=F.M. Ivanov — stored as evidence, not truth"],
    ["graph", "Entity resolution: F.M. Ivanov ≈ Фёдор Михайлович Иванов (0.93) → LIKELY SAME ENTITY"],
    ["search", "Wayback: archived company page 2019 attached as independent temporal source"],
    ["conflict", "CONFLICT on born_on: 1981 | 1982 — UNRESOLVED. System will not fill the field with a guess."],
    ["success", "Stop condition: ФИО CONFIRMED, должность CONFIRMED, организация CONFIRMED, дата рождения CONFLICT, место рождения UNVERIFIED"],
  ];
  for (const [level, message] of log) logAction(INV, level, message);

  run(
    `INSERT INTO audit_log (ts, actor, action, target, detail) VALUES (?, 'analyst', 'investigation.create', ?, 'demo seed')`,
    nowIso(),
    INV
  );

  return INV;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemo().then((id) => {
    console.log("seeded", id);
  });
}
