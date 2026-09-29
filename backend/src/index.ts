import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { all, ASSETS, audit, DATA_DIR, db, get, nowIso, ROOT, run } from "./db.js";
import { seedDemo } from "./seed.js";
import { seedStrategyLayer } from "./seed-strategy.js";
import { bus, ingestManual, runInvestigation, runOneTool, stopInvestigation } from "./agent.js";
import { listMethodologies, listToolCalls, listTools, llmStatus } from "./osint-tools.js";
import { investigationMetrics } from "./metrics.js";
import { identityConfidence, listCandidates } from "./person.js";
import type { InvestigationInput } from "./types.js";
import { readSettings, writeSettings } from "./settings.js";
import { investigationGraph } from "./graph.js";
import { knownUnknown, planQueries } from "./planner.js";
import { classifyTarget, recommendNext, strategyState } from "./strategy.js";
import { listCatalog, setCatalogEnabled } from "./registry.js";
import { createConnector, listConnectors } from "./connectors.js";
import { listInferences } from "./inference.js";
import { pivotGraph } from "./pivot.js";

const PORT = Number(process.env.PORT || 3001);
const HOST = "0.0.0.0";

const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });

await app.register(cors, { origin: true });

for (const [name, dir] of Object.entries(ASSETS)) {
  fs.mkdirSync(dir, { recursive: true });
  await app.register(fastifyStatic, {
    root: dir,
    prefix: `/files/${name}/`,
    decorateReply: false,
  });
}

function nextInvId() {
  const row = get<{ c: number }>(`SELECT COUNT(*) as c FROM investigations`)!;
  return `INV-${String(row.c + 1).padStart(6, "0")}`;
}

app.get("/api/health", async () => ({ ok: true, service: "svod-api", ts: nowIso() }));

app.get("/api/investigations", async () => {
  const rows = all<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
    is_demo: number;
  }>(`SELECT id, title, status, created_at, updated_at, is_demo FROM investigations ORDER BY created_at DESC`);
  return rows.map((r) => {
    const facts = get<{ c: number }>(`SELECT COUNT(*) as c FROM facts WHERE investigation_id = ?`, r.id)!.c;
    const sources = get<{ c: number }>(`SELECT COUNT(*) as c FROM sources WHERE investigation_id = ?`, r.id)!.c;
    const conflicts = get<{ c: number }>(
      `SELECT COUNT(*) as c FROM contradictions WHERE investigation_id = ? AND status = 'UNRESOLVED'`,
      r.id
    )!.c;
    return { ...r, facts, sources, conflicts };
  });
});

app.post("/api/investigations", async (req, reply) => {
  const body = (req.body ?? {}) as InvestigationInput & { title?: string };
  const id = nextInvId();
  const title =
    body.title ||
    `Identification of ${[body.name, body.middle_name, body.last_name].filter(Boolean).join(" ") || "unknown"}`;
  run(
    `INSERT INTO investigations (id, title, status, created_at, updated_at, is_demo)
     VALUES (?, ?, 'draft', ?, ?, 0)`,
    id,
    title,
    nowIso(),
    nowIso()
  );
  const fields: Array<keyof InvestigationInput> = [
    "full_name",
    "name",
    "middle_name",
    "last_name",
    "position",
    "organization",
    "city",
    "age",
    "birth_year",
    "url",
    "email",
    "phone",
    "username",
    "notes",
    "inn",
  ];
  for (const f of fields) {
    const v = body[f];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      run(`INSERT INTO investigation_inputs (investigation_id, field, value) VALUES (?, ?, ?)`, id, f, String(v));
    }
  }
  audit("investigation.create", id, title, "analyst");
  reply.code(201);
  return { id, title, status: "draft" };
});

app.get("/api/investigations/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get<Record<string, unknown>>(`SELECT * FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  const inputs = all<{ field: string; value: string }>(
    `SELECT field, value FROM investigation_inputs WHERE investigation_id = ?`,
    id
  );
  const input: Record<string, string> = {};
  for (const r of inputs) input[r.field] = r.value;
  const ku = knownUnknown(input);
  return { ...inv, input, known: ku.known, unknown: ku.unknown, planned: planQueries(input) };
});

