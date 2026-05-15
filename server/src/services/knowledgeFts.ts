import { prisma } from '../db.js';

// Sprint 41 — SQLite FTS5 индекс над KnowledgeChunk.
//
// Архитектура:
//   • KnowledgeChunk остаётся источником правды (text + redactedText в нормальной
//     таблице, FK на KnowledgeSource).
//   • KnowledgeChunkFts — VIRTUAL TABLE FTS5, повторяет только поля, нужные для
//     поиска (chunkId/sourceId/projectId UNINDEXED + title + sourceType + tags +
//     text + redactedText). UNINDEXED-колонки FTS5 хранит, но не индексирует.
//   • Sync через явные вызовы syncChunkToFts / deleteSourceFromFts из ingest и
//     PATCH hooks. Никаких триггеров — у нас Prisma миграция и кросс-БД движок,
//     SQLite-only код вынесен изолированно сюда.
//
// FTS5 может быть disabled в compile-time (хотя SQLite на Render и Node-канале
// почти всегда его собирают). На случай disabled — lazy init с try/catch.
// Если FTS не работает → set ftsAvailable=false, retrieval тихо откатится на
// keyword-only режим Sprint 38.

let ftsAvailable: boolean | null = null; // null = ещё не проверяли

/**
 * Lazy init. Запускается один раз на старте сервера (см. index.ts).
 *   1. Проверяет, что FTS5 включён в этой сборке SQLite.
 *   2. Если да — создаёт VIRTUAL TABLE IF NOT EXISTS.
 *   3. Если таблица пустая, делает backfill из существующих chunks.
 *
 * Никогда не бросает наверх — все ошибки → ftsAvailable=false + warn.
 */
export async function initKnowledgeFts(): Promise<void> {
  try {
    // 1. Проверяем compile-time FTS5 поддержку.
    const probe = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled`,
    );
    const enabled = Number((probe?.[0] as { enabled?: number })?.enabled ?? 0) === 1;
    if (!enabled) {
      console.warn('[knowledge-fts] SQLite сборка без ENABLE_FTS5 — fallback на keyword retrieval (Sprint 38).');
      ftsAvailable = false;
      return;
    }

    // 2. Создаём виртуальную таблицу. UNINDEXED поля хранятся, но не
    //    индексируются — нужны для дешёвого JOIN'а назад в KnowledgeChunk.
    //    unicode61 tokenizer корректно обрабатывает кириллицу.
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS KnowledgeChunkFts USING fts5(
        chunkId UNINDEXED,
        sourceId UNINDEXED,
        projectId UNINDEXED,
        title,
        sourceType,
        tags,
        text,
        redactedText,
        tokenize = 'unicode61'
      )
    `);

    // 3. Backfill: если таблица пустая, заливаем из существующих chunks.
    //    Делаем батчами по 200 чтобы не утопить SQLite на больших KB.
    const countRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      `SELECT COUNT(*) AS n FROM KnowledgeChunkFts`,
    );
    const existing = Number(countRows?.[0]?.n ?? 0);
    if (existing === 0) {
      await backfillKnowledgeFts();
    }

    ftsAvailable = true;
    console.log('[knowledge-fts] FTS5 готов, поиск работает в hybrid-режиме.');
  } catch (err) {
    ftsAvailable = false;
    console.warn(
      '[knowledge-fts] init failed — fallback на keyword retrieval:',
      err instanceof Error ? err.message : err,
    );
  }
}

export function isFtsAvailable(): boolean {
  return ftsAvailable === true;
}

