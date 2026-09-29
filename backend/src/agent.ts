import { EventEmitter } from "node:events";
import { all, audit, get, logAction, nowIso, run } from "./db.js";
import { nextActions, planQueries } from "./planner.js";
import { searchAll, waybackCdx, type SearchHit } from "./search.js";
import { crawlSite, fetchPage, isPublicHttpUrl } from "./crawler.js";
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
  const stats = ingestText({
    investigationId,
    text: `${title}\n${hit.snippet}\n${text}`,
    sourceId,
    documentId: docId,
    hintName,
    url: hit.url,
  });
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

  const planned = planQueries(input);
  emit(investigationId, {
    level: "info",
    message: `Search planner generated ${planned.length} strategies`,
    data: { queries: planned.slice(0, 8) },
  });

  let iteration = 0;
  const searched: string[] = [];
  const maxIter = 6;

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
      const contradictionCount = get<{ c: number }>(
        `SELECT COUNT(*) as c FROM contradictions WHERE investigation_id = ? AND status = 'UNRESOLVED'`,
        investigationId
      )!.c;

      const stop = evaluateStop(investigationId);
      if (stop.complete && iteration > 2) {
        emit(investigationId, { level: "success", message: `Stop condition: ${stop.reason}` });
        break;
      }

      const actions = nextActions(input, {
        sourceCount,
        factCount,
        contradictionCount,
        searched,
        iteration,
      });
      const action = actions[0];
      if (!action || action.type === "stop") {
        emit(investigationId, { level: "info", message: "Planner has no higher-value actions" });
        break;
      }

      emit(investigationId, {
        level: "info",
        message: `Next action: ${action.type}${action.query ? ` · ${action.query}` : ""} — ${action.reason}`,
      });

      if (action.type === "search" && action.query) {
        const qidCount = get<{ c: number }>(`SELECT COUNT(*) as c FROM search_queries`)!.c;
        const qid = `Q-${String(qidCount + 1).padStart(6, "0")}`;
        run(
          `INSERT INTO search_queries (id, investigation_id, query, engine, query_class, reason, executed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          qid,
          investigationId,
          action.query,
          "multi",
          action.queryClass ?? null,
          action.reason,
          nowIso()
        );
        searched.push(action.query);
        emit(investigationId, {
          level: "search",
          message: `QUERY [${action.queryClass}] ${action.query}`,
          data: { reason: action.reason },
        });
        const hits = await searchAll(action.query);
        for (const [i, hit] of hits.entries()) {
          run(
            `INSERT INTO search_results (query_id, url, title, snippet, provider, rank, selected, selection_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            qid,
            hit.url,
            hit.title,
            hit.snippet,
            hit.provider,
            hit.rank,
            i < 4 ? 1 : 0,
            i < 4 ? "top-ranked identity relevance" : null
          );
        }
        emit(investigationId, {
          level: "search",
          message: `${hits.length} results · selected ${Math.min(4, hits.length)} for ingest`,
        });
        for (const hit of hits.slice(0, 4)) {
          try {
            await ingestHit(investigationId, hit, hintName);
          } catch (err) {
            emit(investigationId, { level: "warn", message: `Ingest failed for ${hit.url}: ${(err as Error).message}` });
          }
        }

        const orgUrl = hits.find((h) => /official|about|company|org/i.test(h.url + h.title));
        if (orgUrl && iteration <= 2) {
          emit(investigationId, { level: "search", message: `Site crawl of ${new URL(orgUrl.url).origin}` });
          try {
            const pages = await crawlSite(orgUrl.url, 4);
            for (const p of pages) {
              const sid = addSource({
                investigationId,
                url: p.url,
                sourceType: "official_site",
                title: p.title,
                httpStatus: p.status,
                snippet: p.text.slice(0, 240),
              });
              ingestText({ investigationId, text: p.text, sourceId: sid, hintName, url: p.url });
            }
          } catch (err) {
            emit(investigationId, { level: "warn", message: `Crawl failed: ${(err as Error).message}` });
          }
        }

        const wiki = hits.find((h) => h.url.includes("wikipedia.org"));
        if (wiki) {
          try {
            const snaps = await waybackCdx(wiki.url, 6);
            for (const s of snaps.slice(0, 4)) {
              const srcId = addSource({
                investigationId,
                url: s.archiveUrl,
                sourceType: "archive",
                title: `Wayback ${s.timestamp} ${s.original}`,
                snippet: `snapshot ${s.timestamp}`,
              });
              const year = s.timestamp.slice(0, 4);
              addTimelineEvent({
                investigationId,
                date: year,
                event: `Archived snapshot of ${s.original}`,
                sourceId: srcId,
                confidence: 0.7,
                status: "OBSERVED",
              });
              const snapCount = get<{ c: number }>(`SELECT COUNT(*) as c FROM source_snapshots`)!.c;
              run(
                `INSERT INTO source_snapshots (id, source_id, archive_url, snapshot_date, status, mime)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                `SNAP-${String(snapCount + 1).padStart(6, "0")}`,
                srcId,
                s.archiveUrl,
                s.timestamp,
                Number(s.status) || 200,
                s.mime
              );
            }
            if (snaps.length) {
              emit(investigationId, {
                level: "search",
                message: `Wayback: ${snaps.length} historical snapshots for ${wiki.url}`,
              });
            }
          } catch {
            /* optional */
          }
        }
      } else if (action.type === "fetch_url" && action.url) {
        await ingestHit(
          investigationId,
          { url: action.url, title: action.url, snippet: "", provider: "seed", rank: 1 },
          hintName
        );
        searched.push(action.url);
      } else if (action.type === "resolve_conflict") {
        emit(investigationId, {
          level: "conflict",
          message: "Contradiction remains UNRESOLVED — system will not guess. Need additional independent sources.",
        });
        searched.push("__conflict__");
      }

      resolveEntities(investigationId);
      detectContradictions(investigationId);
      run(`UPDATE investigations SET updated_at = ? WHERE id = ?`, nowIso(), investigationId);
    }

    resolveEntities(investigationId);
    detectContradictions(investigationId);
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

export { addSource };