app.get("/api/investigations/:id/workspace", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get<Record<string, unknown>>(`SELECT * FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  const inputs = all<{ field: string; value: string }>(
    `SELECT field, value FROM investigation_inputs WHERE investigation_id = ?`,
    id
  );
  const facts = all<Record<string, unknown>>(
    `SELECT * FROM facts WHERE investigation_id = ? ORDER BY confidence DESC`,
    id
  );
  const sources = all<Record<string, unknown>>(
    `SELECT * FROM sources WHERE investigation_id = ? ORDER BY discovered_at DESC`,
    id
  );
  const documents = all<Record<string, unknown>>(
    `SELECT id, source_id, filename, mime_type, size, sha256, md5, document_date, language, page_count, storage_path,
            substr(extracted_text, 1, 2000) AS extracted_text
     FROM documents WHERE investigation_id = ?`,
    id
  );
  const images = all<Record<string, unknown>>(`SELECT * FROM images WHERE investigation_id = ?`, id);
  const imageIds = images.map((i) => i.id as string);
  const metadata =
    imageIds.length === 0
      ? []
      : all<Record<string, unknown>>(
          `SELECT * FROM image_metadata WHERE image_id IN (${imageIds.map(() => "?").join(",")})`,
          ...imageIds
        );
  const faces =
    imageIds.length === 0
      ? []
      : all<Record<string, unknown>>(
          `SELECT * FROM faces WHERE image_id IN (${imageIds.map(() => "?").join(",")})`,
          ...imageIds
        );
  const ocr = all<Record<string, unknown>>(
    `SELECT * FROM ocr_results WHERE image_id IN (SELECT id FROM images WHERE investigation_id = ?)
     OR document_id IN (SELECT id FROM documents WHERE investigation_id = ?)`,
    id,
    id
  );
  const entities = all<Record<string, unknown>>(`SELECT * FROM entities WHERE investigation_id = ?`, id);
  const aliases = all<Record<string, unknown>>(
    `SELECT a.* FROM entity_aliases a JOIN entities e ON e.id = a.entity_id WHERE e.investigation_id = ?`,
    id
  );
  const timeline = all<Record<string, unknown>>(
    `SELECT * FROM timeline_events WHERE investigation_id = ? ORDER BY date ASC`,
    id
  );
  const contradictions = all<Record<string, unknown>>(`SELECT * FROM contradictions WHERE investigation_id = ?`, id);
  const hypotheses = all<Record<string, unknown>>(`SELECT * FROM hypotheses WHERE investigation_id = ?`, id);
  const actions = all<Record<string, unknown>>(
    `SELECT * FROM investigation_actions WHERE investigation_id = ? ORDER BY id ASC`,
    id
  );
  const queries = all<Record<string, unknown>>(
    `SELECT * FROM search_queries WHERE investigation_id = ? ORDER BY executed_at ASC`,
    id
  );
  const queryIds = queries.map((q) => q.id as string);
  const results =
    queryIds.length === 0
      ? []
      : all<Record<string, unknown>>(
          `SELECT * FROM search_results WHERE query_id IN (${queryIds.map(() => "?").join(",")})`,
          ...queryIds
        );
  const factSources = all<Record<string, unknown>>(
    `SELECT fs.* FROM fact_sources fs JOIN facts f ON f.id = fs.fact_id WHERE f.investigation_id = ?`,
    id
  );
  const snapshots = all<Record<string, unknown>>(
    `SELECT ss.* FROM source_snapshots ss JOIN sources s ON s.id = ss.source_id WHERE s.investigation_id = ?`,
    id
  );
  const graph = investigationGraph(id);
  const evidenceSummary = summarizeEvidence(facts as Array<{ predicate: string; status: string; confidence: number; value: string }>);
  const inputMap: Record<string, string> = {};
  for (const r of inputs) inputMap[r.field] = r.value;
  const profile = classifyTarget(inputMap);
  const { scored } = recommendNext(profile, inputMap, []);
  return {
    investigation: inv,
    inputs,
    facts,
    factSources,
    sources,
    documents,
    images,
    metadata,
    faces,
    ocr,
    entities,
    aliases,
    timeline,
    contradictions,
    hypotheses,
    inferences: listInferences(id),
    identifiers: all(`SELECT * FROM identifiers WHERE investigation_id = ?`, id),
    pivots: all(`SELECT * FROM pivots WHERE investigation_id = ?`, id),
    pivotGraph: pivotGraph(id),
    hints: all(`SELECT * FROM user_hints WHERE investigation_id = ?`, id),
    strategy: { profile, scored: scored.slice(0, 10), ...strategyState(id) },
    actions,
    queries,
    results,
    snapshots,
    graph,
    evidenceSummary,
    toolCalls: listToolCalls(id),
    tools: listTools(),
    metrics: investigationMetrics(id),
    candidates: listCandidates(id),
    identity: identityConfidence(id, inputMap as InvestigationInput),
  };
});

function summarizeEvidence(
  facts: Array<{ predicate: string; status: string; confidence: number; value: string }>
) {
  const pick = (pred: string, label: string) => {
    const f = facts.find((x) => x.predicate === pred);
    return f
      ? { label, predicate: pred, status: f.status, confidence: f.confidence, value: f.value }
      : { label, predicate: pred, status: "UNVERIFIED", confidence: 0, value: "—" };
  };
  return [
    pick("full_name", "ФИО"),
    pick("held_position", "Должность"),
    pick("works_at", "Организация"),
    pick("born_on", "Дата"),
    pick("born_in", "Место"),
    pick("has_email", "Email"),
  ];
}

app.get("/api/investigations/:id/facts/:factId", async (req, reply) => {
  const { id, factId } = req.params as { id: string; factId: string };
  const fact = get<Record<string, unknown>>(`SELECT * FROM facts WHERE id = ? AND investigation_id = ?`, factId, id);
  if (!fact) return reply.code(404).send({ error: "not found" });
  const sources = all<Record<string, unknown>>(
    `SELECT s.*, fs.extract as fact_extract, fs.page as fact_page, fs.document_id
     FROM fact_sources fs JOIN sources s ON s.id = fs.source_id WHERE fs.fact_id = ?`,
    factId
  );
  const documents = all<Record<string, unknown>>(
    `SELECT d.* FROM documents d JOIN fact_sources fs ON fs.document_id = d.id WHERE fs.fact_id = ?`,
    factId
  );
  return { fact, sources, documents };
});

app.post("/api/investigations/:id/start", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get(`SELECT id, status FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  setTimeout(() => {
    runInvestigation(id).catch((err) => console.error(err));
  }, 50);
  return { ok: true, status: "running" };
});

