import { EventEmitter } from "node:events";
import { all, audit, get, logAction, nowIso, run } from "./db.js";
import { planQueries } from "./planner.js";
import type { SearchHit } from "./types.js";
import { classifyTarget, feedback, persistStrategyRun, recommendNext } from "./strategy.js";
import { executeTool, logToolCall, planNextTool } from "./osint-tools.js";
import type { ToolCall } from "./osint-tools.js";
import { inferFromInput, inferFromText } from "./inference.js";
import { buildPivots } from "./pivot.js";
import { detectCopies } from "./independence.js";
import { fetchPage, isPublicHttpUrl } from "./crawler.js";
import {
  downloadPublicFile,
  extFromUrlOrMime,
  extractExif,
  extractHtmlContent,
  extractPdfStrings,
  md5,
  saveDocument,
  saveOriginal,
  sha256,
} from "./extract.js";
import { emailIntelligence, extractEntities, extractFacts, generateAliases } from "./nlp.js";
import {
  addAlias,
  addFact,
  addTimelineEvent,
  detectContradictions,
  evaluateStop,
  relate,
  resolveEntities,
  upsertEntity,
} from "./graph.js";
import type { AgentEvent, InvestigationInput } from "./types.js";

const running = new Map<string, boolean>();
export const bus = new EventEmitter();
bus.setMaxListeners(100);

function emit(id: string, event: Omit<AgentEvent, "ts">) {
  const full: AgentEvent = { ...event, ts: nowIso() };
  logAction(id, event.level, event.message, event.data);
  bus.emit(id, full);
}

function inputsOf(id: string): InvestigationInput {
  const rows = all<{ field: string; value: string }>(
    `SELECT field, value FROM investigation_inputs WHERE investigation_id = ?`,
    id
  );
  const input: InvestigationInput = {};
  for (const r of rows) {
    (input as Record<string, string>)[r.field] = r.value;
  }
  return input;
}

function addSource(opts: {
  investigationId: string;
  url?: string;
  sourceType: string;
  title?: string;
  publisher?: string;
  snippet?: string;
  httpStatus?: number;
  mime?: string;
  contentHash?: string;
}): string {
  if (opts.url) {
    const existing = get<{ id: string }>(
      `SELECT id FROM sources WHERE investigation_id = ? AND url = ?`,
      opts.investigationId,
      opts.url
    );
    if (existing) return existing.id;
  }
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM sources`)!.c;
  const sid = `SRC-${String(count + 1).padStart(6, "0")}`;
  let domain: string | null = null;
  try {
    if (opts.url) domain = new URL(opts.url).hostname;
  } catch {
    domain = null;
  }
  run(
    `INSERT INTO sources (id, investigation_id, url, domain, source_type, title, publisher, discovered_at, hash, content_hash, http_status, mime_type, snippet)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sid,
    opts.investigationId,
    opts.url ?? null,
    domain,
    opts.sourceType,
    opts.title ?? null,
    opts.publisher ?? domain,
    nowIso(),
    opts.contentHash ?? null,
    opts.contentHash ?? null,
    opts.httpStatus ?? null,
    opts.mime ?? null,
    opts.snippet ?? null
  );
  return sid;
}

