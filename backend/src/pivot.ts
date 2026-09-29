import { all, get, run } from "./db.js";
import { usernameHypotheses } from "./strategy.js";
import { addHypothesis } from "./inference.js";
import { upsertEntity, relate } from "./graph.js";
import type { InvestigationInput } from "./types.js";

export function addPivot(
  investigationId: string,
  fromKind: string,
  fromValue: string,
  toKind: string,
  toValue: string,
  reason: string,
  confidence: number
) {
  const exists = get(
    `SELECT id FROM pivots WHERE investigation_id = ? AND from_kind = ? AND from_value = ? AND to_kind = ? AND to_value = ?`,
    investigationId,
    fromKind,
    fromValue,
    toKind,
    toValue
  );
  if (exists) return;
  run(
    `INSERT INTO pivots (investigation_id, from_kind, from_value, to_kind, to_value, reason, confidence, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
    investigationId,
    fromKind,
    fromValue,
    toKind,
    toValue,
    reason,
    confidence
  );
}

export function addIdentifier(opts: {
  investigationId: string;
  kind: string;
  value: string;
  priority: "high" | "medium" | "low";
  status?: string;
  source?: string;
  confidence?: number;
  note?: string;
}) {
  const exists = get(
    `SELECT id FROM identifiers WHERE investigation_id = ? AND kind = ? AND value = ?`,
    opts.investigationId,
    opts.kind,
    opts.value
  );
  if (exists) return exists.id as string;
  const c = get<{ c: number }>(`SELECT COUNT(*) as c FROM identifiers`)!.c;
  const id = `IDN-${String(c + 1).padStart(6, "0")}`;
  run(
    `INSERT INTO identifiers (id, investigation_id, kind, value, priority, status, source, confidence, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.investigationId,
    opts.kind,
    opts.value,
    opts.priority,
    opts.status ?? "OBSERVED",
    opts.source ?? null,
    opts.confidence ?? 0.5,
    opts.note ?? null
  );
  return id;
}

const PRIORITY: Record<string, "high" | "medium" | "low"> = {
  inn: "high",
  official_id: "high",
  birth_date: "high",
  official_document: "high",
  email: "high",
  full_name_org: "medium",
  name_city: "medium",
  username_org: "medium",
  username: "low",
  given_name: "low",
  face: "low",
  email_local_part: "low",
};

export function buildPivots(investigationId: string, input: InvestigationInput) {
  const name = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  if (name) {
    addIdentifier({
      investigationId,
      kind: "name",
      value: name,
      priority: input.organization ? "medium" : "low",
      note: "name alone is a weak identifier",
    });
  }
  if (input.organization) {
    addIdentifier({ investigationId, kind: "organization", value: input.organization, priority: "medium" });
    addPivot(investigationId, "NAME", name || "target", "ORG", input.organization, "seed organization", 0.6);
    const domainGuess = input.organization
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    if (domainGuess.length > 3) {
      addPivot(investigationId, "ORG", input.organization, "DOMAIN", domainGuess, "org → possible domain (hypothesis)", 0.3);
    }
  }
  if (input.email) {
    addIdentifier({
      investigationId,
      kind: "email",
      value: input.email,
      priority: "high",
      note: "corporate email is a strong identifier for the mailbox, not for every biographic field",
    });
    const [local, domain] = input.email.split("@");
    addPivot(investigationId, "EMAIL", input.email, "DOMAIN", domain, "email domain", 0.9);
    addPivot(investigationId, "EMAIL", input.email, "USERNAME", local, "local_part as username hypothesis", 0.4);
    const eid = upsertEntity(investigationId, "EMAIL", input.email, 0.7, "OBSERVED");
    const did = upsertEntity(investigationId, "ORGANIZATION", domain, 0.45, "HYPOTHESIS");
    relate(investigationId, eid, did, "DOMAIN_OF", domain, 0.5);
  }
  if (input.username) {
    addIdentifier({
      investigationId,
      kind: "username",
      value: input.username,
      priority: "low",
      note: "identical username is not identity proof",
    });
    addPivot(investigationId, "USERNAME", input.username, "SOCIAL", input.username, "username → social search", 0.35);
  }
  const inn = (input as { inn?: string }).inn;
  if (inn) {
    addIdentifier({
      investigationId,
      kind: "inn",
      value: inn,
      priority: "high",
      status: "HYPOTHESIS",
      note: "INN confirms a permitted registry record, not a job title",
    });
    addPivot(investigationId, "INN", inn, "REGISTRY", inn, "lawful public record pivot", 0.7);
    addHypothesis({
      investigationId,
      statement: `INN ${inn} may resolve FIO/org in a permitted public registry — position still needs independent evidence`,
      confidence: 0.55,
      type: "inn_pivot",
      level: 1,
      reason: "strong identifier, weak for current position",
    });
  }
  for (const u of usernameHypotheses(input).slice(0, 6)) {
    addPivot(investigationId, "NAME", name || "target", "USERNAME", u, "generated username variant", 0.3);
    const uid = upsertEntity(investigationId, "USERNAME", u, 0.35, "HYPOTHESIS");
    void uid;
  }
  if (input.url) {
    addPivot(investigationId, "ORG", input.organization || "site", "URL", input.url, "analyst seed URL", 0.8);
    addPivot(investigationId, "URL", input.url, "ARCHIVE", input.url, "wayback snapshots", 0.6);
  }
}

export function pivotGraph(investigationId: string) {
  const nodes = new Map<string, { id: string; kind: string; label: string }>();
  const edges: Array<{ from: string; to: string; reason: string; confidence: number }> = [];
  const addNode = (kind: string, label: string) => {
    const id = `${kind}:${label}`;
    if (!nodes.has(id)) nodes.set(id, { id, kind, label });
    return id;
  };
  const pivots = all<{
    from_kind: string;
    from_value: string;
    to_kind: string;
    to_value: string;
    reason: string;
    confidence: number;
  }>(`SELECT from_kind, from_value, to_kind, to_value, reason, confidence FROM pivots WHERE investigation_id = ?`, investigationId);
  for (const p of pivots) {
    const a = addNode(p.from_kind, p.from_value);
    const b = addNode(p.to_kind, p.to_value);
    edges.push({ from: a, to: b, reason: p.reason, confidence: p.confidence });
  }
  const identifiers = all<{ kind: string; value: string; priority: string; status: string; confidence: number }>(
    `SELECT kind, value, priority, status, confidence FROM identifiers WHERE investigation_id = ?`,
    investigationId
  );
  return { nodes: [...nodes.values()], edges, identifiers, priority: PRIORITY };
}
