import { get, nowIso, run } from "./db.js";
import { seedCatalog, recordEffectiveness } from "./registry.js";
import { addHypothesis, addInference } from "./inference.js";
import { addIdentifier, addPivot } from "./pivot.js";

const INV = "INV-000001";

export function seedStrategyLayer() {
  seedCatalog();

  recordEffectiveness({ sourceId: "youtube", targetType: "public_top_manager", queries: 100, hits: 17, usefulFacts: 17, uniqueFacts: 12 });
  recordEffectiveness({ sourceId: "youtube", targetType: "middle_manager", queries: 40, hits: 8, usefulFacts: 5, uniqueFacts: 3 });
  recordEffectiveness({ sourceId: "youtube", targetType: "low_level_employee", queries: 30, hits: 2, usefulFacts: 0, uniqueFacts: 0 });
  recordEffectiveness({ sourceId: "annual_reports", targetType: "middle_manager", queries: 20, hits: 14, usefulFacts: 11, uniqueFacts: 9 });
  recordEffectiveness({ sourceId: "document_search", targetType: "low_level_employee", queries: 25, hits: 12, usefulFacts: 9, uniqueFacts: 7 });
  recordEffectiveness({ sourceId: "web_archive", targetType: "middle_manager", queries: 18, hits: 10, usefulFacts: 6, uniqueFacts: 4 });

  const inv = get<{ id: string }>(`SELECT id FROM investigations WHERE id = ?`, INV);
  if (!inv) return;

  run(
    `UPDATE investigations SET target_type = 'middle_manager', preset_id = 'middle_manager' WHERE id = ?`,
    INV
  );

  const already = get(`SELECT id FROM identifiers WHERE investigation_id = ? AND kind = 'email'`, INV);
  if (already) return;

  addIdentifier({
    investigationId: INV,
    kind: "email",
    value: "f.ivanov@company-x.ru",
    priority: "high",
    status: "HYPOTHESIS",
    source: "SRC-000003",
    confidence: 0.55,
    note: "from annual report — mailbox claim, not biographic proof",
  });
  addIdentifier({
    investigationId: INV,
    kind: "username",
    value: "f.ivanov",
    priority: "low",
    status: "HYPOTHESIS",
    source: "email local_part",
    confidence: 0.35,
    note: "username match ≠ same person",
  });
  addIdentifier({
    investigationId: INV,
    kind: "name",
    value: "Иванов Фёдор Михайлович",
    priority: "medium",
    confidence: 0.96,
    source: "FACT-000001",
  });
  addIdentifier({
    investigationId: INV,
    kind: "organization",
    value: "Компания X",
    priority: "medium",
    confidence: 0.95,
  });

  addPivot(INV, "NAME", "Иванов Фёдор Михайлович", "ORG", "Компания X", "confirmed works_at", 0.95);
  addPivot(INV, "ORG", "Компания X", "DOMAIN", "company-x.ru", "email domain hypothesis", 0.55);
  addPivot(INV, "EMAIL", "f.ivanov@company-x.ru", "USERNAME", "f.ivanov", "local_part → username hypothesis", 0.4);
  addPivot(INV, "USERNAME", "f.ivanov", "SOCIAL", "f.ivanov", "social search — not identity", 0.3);
  addPivot(INV, "ORG", "Компания X", "PDF", "Annual_Report_2018.pdf", "document discovery", 0.9);
  addPivot(INV, "PDF", "Annual_Report_2018.pdf", "PHOTO", "IMG-000001", "page 47 nameplate", 0.7);
  addPivot(INV, "PHOTO", "IMG-000001", "EXIF", "2018:04:17 14:31:22", "EXIF is evidence, not truth", 0.5);
  addPivot(INV, "ORG", "Компания X", "ARCHIVE", "company-x.example/about@2019", "wayback snapshot", 0.85);
  addPivot(INV, "NAME", "Иванов Фёдор Михайлович", "YOUTUBE", "search:interview", "preset recommends video for mid/public roles", 0.6);

  addInference({
    investigationId: INV,
    level: 2,
    inputFact: "zodiac_sign=Aries",
    inference: { possible_birth_period: ["03-21", "04-19"], note: "NOT a birth date" },
    confidence: 0.4,
    reason: "Document joke «Иванов — Овен» → period hypothesis. Forbidden to write born_on=10 April.",
  });
  addHypothesis({
    investigationId: INV,
    statement: "possible_username=f.ivanov from email local_part — search hypothesis, not an account claim",
    confidence: 0.4,
    type: "username",
    level: 3,
    reason: "email pivot",
    evidence: "SRC-000003",
    sourceId: "SRC-000003",
  });
  addHypothesis({
    investigationId: INV,
    statement: "USER_HINT: nickname fedor1985 (analyst) — not a fact",
    confidence: 0.3,
    type: "user_hint",
    level: 3,
    reason: "manual hint",
    status: "OPEN",
  });
  addHypothesis({
    investigationId: INV,
    statement: "YouTube interview may yield education / career dates for a deputy director (priority MEDIUM, not HIGH)",
    confidence: 0.5,
    type: "source_recommendation",
    level: 3,
    reason: "preset middle_manager",
    status: "OPEN",
  });

  run(
    `INSERT INTO user_hints (id, investigation_id, kind, value, note, status, created_at)
     VALUES ('HINT-000001', ?, 'username', 'fedor1985', 'Кажется, он использует никнейм fedor1985', 'USER_HINT', ?)`,
    INV,
    nowIso()
  );

  run(
    `UPDATE facts SET temporal_relevance = 'HISTORICAL', extraction_confidence = 0.99, source_reliability = 0.9,
       entity_match = 0.94, independence_score = 3
     WHERE id = 'FACT-000002'`
  );
  run(
    `UPDATE facts SET temporal_relevance = 'CURRENT', extraction_confidence = 0.7, source_reliability = 0.65,
       entity_match = 0.7, independence_score = 1
     WHERE id = 'FACT-000009'`
  );
  run(
    `UPDATE facts SET temporal_relevance = 'UNKNOWN', extraction_confidence = 0.99, source_reliability = 0.9,
       entity_match = 0.96, independence_score = 3
     WHERE id = 'FACT-000001'`
  );

  run(
    `INSERT INTO strategy_runs (investigation_id, ts, target_type, preset_id, recommendation_json, selected_source, score)
     VALUES (?, ?, 'middle_manager', 'middle_manager', ?, 'document_search', 2.41)`,
    INV,
    nowIso(),
    JSON.stringify([
      { source_id: "document_search", name: "Document discovery", score: 2.41, reason: "highest expected information gain for deputy director" },
      { source_id: "annual_reports", name: "Annual reports", score: 2.28, reason: "staff lists in PDFs" },
      { source_id: "web_archive", name: "Web Archive", score: 2.05, reason: "old company pages" },
      { source_id: "conference_sites", name: "Conferences", score: 1.92, reason: "speaker programs" },
      { source_id: "youtube", name: "YouTube", score: 1.55, reason: "MEDIUM relevance for middle manager — not first" },
    ])
  );

  run(
    `INSERT INTO investigation_actions (investigation_id, ts, level, message, data_json)
     VALUES (?, ?, 'info', 'Strategy engine: target=middle_manager preset=MIDDLE_MANAGER. YouTube deprioritized vs documents.', NULL),
            (?, ?, 'graph', 'Pivot: EMAIL → USERNAME f.ivanov (hypothesis, not identity).', NULL),
            (?, ?, 'info', 'Inference: zodiac Aries → birth period 21 Mar–19 Apr stored as HYPOTHESIS. born_on untouched.', NULL)`,
    INV,
    nowIso(),
    INV,
    nowIso(),
    INV,
    nowIso()
  );
}