function ingestText(opts: {
  investigationId: string;
  text: string;
  sourceId: string;
  documentId?: string;
  hintName?: string;
  url?: string;
}) {
  const entities = extractEntities(opts.text);
  const personIds: string[] = [];
  for (const e of entities) {
    const eid = upsertEntity(opts.investigationId, e.kind, e.text, e.confidence, "OBSERVED");
    if (e.kind === "PERSON") personIds.push(eid);
    if (e.kind === "ORGANIZATION") {
      const orgId = eid;
      for (const p of personIds.slice(0, 3)) {
        relate(opts.investigationId, p, orgId, "WORKED_AT", "works_at", 0.5);
      }
    }
    if (e.kind === "EMAIL") {
      const intel = emailIntelligence(e.text);
      for (const h of intel.hypotheses) {
        const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM hypotheses`)!.c;
        run(
          `INSERT INTO hypotheses (id, investigation_id, statement, confidence, status, evidence)
           VALUES (?, ?, ?, ?, 'HYPOTHESIS', ?)`,
          `HYP-${String(count + 1).padStart(6, "0")}`,
          opts.investigationId,
          h.statement,
          h.confidence,
          opts.sourceId
        );
      }
    }
  }
  const facts = extractFacts(opts.text, opts.hintName);
  const subject = personIds[0];
  for (const f of facts) {
    const object =
      f.predicate === "works_at"
        ? upsertEntity(opts.investigationId, "ORGANIZATION", f.value, f.confidence, "OBSERVED")
        : f.predicate === "held_position"
          ? upsertEntity(opts.investigationId, "POSITION", f.value, f.confidence, "OBSERVED")
          : undefined;
    addFact({
      investigationId: opts.investigationId,
      subject,
      predicate: f.predicate,
      object,
      value: f.value,
      extract: f.extract,
      confidence: f.confidence,
      sourceId: opts.sourceId,
      documentId: opts.documentId,
      status: "OBSERVED",
    });
    if (subject && object) {
      relate(
        opts.investigationId,
        subject,
        object,
        f.predicate === "works_at" ? "WORKED_AT" : "HELD_POSITION",
        f.value,
        f.confidence
      );
    }
    const year = f.value.match(/(19|20)\d{2}/);
    if (year && (f.predicate === "born_on" || f.predicate === "held_position")) {
      addTimelineEvent({
        investigationId: opts.investigationId,
        entityId: subject,
        date: year[0],
        event: `${f.predicate}: ${f.value}`,
        sourceId: opts.sourceId,
        confidence: f.confidence,
      });
    }
  }
  return { entities: entities.length, facts: facts.length };
}

async function ingestHit(investigationId: string, hit: SearchHit, hintName?: string) {
  if (!isPublicHttpUrl(hit.url)) return;
  const sourceId = addSource({
    investigationId,
    url: hit.url,
    sourceType: hit.provider.startsWith("wikipedia")
      ? "wikipedia"
      : hit.provider === "wikidata"
        ? "wikipedia"
        : "search",
    title: hit.title,
    snippet: hit.snippet,
    publisher: hit.provider,
  });

  const page = await fetchPage(hit.url);
  if (!page) {
    emit(investigationId, { level: "warn", message: `Fetch skipped or blocked: ${hit.url}` });
    return;
  }
  run(`UPDATE sources SET http_status = ?, title = COALESCE(NULLIF(title,''), ?) WHERE id = ?`, page.status, page.title, sourceId);

  const { title, text } = extractHtmlContent(page.html || page.text);
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM documents`)!.c;
  const docId = `DOC-${String(count + 1).padStart(6, "0")}`;
  const buf = Buffer.from(page.html || page.text, "utf8");
  const storage = saveDocument(docId, buf, ".html");
  run(
    `INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, size, sha256, md5, created_at, language, page_count, storage_path, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    docId,
    investigationId,
    sourceId,
    `${title || "page"}.html`,
    "text/html",
    buf.length,
    sha256(buf),
    md5(buf),
    nowIso(),
    /[А-Яа-яЁё]/.test(text) ? "ru" : "en",
    1,
    storage,
    text
  );
  const combined = `${title}\n${hit.snippet}\n${text}`;
  const stats = ingestText({
    investigationId,
    text: combined,
    sourceId,
    documentId: docId,
    hintName,
    url: hit.url,
  });
  inferFromText(investigationId, combined, sourceId);
  emit(investigationId, {
    level: "extract",
    message: `Extracted ${stats.entities} entities, ${stats.facts} facts from ${page.title || hit.title}`,
    data: { url: hit.url, sourceId, docId },
  });

  for (const docUrl of page.documents.slice(0, 3)) {
    await ingestBinary(investigationId, docUrl, hintName);
  }
}

async function ingestBinary(investigationId: string, url: string, hintName?: string) {
  const file = await downloadPublicFile(url);
  if (!file) return;
  const ext = extFromUrlOrMime(url, file.mime);
  const hash = sha256(file.buffer);
  const dup = get<{ id: string }>(`SELECT id FROM documents WHERE sha256 = ?`, hash);
  const sourceId = addSource({
    investigationId,
    url,
    sourceType: "document",
    title: url.split("/").pop(),
    mime: file.mime,
    httpStatus: file.status,
    contentHash: hash,
  });
  if (dup) {
    emit(investigationId, {
      level: "info",
      message: `Duplicate document by SHA-256 ${hash.slice(0, 12)}… — not counted as independent source`,
    });
    return;
  }
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM documents`)!.c;
  const docId = `DOC-${String(count + 1).padStart(6, "0")}`;
  const storage = saveDocument(docId, file.buffer, ext);
  let text = "";
  if (ext === ".pdf" || file.mime.includes("pdf")) {
    text = extractPdfStrings(file.buffer);
  } else if (file.mime.includes("html") || ext === ".html") {
    text = extractHtmlContent(file.buffer.toString("utf8")).text;
  } else if (file.mime.startsWith("text/") || ext === ".txt" || ext === ".csv" || ext === ".json" || ext === ".xml") {
    text = file.buffer.toString("utf8").slice(0, 80000);
  }
  run(
    `INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, size, sha256, md5, created_at, language, page_count, storage_path, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    docId,
    investigationId,
    sourceId,
    url.split("/").pop() ?? docId,
    file.mime,
    file.buffer.length,
    hash,
    md5(file.buffer),
    nowIso(),
    /[А-Яа-яЁё]/.test(text) ? "ru" : "en",
    ext === ".pdf" ? Math.max(1, (text.match(/\f/g) ?? []).length + 1) : 1,
    storage,
    text
  );
  if (/\.(jpg|jpeg|png|webp)$/i.test(ext) || file.mime.startsWith("image/")) {
    await ingestImage(investigationId, sourceId, docId, url, file.buffer, ext);
  }
  if (text) {
    ingestText({ investigationId, text, sourceId, documentId: docId, hintName, url });
    emit(investigationId, { level: "extract", message: `Document ingested: ${url.split("/").pop()} (${text.length} chars)` });
  }
}

async function ingestImage(
  investigationId: string,
  sourceId: string,
  documentId: string | undefined,
  url: string,
  buf: Buffer,
  ext: string
) {
  const count = get<{ c: number }>(`SELECT COUNT(*) as c FROM images`)!.c;
  const id = `IMG-${String(count + 1).padStart(6, "0")}`;
  const storage = saveOriginal(id, buf, ext);
  run(
    `INSERT INTO images (id, investigation_id, document_id, source_id, original_url, storage_path, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    investigationId,
    documentId ?? null,
    sourceId,
    url,
    storage,
    sha256(buf),
    nowIso()
  );
  const meta = await extractExif(buf);
  for (const [k, v] of Object.entries(meta)) {
    run(
      `INSERT INTO image_metadata (image_id, key, value, source, extracted_at) VALUES (?, ?, ?, 'EXIF', ?)`,
      id,
      k,
      v,
      nowIso()
    );
  }
  if (meta.DateTimeOriginal) {
    emit(investigationId, {
      level: "extract",
      message: `EXIF DateTimeOriginal=${meta.DateTimeOriginal} on ${id} (evidence, not truth)`,
    });
  }
}

export async function runInvestigation(investigationId: string) {
  if (running.get(investigationId)) return;
  running.set(investigationId, true);
  run(`UPDATE investigations SET status = 'running', updated_at = ? WHERE id = ?`, nowIso(), investigationId);
  emit(investigationId, { level: "info", message: "Investigation agent started" });
  audit("investigate.start", investigationId);

  const input = inputsOf(investigationId);
  const hintName = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const personName = hintName || input.full_name || "Unknown person";
  const personId = upsertEntity(investigationId, "PERSON", personName, 0.7, "HYPOTHESIS", { seed: true });
  for (const a of generateAliases(input)) {
    addAlias(personId, a.alias, a.confidence, a.evidence);
  }
  emit(investigationId, {
    level: "graph",
    message: `Alias engine produced ${generateAliases(input).length} variants for ${personName}`,
  });

  if (input.organization) {
    const orgId = upsertEntity(investigationId, "ORGANIZATION", input.organization, 0.7, "HYPOTHESIS");
    relate(investigationId, personId, orgId, "WORKED_AT", "seed", 0.6);
    addFact({
      investigationId,
      subject: personId,
      predicate: "works_at",
      object: orgId,
      value: input.organization,
      status: "HYPOTHESIS",
      confidence: 0.55,
    });
  }
  if (input.position) {
    const posId = upsertEntity(investigationId, "POSITION", input.position, 0.7, "HYPOTHESIS");
    relate(investigationId, personId, posId, "HELD_POSITION", "seed", 0.6);
    addFact({
      investigationId,
      subject: personId,
      predicate: "held_position",
      object: posId,
      value: input.position,
      status: "HYPOTHESIS",
      confidence: 0.55,
    });
  }
  if (input.city) {
    const locId = upsertEntity(investigationId, "LOCATION", input.city, 0.7, "OBSERVED");
    relate(investigationId, personId, locId, "LOCATED_IN", "seed", 0.5);
  }
  if (input.email) {
    const intel = emailIntelligence(input.email);
    addFact({
      investigationId,
      subject: personId,
      predicate: "has_email",
      value: input.email,
      status: "OBSERVED",
      confidence: 0.9,
    });
    emit(investigationId, {
      level: "info",
      message: `Email intelligence: ${intel.local_part} @ ${intel.domain}`,
    });
  }

  const profile = classifyTarget(input);
  inferFromInput(investigationId, input);
  buildPivots(investigationId, input);
  const { scored } = recommendNext(profile, input, []);
  persistStrategyRun(investigationId, profile, scored, scored[0]?.source_id);
  emit(investigationId, {
    level: "info",
    message: `Profile ${profile.targetType} → preset ${profile.presetId}. ${profile.reasons[0] || ""}`,
    data: { profile, topSources: scored.slice(0, 5) },
  });
  emit(investigationId, {
    level: "graph",
    message: `Source dispatcher ranked ${scored.length} providers. Next: ${scored[0]?.name} (score ${scored[0]?.score})`,
  });

  const planned = planQueries(input);
  emit(investigationId, {
    level: "info",
    message: `Search planner generated ${planned.length} query templates`,
    data: { queries: planned.slice(0, 8) },
  });

  let iteration = 0;
  const usedKeys: string[] = [];
  const suggested: ToolCall[] = [];
  const maxIter = 8;

  try {
    while (iteration < maxIter && running.get(investigationId)) {
      iteration += 1;
      const sourceCount = get<{ c: number }>(
        `SELECT COUNT(*) as c FROM sources WHERE investigation_id = ?`,
        investigationId
      )!.c;
      const factCount = get<{ c: number }>(
        `SELECT COUNT(*) as c FROM facts WHERE investigation_id = ?`,
        investigationId
      )!.c;

      const stop = evaluateStop(investigationId);
      if (stop.complete && iteration > 2) {
        emit(investigationId, { level: "success", message: `Stop condition: ${stop.reason}` });
        break;
      }

      const { scored: ranked } = recommendNext(profile, input, []);
      persistStrategyRun(investigationId, profile, ranked, ranked[0]?.source_id);

      let call = suggested.shift();
      if (call && usedKeys.includes(`${call.tool}:${JSON.stringify(call.args)}`)) call = undefined;
      call =
        call ||
        planNextTool({
          input,
          targetType: profile.targetType,
          used: usedKeys,
          unknown: profile.unknown,
          sourceCount,
        });
      if (call.tool === "stop") {
        emit(investigationId, { level: "info", message: `Tool planner stop: ${call.reason}` });
        break;
      }
      const key = `${call.tool}:${JSON.stringify(call.args)}`;
      usedKeys.push(key);

      emit(investigationId, {
        level: "search",
        message: `TOOL ${call.tool}(${JSON.stringify(call.args)}) — ${call.reason}`,
      });
      const t0 = Date.now();
      const result = await executeTool(call.tool, call.args);
      const duration = Date.now() - t0;
      logToolCall({
        investigationId,
        tool: call.tool,
        args: call.args,
        reason: call.reason,
        result,
        durationMs: duration,
      });
      emit(investigationId, {
        level: result.ok ? "extract" : "warn",
        message: result.ok
          ? `TOOL ${call.tool} → ${result.summary} (${duration}ms)`
          : `TOOL ${call.tool} FAILED: ${result.error || result.summary}`,
      });

      if (result.ok && result.data && call.tool === "compile_dorks") {
        const dorks = (result.data.dorks as Array<{ dork: string; reason?: string }> | undefined) || [];
        for (const d of dorks.slice(0, 6)) {
          suggested.push({ tool: "dork_search", args: { dork: d.dork }, reason: d.reason || "compiled dork" });
        }
        emit(investigationId, { level: "search", message: `Dork cookbook: ${dorks.length} queries queued` });
      }
      if (result.ok && result.data && call.tool === "llm_plan_strategy") {
        const next = (result.data as { next?: Array<{ tool: string; args?: Record<string, string>; reason?: string }> }).next || [];
        for (const n of next) {
          if (n.tool) suggested.push({ tool: n.tool, args: n.args || {}, reason: n.reason || "llm strategy" });
        }
        emit(investigationId, { level: "graph", message: `LLM queued ${next.length} tool calls` });
      }
      if (result.data && (call.tool === "alias_expand" || call.tool === "username_permute" || call.tool === "email_pivot")) {
        emit(investigationId, { level: "graph", message: `Pivot/identity tool payload kept as hypothesis`, data: result.data });
      }
      if (result.data && call.tool === "dns_lookup") {
        emit(investigationId, { level: "info", message: `DNS ${JSON.stringify(result.data).slice(0, 180)}` });
      }

      for (const hit of (result.hits ?? []).slice(0, 4)) {
        try {
          await ingestHit(investigationId, hit, hintName);
        } catch (err) {
          emit(investigationId, { level: "warn", message: `Ingest failed for ${hit.url}: ${(err as Error).message}` });
        }
      }

      resolveEntities(investigationId);
      detectContradictions(investigationId);
      detectCopies(investigationId);
      feedback(investigationId, call.tool, Math.max(0, get<{ c: number }>(`SELECT COUNT(*) as c FROM facts WHERE investigation_id = ?`, investigationId)!.c - factCount), result.hits?.length ? 1 : 0);
      run(`UPDATE investigations SET updated_at = ? WHERE id = ?`, nowIso(), investigationId);
    }

    resolveEntities(investigationId);
    detectContradictions(investigationId);
    detectCopies(investigationId);
    const stop = evaluateStop(investigationId);
    run(
      `UPDATE investigations SET status = 'complete', updated_at = ?, stop_reason = ? WHERE id = ?`,
      nowIso(),
      stop.reason,
      investigationId
    );
    emit(investigationId, { level: "success", message: `Investigation complete. ${stop.reason}` });
    audit("investigate.complete", investigationId, stop.reason);
  } catch (err) {
    run(
      `UPDATE investigations SET status = 'failed', updated_at = ?, stop_reason = ? WHERE id = ?`,
      nowIso(),
      (err as Error).message,
      investigationId
    );
    emit(investigationId, { level: "warn", message: `Agent error: ${(err as Error).message}` });
  } finally {
    running.set(investigationId, false);
  }
}

export function stopInvestigation(id: string) {
  running.set(id, false);
  run(`UPDATE investigations SET status = 'paused', updated_at = ? WHERE id = ?`, nowIso(), id);
}

export async function ingestManual(
  investigationId: string,
  payload: {
    url?: string;
    text?: string;
    email?: string;
    username?: string;
    inn?: string;
    hint?: string;
    hintKind?: string;
  }
) {
  const { addUserHint, inferFromEmail } = await import("./inference.js");
  const { addIdentifier, addPivot } = await import("./pivot.js");
  if (payload.url) {
    try {
      await ingestHit(
        investigationId,
        { url: payload.url, title: payload.url, snippet: payload.text || "", provider: "manual", rank: 1 },
        undefined
      );
    } catch (err) {
      emit(investigationId, {
        level: "warn",
        message: `Live fetch failed for ${payload.url}: ${(err as Error).message}. Using provided extract if any.`,
      });
    }
  }
  if (payload.text) {
    const sid = addSource({
      investigationId,
      url: payload.url,
      sourceType: payload.url ? "media" : "user_upload",
      title: payload.url ? payload.url : "Manual text",
      snippet: payload.text.slice(0, 280),
      publisher: "public-extract",
    });
    ingestText({ investigationId, text: payload.text, sourceId: sid, url: payload.url });
    inferFromText(investigationId, payload.text, sid);
    emit(investigationId, {
      level: "extract",
      message: `Ingested public extract (${payload.text.length} chars)${payload.url ? " · " + payload.url : ""}`,
    });
  }
  if (payload.email) {
    run(`INSERT INTO investigation_inputs (investigation_id, field, value) VALUES (?, 'email', ?)`, investigationId, payload.email);
    inferFromEmail(investigationId, payload.email);
    addIdentifier({ investigationId, kind: "email", value: payload.email, priority: "high", source: "manual" });
  }
  if (payload.username) {
    addUserHint(investigationId, "username", payload.username, "manual username");
    addIdentifier({
      investigationId,
      kind: "username",
      value: payload.username,
      priority: "low",
      status: "HYPOTHESIS",
      note: "username match ≠ same person",
    });
    addPivot(investigationId, "USERNAME", payload.username, "SOCIAL", payload.username, "manual username hint", 0.3);
  }
  if (payload.inn) {
    addIdentifier({
      investigationId,
      kind: "inn",
      value: payload.inn,
      priority: "high",
      status: "HYPOTHESIS",
      note: "INN ≠ confirmed position; permitted public records only",
    });
    addPivot(investigationId, "INN", payload.inn, "REGISTRY", payload.inn, "manual INN", 0.6);
  }
  if (payload.hint) {
    addUserHint(investigationId, payload.hintKind || "note", payload.hint, "USER_HINT");
  }
  detectCopies(investigationId);
  return { ok: true };
}

export async function runOneTool(
  investigationId: string,
  tool: string,
  args: Record<string, string>,
  reason = "analyst manual tool call"
) {
  const t0 = Date.now();
  const result = await executeTool(tool, args);
  logToolCall({
    investigationId,
    tool,
    args,
    reason,
    result,
    durationMs: Date.now() - t0,
  });
  emit(investigationId, {
    level: result.ok ? "search" : "warn",
    message: result.ok ? `TOOL ${tool} → ${result.summary}` : `TOOL ${tool} FAILED: ${result.error}`,
  });
  const input = inputsOf(investigationId);
  const hintName = [input.name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  for (const hit of (result.hits ?? []).slice(0, 5)) {
    try {
      await ingestHit(investigationId, hit, hintName);
    } catch {
      /* skip */
    }
  }
  return result;
}

export { addSource };