app.post("/api/investigations/:id/stop", async (req) => {
  const { id } = req.params as { id: string };
  stopInvestigation(id);
  return { ok: true, status: "paused" };
});

app.get("/api/investigations/:id/events", async (req, reply) => {
  const { id } = req.params as { id: string };
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  reply.raw.write(`event: ping\ndata: ${JSON.stringify({ ts: nowIso() })}\n\n`);
  const onEvent = (ev: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
  };
  bus.on(id, onEvent);
  req.raw.on("close", () => bus.off(id, onEvent));
});

app.get("/api/investigations/:id/report", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get<Record<string, unknown>>(`SELECT * FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  const facts = all<Record<string, unknown>>(`SELECT * FROM facts WHERE investigation_id = ?`, id);
  const entities = all<Record<string, unknown>>(`SELECT * FROM entities WHERE investigation_id = ?`, id);
  const aliases = all<Record<string, unknown>>(
    `SELECT a.* FROM entity_aliases a JOIN entities e ON e.id = a.entity_id WHERE e.investigation_id = ?`,
    id
  );
  const timeline = all<Record<string, unknown>>(
    `SELECT * FROM timeline_events WHERE investigation_id = ? ORDER BY date`,
    id
  );
  const sources = all<Record<string, unknown>>(`SELECT * FROM sources WHERE investigation_id = ?`, id);
  const contradictions = all<Record<string, unknown>>(`SELECT * FROM contradictions WHERE investigation_id = ?`, id);
  return { investigation: inv, entities, aliases, facts, timeline, sources, contradictions };
});

app.get("/api/documents/:id/raw", async (req, reply) => {
  const { id } = req.params as { id: string };
  const doc = get<{ storage_path: string; mime_type: string; filename: string; extracted_text: string }>(
    `SELECT storage_path, mime_type, filename, extracted_text FROM documents WHERE id = ?`,
    id
  );
  if (!doc) return reply.code(404).send({ error: "not found" });
  return doc;
});

const frontendDist = path.join(ROOT, "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  await app.register(fastifyStatic, {
    root: frontendDist,
    prefix: "/",
    decorateReply: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/files")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.sendFile("index.html", frontendDist);
  });
}

app.get("/api/catalog", async () => ({ catalog: listCatalog(), connectors: listConnectors() }));

app.post("/api/catalog/connectors", async (req, reply) => {
  try {
    const id = createConnector(req.body as Parameters<typeof createConnector>[0]);
    reply.code(201);
    return { id };
  } catch (err) {
    reply.code(400);
    return { error: (err as Error).message };
  }
});

app.get("/api/presets", async () => ({
  presets: all(`SELECT * FROM search_presets`),
  effectiveness: all(`SELECT * FROM source_effectiveness ORDER BY target_type, source_id`),
}));

app.post("/api/investigations/:id/ingest", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get(`SELECT id FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  return ingestManual(id, (req.body ?? {}) as Record<string, string>);
});

app.get("/api/tools", async () => ({
  tools: listTools(),
  methodologies: listMethodologies(),
  llm: llmStatus(),
  settings: readSettings(),
}));

app.get("/api/settings", async () => ({ settings: readSettings(), llm: llmStatus() }));

app.put("/api/settings", async (req) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return { settings: writeSettings(body), llm: llmStatus() };
});

app.patch("/api/catalog/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = (req.body ?? {}) as { enabled?: boolean };
  const row = setCatalogEnabled(id, Boolean(body.enabled));
  if (!row) return reply.code(404).send({ error: "not found" });
  return row;
});

app.post("/api/investigations/:id/tools", async (req, reply) => {
  const { id } = req.params as { id: string };
  const inv = get(`SELECT id FROM investigations WHERE id = ?`, id);
  if (!inv) return reply.code(404).send({ error: "not found" });
  const body = (req.body ?? {}) as { tool?: string; args?: Record<string, string>; reason?: string };
  if (!body.tool) return reply.code(400).send({ error: "tool required" });
  return runOneTool(id, body.tool, body.args || {}, body.reason || "analyst");
});

await seedDemo();
seedStrategyLayer();

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`SVOD API on http://${HOST}:${PORT}`);
  console.log(`data dir ${DATA_DIR}`);
});
