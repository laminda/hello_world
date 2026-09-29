import { all, get, nowIso, run } from "./db.js";
import { emailIntelligence } from "./nlp.js";
import { usernameHypotheses } from "./strategy.js";
import type { InvestigationInput } from "./types.js";

/**
 * Inference is NEVER written as a fact.
 * Level 0 = direct (not used here)
 * Level 1 = strong inference from multiple sources
 * Level 2 = weak inference
 * Level 3 = search hypothesis
 */

const ZODIAC: Array<{ keys: string[]; from: string; to: string; name: string }> = [
  { keys: ["овен", "aries"], from: "03-21", to: "04-19", name: "Aries" },
  { keys: ["телец", "taurus"], from: "04-20", to: "05-20", name: "Taurus" },
  { keys: ["близнец", "gemini"], from: "05-21", to: "06-20", name: "Gemini" },
  { keys: ["рак", "cancer"], from: "06-21", to: "07-22", name: "Cancer" },
  { keys: ["лев", "leo"], from: "07-23", to: "08-22", name: "Leo" },
  { keys: ["дева", "virgo"], from: "08-23", to: "09-22", name: "Virgo" },
  { keys: ["вес", "libra"], from: "09-23", to: "10-22", name: "Libra" },
  { keys: ["скорпион", "scorpio"], from: "10-23", to: "11-21", name: "Scorpio" },
  { keys: ["стрелец", "sagittarius"], from: "11-22", to: "12-21", name: "Sagittarius" },
  { keys: ["козерог", "capricorn"], from: "12-22", to: "01-19", name: "Capricorn" },
  { keys: ["водолей", "aquarius"], from: "01-20", to: "02-18", name: "Aquarius" },
  { keys: ["рыб", "pisces"], from: "02-19", to: "03-20", name: "Pisces" },
];

function nextHypId() {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM hypotheses`)!.c;
  return `HYP-${String(c + 1).padStart(6, "0")}`;
}
function nextInfId() {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM inferences`)!.c;
  return `INF-${String(c + 1).padStart(6, "0")}`;
}

export function addHypothesis(opts: {
  investigationId: string;
  statement: string;
  confidence: number;
  type: string;
  level: number;
  reason: string;
  evidence?: string;
  sourceId?: string;
  status?: string;
}) {
  const exists = get(
    `SELECT id FROM hypotheses WHERE investigation_id = ? AND statement = ?`,
    opts.investigationId,
    opts.statement
  );
  if (exists) return;
  run(
    `INSERT INTO hypotheses (id, investigation_id, statement, confidence, status, evidence, hyp_type, level, reason, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    nextHypId(),
    opts.investigationId,
    opts.statement,
    opts.confidence,
    opts.status ?? "OPEN",
    opts.evidence ?? null,
    opts.type,
    opts.level,
    opts.reason,
    opts.sourceId ?? null
  );
}

export function addInference(opts: {
  investigationId: string;
  level: number;
  inputFact: string;
  inference: Record<string, unknown>;
  confidence: number;
  reason: string;
}) {
  const exists = get(
    `SELECT id FROM inferences WHERE investigation_id = ? AND input_fact = ?`,
    opts.investigationId,
    opts.inputFact
  );
  if (exists) return;
  run(
    `INSERT INTO inferences (id, investigation_id, level, input_fact, inference_json, confidence, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, 'HYPOTHESIS', ?)`,
    nextInfId(),
    opts.investigationId,
    opts.level,
    opts.inputFact,
    JSON.stringify(opts.inference),
    opts.confidence,
    opts.reason
  );
  addHypothesis({
    investigationId: opts.investigationId,
    statement: `${opts.inputFact} ⇒ ${JSON.stringify(opts.inference)}`,
    confidence: opts.confidence,
    type: "inference",
    level: opts.level,
    reason: opts.reason,
  });
}

export function inferFromText(investigationId: string, text: string, sourceId?: string) {
  const lower = text.toLowerCase();
  for (const z of ZODIAC) {
    if (z.keys.some((k) => lower.includes(k))) {
      addInference({
        investigationId,
        level: 2,
        inputFact: `zodiac_sign=${z.name}`,
        inference: { possible_birth_period: [z.from, z.to], note: "NOT a birth date" },
        confidence: 0.4,
        reason: "Zodiac mention → approximate period only. Must not be stored as born_on.",
      });
      addHypothesis({
        investigationId,
        statement: `Possible birth period ${z.from} … ${z.to} (${z.name}) — search hypothesis, not a date`,
        confidence: 0.4,
        type: "birth_period",
        level: 3,
        reason: "zodiac is a weak inference; never write birth_date from it",
        sourceId,
        evidence: sourceId,
      });
    }
  }
}

export function inferFromEmail(investigationId: string, email: string) {
  const intel = emailIntelligence(email);
  addHypothesis({
    investigationId,
    statement: `email local_part=${intel.local_part} domain=${intel.domain}`,
    confidence: 0.7,
    type: "email_pivot",
    level: 1,
    reason: "direct parse of address structure",
  });
  for (const h of intel.hypotheses) {
    addHypothesis({
      investigationId,
      statement: h.statement,
      confidence: h.confidence,
      type: "email_name_guess",
      level: 3,
      reason: "local-part tokens are a search hypothesis, not identity proof",
    });
  }
  addInference({
    investigationId,
    level: 3,
    inputFact: `email=${email}`,
    inference: {
      possible_usernames: usernameHypotheses({ email }),
      possible_org_domain: intel.domain,
    },
    confidence: 0.4,
    reason: "email pivot → username/org hypotheses",
  });
}

export function inferFromInput(investigationId: string, input: InvestigationInput) {
  if (input.email) inferFromEmail(investigationId, input.email);
  const users = usernameHypotheses(input);
  for (const u of users.slice(0, 8)) {
    addHypothesis({
      investigationId,
      statement: `possible_username=${u}`,
      confidence: 0.35,
      type: "username",
      level: 3,
      reason: "generated from name/email pattern — not an account claim",
    });
  }
  if (input.notes) inferFromText(investigationId, input.notes);
}

export function addUserHint(investigationId: string, kind: string, value: string, note?: string) {
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM user_hints`)!.c;
  const id = `HINT-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO user_hints (id, investigation_id, kind, value, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'USER_HINT', ?)`,
    id,
    investigationId,
    kind,
    value,
    note ?? null,
    nowIso()
  );
  addHypothesis({
    investigationId,
    statement: `USER_HINT ${kind}=${value}`,
    confidence: 0.3,
    type: "user_hint",
    level: 3,
    reason: note || "analyst hint — not a fact until corroborated",
  });
  return id;
}

export function listHypotheses(investigationId: string) {
  return all<Record<string, unknown>>(
    `SELECT * FROM hypotheses WHERE investigation_id = ? ORDER BY confidence DESC`,
    investigationId
  );
}

export function listInferences(investigationId: string) {
  return all<Record<string, unknown>>(`SELECT * FROM inferences WHERE investigation_id = ?`, investigationId);
}