// Sprint 41 P0.3 — backfill из существующих chunks. Идёт батчами по 200,
// каждый chunk + его source title/sourceType/tags. Не падает на отдельных
// ошибках — продолжает следующий батч.
export async function backfillKnowledgeFts(): Promise<void> {
  console.log('[knowledge-fts] backfill: начат');
  const batchSize = 200;
  let processed = 0;
  let cursor: string | null = null;
  for (;;) {
    // Explicit unknown-typed cast — Prisma generic resolution иногда циклится
    // в TS на nested include внутри infinite for-loop. Подсказываем компилятору
    // через локальный const с явной структурой.
    const batch: Array<{
      id: string;
      sourceId: string;
      projectId: string | null;
      text: string;
      redactedText: string | null;
      source: { id: string; title: string; sourceType: string; tagsJson: string | null; archivedAt: Date | null };
    }> = await prisma.knowledgeChunk.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: 'asc' },
      take: batchSize,
      include: {
        source: {
          select: { id: true, title: true, sourceType: true, tagsJson: true, archivedAt: true },
        },
      },
    });
    if (batch.length === 0) break;

    for (const c of batch) {
      // Архивированные chunks — пропускаем (на retrieve они и так отсекаются,
      // но засорять FTS-индекс нет смысла).
      if (c.source.archivedAt) continue;
      try {
        await insertFtsRow({
          chunkId: c.id,
          sourceId: c.sourceId,
          projectId: c.projectId ?? '',
          title: c.source.title,
          sourceType: c.source.sourceType,
          tags: c.source.tagsJson ? safeTagsText(c.source.tagsJson) : '',
          text: c.text,
          redactedText: c.redactedText ?? '',
        });
      } catch (err) {
        console.warn('[knowledge-fts] backfill chunk failed', c.id, err);
      }
    }
    cursor = batch[batch.length - 1].id;
    processed += batch.length;
    if (batch.length < batchSize) break;
  }
  console.log(`[knowledge-fts] backfill: завершён, ${processed} chunks`);
}

// Sprint 41 P0.4 — sync hooks.

interface FtsRow {
  chunkId: string;
  sourceId: string;
  projectId: string;
  title: string;
  sourceType: string;
  tags: string;
  text: string;
  redactedText: string;
}

async function insertFtsRow(row: FtsRow): Promise<void> {
  // Используем $executeRaw чтобы Prisma корректно эскейпил параметры —
  // никакой ручной concatenation, защищаемся от FTS injection.
  await prisma.$executeRaw`
    INSERT INTO KnowledgeChunkFts
      (chunkId, sourceId, projectId, title, sourceType, tags, text, redactedText)
    VALUES (${row.chunkId}, ${row.sourceId}, ${row.projectId}, ${row.title},
            ${row.sourceType}, ${row.tags}, ${row.text}, ${row.redactedText})
  `;
}

export async function syncChunkToFts(chunkId: string): Promise<void> {
  if (!isFtsAvailable()) return;
  try {
    const chunk = await prisma.knowledgeChunk.findUnique({
      where: { id: chunkId },
      include: { source: { select: { title: true, sourceType: true, tagsJson: true, archivedAt: true } } },
    });
    if (!chunk || chunk.source.archivedAt) return;
    // Idempotent: сначала удалим старую row если есть, потом вставим.
    await prisma.$executeRaw`DELETE FROM KnowledgeChunkFts WHERE chunkId = ${chunkId}`;
    await insertFtsRow({
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      projectId: chunk.projectId ?? '',
      title: chunk.source.title,
      sourceType: chunk.source.sourceType,
      tags: chunk.source.tagsJson ? safeTagsText(chunk.source.tagsJson) : '',
      text: chunk.text,
      redactedText: chunk.redactedText ?? '',
    });
  } catch (err) {
    await recordSyncFailure('chunk_sync', chunkId, err);
  }
}

export async function syncSourceMetadataToFts(sourceId: string): Promise<void> {
  // Sprint 41 — title/sourceType/tags меняются на источнике; перезаписываем
  // все его FTS-строки. Тело chunks НЕ меняется в этом сценарии.
  if (!isFtsAvailable()) return;
  try {
    const source = await prisma.knowledgeSource.findUnique({
      where: { id: sourceId },
      include: { chunks: { select: { id: true, projectId: true, text: true, redactedText: true } } },
    });
    if (!source || source.archivedAt) return;
    await prisma.$executeRaw`DELETE FROM KnowledgeChunkFts WHERE sourceId = ${sourceId}`;
    for (const c of source.chunks) {
      await insertFtsRow({
        chunkId: c.id,
        sourceId: source.id,
        projectId: c.projectId ?? '',
        title: source.title,
        sourceType: source.sourceType,
        tags: source.tagsJson ? safeTagsText(source.tagsJson) : '',
        text: c.text,
        redactedText: c.redactedText ?? '',
      });
    }
  } catch (err) {
    await recordSyncFailure('source_metadata_sync', sourceId, err);
  }
}

export async function deleteSourceFromFts(sourceId: string): Promise<void> {
  if (!isFtsAvailable()) return;
  try {
    await prisma.$executeRaw`DELETE FROM KnowledgeChunkFts WHERE sourceId = ${sourceId}`;
  } catch (err) {
    await recordSyncFailure('source_delete', sourceId, err);
  }
}

export async function rebuildKnowledgeFts(): Promise<{ rebuilt: number }> {
  if (!isFtsAvailable()) return { rebuilt: 0 };
  await prisma.$executeRawUnsafe(`DELETE FROM KnowledgeChunkFts`);
  await backfillKnowledgeFts();
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(*) AS n FROM KnowledgeChunkFts`,
  );
  return { rebuilt: Number(r?.[0]?.n ?? 0) };
}

// Sprint 41 P0.5 — FTS query. Возвращает chunkIds + bm25 score, отсортирован
// по релевантности. Не делает join'а назад в KnowledgeChunk — это работа
// retrieve-функции, которая комбинирует это с метаданными source'а.
export interface FtsHit {
  chunkId: string;
  sourceId: string;
  projectId: string | null;
  bm25: number; // отрицательное число; меньше = лучше
}

/**
 * @param query — пользовательский запрос (transcript / part of it). Преобразуется
 *                в безопасный FTS query: токены > 3 chars, joined как OR.
 *                Стоп-слова не выкидываем — FTS5 сам справится через unicode61.
 */
export async function ftsSearch(query: string, limit: number): Promise<FtsHit[]> {
  if (!isFtsAvailable()) return [];
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  try {
    // SQLite FTS5: rank=bm25(KnowledgeChunkFts) встроено как «MATCH … ORDER BY rank».
    // bm25 возвращает отрицательное число, меньше = более релевантно.
    const rows = await prisma.$queryRawUnsafe<Array<{ chunkId: string; sourceId: string; projectId: string; bm25: number }>>(
      `SELECT chunkId, sourceId, projectId, bm25(KnowledgeChunkFts) AS bm25
       FROM KnowledgeChunkFts
       WHERE KnowledgeChunkFts MATCH ?
       ORDER BY bm25
       LIMIT ?`,
      ftsQuery,
      limit,
    );
    return rows.map((r) => ({
      chunkId: r.chunkId,
      sourceId: r.sourceId,
      projectId: r.projectId || null,
      bm25: Number(r.bm25),
    }));
  } catch (err) {
    console.warn('[knowledge-fts] ftsSearch failed', err);
    return [];
  }
}

// FTS injection guard: разбиваем по non-word, оставляем >=3 char токены,
// собираем как OR. Никаких пользовательских кавычек / звёздочек / NEAR —
// иначе FTS5 интерпретирует transcript-injection как операторы.
function buildFtsQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 30); // верхняя страховка
  if (tokens.length === 0) return '';
  // FTS5 OR-syntax: term1 OR term2 OR …
  return tokens.join(' OR ');
}

function safeTagsText(json: string): string {
  try {
    const arr = JSON.parse(json) as unknown;
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string').join(' ');
    return '';
  } catch {
    return '';
  }
}

async function recordSyncFailure(stage: string, targetId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[knowledge-fts] sync failure (${stage}) target=${targetId}:`, msg);
  try {
    await prisma.auditEvent.create({
      data: {
        action: 'knowledge.fts_sync_failed',
        targetType: 'KnowledgeChunkFts',
        targetId,
        payload: JSON.stringify({ stage, message: msg.slice(0, 500) }),
      },
    });
  } catch {
    // ignore — audit неудача не должна каскадить
  }
}
