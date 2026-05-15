import { prisma } from '../db.js';
import { extractFromUploadedFile } from './fileParser.js';

// Sprint 38 — Knowledge Base сервис.
//
// Делает 4 вещи:
//   1. ingestFromUploadedFile / *Conversation / *SalesSession / *Document —
//      берёт источник, извлекает текст, чанкирует, сохраняет в KnowledgeChunk.
//   2. retrieveForProject(projectId, transcript, role) — keyword-scored поиск
//      по chunks, с фильтром «только global + текущий project, только
//      published, только видимое роли». Возвращает top-N chunks.
//   3. redactSensitive — маскирует phones / emails / URL'ы в тексте перед
//      сохранением в `redactedText` (показывается founder'у, не raw).
//   4. visibilityFor(role) — список visibility'ей, доступных роли.
//
// Не делает в MVP: vector embeddings, semantic search, retrieval-метрики.
// Контракт оставлен расширяемым (см. KnowledgeRetrievalResult.sources с
// score'ом — туда позже встанет cosine similarity).

// ─── Constants ─────────────────────────────────────────────────────────────

// 800-1200 символов на chunk — компромисс: достаточно контекста для AI,
// не слишком много токенов на retrieval. По спеке Sprint 38 P0.
const CHUNK_TARGET_MIN = 800;
const CHUNK_TARGET_MAX = 1200;
// Жёсткий cap чтобы не уронить retrieval на огромных PDF.
const MAX_CHUNKS_PER_SOURCE = 200;

// Top-N chunks возвращаемых на retrieve. AI получит их инлайном в prompt.
// 3-7 по спеке — берём 5 как baseline, фронт может ужать.
const DEFAULT_TOP_N = 5;

// Минимальный keyword length — фильтруем стоп-слова и предлоги.
const MIN_KEYWORD_LEN = 4;
// Сколько лучших keyword'ов берём из transcript'а для скоринга.
const KEYWORD_BUDGET = 40;

// Простой стоп-список — самые частые русские/английские слова, которые
// дают шум в keyword-scoring. Полный список TF-IDF не строим (нет corpus'а),
// но эти 50 покрывают 80% noise'а.
const STOPWORDS = new Set([
  // RU
  'это', 'этот', 'эта', 'этого', 'эти', 'тот', 'тоже', 'также',
  'который', 'которая', 'которое', 'которые', 'который',
  'если', 'тогда', 'когда', 'потом', 'затем', 'сейчас', 'теперь',
  'может', 'можно', 'нужно', 'надо', 'будет', 'было', 'были',
  'есть', 'нет', 'был', 'была', 'быть',
  'очень', 'просто', 'только', 'даже', 'ещё',
  'свой', 'своя', 'свои', 'наш', 'наша', 'наши', 'ваш', 'ваша',
  'один', 'два', 'три', 'четыре', 'пять',
  // EN
  'this', 'that', 'these', 'those', 'with', 'from', 'have', 'will',
  'would', 'could', 'should', 'about', 'their', 'there', 'them',
  'what', 'when', 'where', 'which', 'while',
]);

// ─── Types ─────────────────────────────────────────────────────────────────

export type KnowledgeScope = 'global' | 'project';
export type KnowledgeStatus = 'draft' | 'published' | 'disabled';
export type KnowledgeVisibility = 'internal' | 'client_safe';
// Sprint 38 P1 taxonomy.
export const KNOWLEDGE_SOURCE_TYPES = [
  'successful_sale', 'failed_sale', 'objection', 'qualification', 'follow_up',
  'legal_question', 'financial_question', 'project_presentation', 'deal_case',
  'manager_script', 'messenger_thread', 'meeting_recording', 'other',
] as const;
export type KnowledgeSourceType = typeof KNOWLEDGE_SOURCE_TYPES[number];

export interface IngestResult {
  sourceId: string;
  chunkCount: number;
  totalChars: number;
}

export interface RetrievedSource {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: KnowledgeScope;
  visibility: KnowledgeVisibility;
  summary: string | null;
  // Топ-1 snippet из этого source'а, score'ом наиболее релевантный transcript'у.
  // Заполняется raw текстом, route-слой сам решает чем подменить для founder.
  snippetText: string;
  snippetRedacted: string | null;
  score: number;
}

export interface KnowledgeRetrievalResult {
  sources: RetrievedSource[];
  totalChunksScanned: number;
}

// ─── Public API: Ingestion ─────────────────────────────────────────────────

export interface IngestSourceInput {
  scope: KnowledgeScope;
  projectId?: string | null;
  title: string;
  sourceType: KnowledgeSourceType;
  status?: KnowledgeStatus;
  visibility?: KnowledgeVisibility;
  tags?: string[];
  summary?: string | null;
  createdById?: string | null;
  // Один из источников контента:
  rawText?: string;
  uploadedFileId?: string;
  conversationAnalysisId?: string;
  salesSessionId?: string;
  generatedDocumentId?: string;
}

export async function ingestKnowledgeSource(input: IngestSourceInput): Promise<IngestResult> {
  // 1. Извлекаем raw text из одного из источников.
  let rawText = input.rawText ?? '';
  let uploadedFileId: string | null = null;
  let conversationAnalysisId: string | null = null;
  let salesSessionId: string | null = null;

  if (input.uploadedFileId) {
    uploadedFileId = input.uploadedFileId;
    const file = await prisma.uploadedFile.findUnique({ where: { id: input.uploadedFileId } });
    if (file) {
      const extracted = await extractFromUploadedFile({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        path: file.path,
        category: file.category,
        url: file.url,
      });
      rawText = extracted.text || rawText;
    }
  } else if (input.conversationAnalysisId) {
    conversationAnalysisId = input.conversationAnalysisId;
    const row = await prisma.conversationAnalysis.findUnique({ where: { id: input.conversationAnalysisId } });
    if (row) {
      // Берём и transcript, и AI-аналитику (analysis JSON), и метаданные.
      // analysis уже structured, разворачивать в плоский текст; transcript —
      // первичный материал.
      const parts: string[] = [];
      if (row.investorName) parts.push(`Инвестор: ${row.investorName}`);
      if (row.spinStage) parts.push(`Этап СПИН: ${row.spinStage}`);
      if (row.sentiment) parts.push(`Тон: ${row.sentiment}`);
      if (row.analysis) parts.push(`AI-разбор:\n${row.analysis}`);
      if (row.transcript) parts.push(`Transcript:\n${row.transcript}`);
      rawText = parts.join('\n\n');
    }
  } else if (input.salesSessionId) {
    salesSessionId = input.salesSessionId;
    const row = await prisma.salesSession.findUnique({ where: { id: input.salesSessionId } });
    if (row) {
      const parts: string[] = [];
      if (row.investorName) parts.push(`Инвестор: ${row.investorName}`);
      if (row.summary) parts.push(`Резюме: ${row.summary}`);
      if (row.investorInterest) parts.push(`Интерес: ${row.investorInterest}`);
      if (row.checkRange) parts.push(`Чек: ${row.checkRange}`);
      if (row.objections) parts.push(`Возражения: ${row.objections}`);
      if (row.materialsToSend) parts.push(`Материалы: ${row.materialsToSend}`);
      if (row.nextStep) parts.push(`Следующий шаг: ${row.nextStep}`);
      if (row.followUpMessage) parts.push(`Follow-up: ${row.followUpMessage}`);
      if (row.managerNote) parts.push(`Заметка менеджера: ${row.managerNote}`);
      if (row.transcript) parts.push(`Transcript:\n${row.transcript}`);
      rawText = parts.join('\n\n');
    }
  } else if (input.generatedDocumentId) {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: input.generatedDocumentId } });
    if (doc) rawText = `${doc.title}\n\n${doc.body}`;
  }

  if (!rawText || rawText.trim().length < 40) {
    throw new Error('knowledge_source_text_too_short');
  }

  // 2. Создаём source row.
  const source = await prisma.knowledgeSource.create({
    data: {
      scope: input.scope,
      projectId: input.scope === 'project' ? (input.projectId ?? null) : null,
      title: input.title,
      sourceType: input.sourceType,
      status: input.status ?? 'draft',
      visibility: input.visibility ?? 'internal',
      uploadedFileId,
      conversationAnalysisId,
      salesSessionId,
      tagsJson: input.tags && input.tags.length ? JSON.stringify(input.tags) : null,
      summary: input.summary ?? null,
      createdById: input.createdById ?? null,
    },
  });

  // 3. Чанкируем и сохраняем chunks.
  const chunks = chunkText(rawText);
  let chunkCount = 0;
  for (const [idx, text] of chunks.entries()) {
    if (idx >= MAX_CHUNKS_PER_SOURCE) break;
    await prisma.knowledgeChunk.create({
      data: {
        sourceId: source.id,
        projectId: source.projectId,
        chunkIndex: idx,
        text,
        redactedText: redactSensitive(text),
        tokenEstimate: Math.ceil(text.length / 4),
        tagsJson: source.tagsJson,
      },
    });
    chunkCount++;
  }

  return { sourceId: source.id, chunkCount, totalChars: rawText.length };
}

// ─── Public API: Retrieval ─────────────────────────────────────────────────

export interface RetrievalOptions {
  projectId?: string | null;
  // Роль актора. Влияет на:
  //   • какую visibility отдаём
  //   • вернуть raw текст snippet'а или только title + summary
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR' | string;
  // Сколько top-N source'ов вернуть (default 5, спека Sprint 38 = 3-7).
  topN?: number;
}

export async function retrieveKnowledgeForTranscript(
  transcript: string,
  options: RetrievalOptions,
): Promise<KnowledgeRetrievalResult> {
  const keywords = extractKeywords(transcript);
  if (keywords.length === 0) {
    return { sources: [], totalChunksScanned: 0 };
  }

  // Sprint 38 P0 Security:
  //   • global published source'ы видны всем
  //   • project published — только для своего projectId
  //   • НИКОГДА не смешиваем project A в результаты project B
  //   • visibility=internal — только admin/manager; client_safe — все
  const visibilityFilter = visibilityFor(options.role);
  const projectFilter = options.projectId
    ? [{ scope: 'global' }, { scope: 'project', projectId: options.projectId }]
    : [{ scope: 'global' }];

  // Загружаем published chunks из allowed sources. Скорим в node'е — у нас
  // SQLite, нет builtin FTS на keyword-array, и MVP с парой сотен chunks
  // на проект работает быстрее всякого FTS overhead'а.
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      source: {
        status: 'published',
        archivedAt: null,
        visibility: { in: visibilityFilter },
        OR: projectFilter,
      },
    },
    include: {
      source: {
        select: {
          id: true, title: true, sourceType: true, scope: true,
          visibility: true, summary: true, projectId: true,
        },
      },
    },
    take: 2000, // верхняя страховка от взрывного роста
  });

  if (chunks.length === 0) {
    return { sources: [], totalChunksScanned: 0 };
  }

  // Скорим каждый chunk; группируем по source; берём лучший chunk на source.
  type ScoredChunk = (typeof chunks)[number] & { score: number };
  const scored: ScoredChunk[] = chunks
    .map((c) => ({ ...c, score: scoreChunkAgainstKeywords(c.text, keywords) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const sourcesById = new Map<string, RetrievedSource>();
  for (const chunk of scored) {
    if (sourcesById.has(chunk.source.id)) continue;
    sourcesById.set(chunk.source.id, {
      sourceId: chunk.source.id,
      title: chunk.source.title,
      sourceType: chunk.source.sourceType,
      scope: chunk.source.scope as KnowledgeScope,
      visibility: chunk.source.visibility as KnowledgeVisibility,
      summary: chunk.source.summary,
      snippetText: chunk.text,
      snippetRedacted: chunk.redactedText,
      score: chunk.score,
    });
    if (sourcesById.size >= (options.topN ?? DEFAULT_TOP_N)) break;
  }

  return {
    sources: Array.from(sourcesById.values()),
    totalChunksScanned: chunks.length,
  };
}

// ─── Public helpers ────────────────────────────────────────────────────────

// Какие visibility'и можно отдавать роли. SUPER_ADMIN/ADMIN/MANAGER видят
// всё; FOUNDER — только client_safe; INVESTOR не должен сюда заходить
// (отрезан requireNotInvestor на route-уровне).
export function visibilityFor(role: string): KnowledgeVisibility[] {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER') {
    return ['internal', 'client_safe'];
  }
  return ['client_safe'];
}

// Может ли актор видеть raw snippet (не только title). Founder — нет.
export function canSeeRawSnippet(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
}

// Sprint 38 P0 — собираем prompt-friendly block из retrieved sources.
// Manager/Admin получают полный snippet; founder — только title + summary.
// Используется salesAssistantService для инъекции в user prompt.
export function formatKnowledgeForPrompt(
  retrieval: KnowledgeRetrievalResult,
  role: string,
): string {
  if (retrieval.sources.length === 0) return '';
  const showRaw = canSeeRawSnippet(role);
  const lines: string[] = [];
  retrieval.sources.forEach((s, idx) => {
    const num = idx + 1;
    lines.push(`[${num}] ${s.title} (тип: ${s.sourceType}, scope: ${s.scope})`);
    if (s.summary) lines.push(`   Краткое: ${s.summary}`);
    if (showRaw) {
      // Manager/Admin AI prompt — даём raw snippet. Это контекст для модели,
      // не для UI. Founder UI получит только titles (см. formatKnowledgeForUi).
      const snippet = (s.snippetText || '').trim().slice(0, 800);
      lines.push(`   Фрагмент: ${snippet}`);
    } else {
      // Founder prompt — даём redacted snippet, чтобы AI всё равно использовал
      // контекст, но без чувствительных данных.
      const snippet = (s.snippetRedacted || s.snippetText || '').trim().slice(0, 800);
      lines.push(`   Фрагмент: ${snippet}`);
    }
  });
  return lines.join('\n');
}

// Sprint 38 P1 — собираем UI-friendly список для фронта. Founder видит
// только title + sourceType + summary. Manager/Admin — то же + snippet.
export function formatKnowledgeForUi(
  retrieval: KnowledgeRetrievalResult,
  role: string,
): Array<{
  sourceId: string;
  title: string;
  sourceType: string;
  scope: KnowledgeScope;
  summary: string | null;
  snippet: string | null;
}> {
  const showRaw = canSeeRawSnippet(role);
  return retrieval.sources.map((s) => ({
    sourceId: s.sourceId,
    title: s.title,
    sourceType: s.sourceType,
    scope: s.scope,
    summary: s.summary,
    snippet: showRaw ? (s.snippetText || null) : null,
  }));
}

// ─── Internal: chunking, keywords, scoring, redaction ─────────────────────

// Чанкирует по «параграф-aware» алгоритму. Идёт по абзацам, набирает текст
// пока не превысит CHUNK_TARGET_MAX; если текущий chunk уже >= CHUNK_TARGET_MIN
// и попался конец параграфа — flush. Это даёт более «осмысленные» чанки, чем
// слепой slice по N символам (не режет посреди предложения).
export function chunkText(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    // Если параграф сам по себе больше max — разбиваем его по предложениям.
    if (para.length > CHUNK_TARGET_MAX) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const sentences = splitIntoSentences(para);
      for (const sent of sentences) {
        if (sent.length > CHUNK_TARGET_MAX) {
          // hard slice — это аномальный кейс (нет пунктуации, типа OCR-мусора).
          for (let i = 0; i < sent.length; i += CHUNK_TARGET_MAX) {
            chunks.push(sent.slice(i, i + CHUNK_TARGET_MAX));
          }
          continue;
        }
        if (current.length + sent.length + 1 > CHUNK_TARGET_MAX) {
          chunks.push(current);
          current = sent;
        } else {
          current = current ? `${current} ${sent}` : sent;
        }
      }
      continue;
    }

    if (current.length + para.length + 2 > CHUNK_TARGET_MAX) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
    // Если уже набрали достаточно — flush.
    if (current.length >= CHUNK_TARGET_MIN && current.endsWith('.')) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

function splitIntoSentences(text: string): string[] {
  // Простой split по '.?!' с сохранением пунктуации. Не идеален для аббревиатур
  // («ООО.», «г.»), но для MVP достаточен.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Достаёт keyword'ы из transcript'а: lowercase, длиннее MIN_KEYWORD_LEN,
// без стоп-слов, дедуп. Сортируем по частоте, берём KEYWORD_BUDGET top'овых.
function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    // оставляем буквы (rus+eng) и цифры; режем всё остальное
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_KEYWORD_LEN && !STOPWORDS.has(t));

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEYWORD_BUDGET)
    .map(([t]) => t);
}

// TF-lite scoring: count keyword hits в chunk'е, нормализуем на sqrt(длины).
// Длинные chunks не должны автоматически побеждать только потому, что в них
// больше слов вообще.
function scoreChunkAgainstKeywords(chunkText: string, keywords: string[]): number {
  if (!chunkText || keywords.length === 0) return 0;
  const lower = chunkText.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    // Простой substring match. Достаточен для MVP — Russian morphology
    // частично покрывается keyword extraction'ом (берём корни 4+ символов).
    if (lower.includes(kw)) hits++;
  }
  if (hits === 0) return 0;
  return hits / Math.sqrt(chunkText.length);
}

// Sprint 38 P0 Security — redaction перед сохранением в redactedText.
// Идея: для global KB или founder-visible source'а текст должен быть
// очищен от PII (телефоны, email, URL). NLP/ФИО мы не детектим — это
// дороже и хрупче; рассчитываем на ручную проверку перед published.
const PHONE_RE = /\+?\d[\d \-()]{8,}\d/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE = /https?:\/\/[^\s)]+/gi;

export function redactSensitive(text: string): string {
  if (!text) return text;
  return text
    .replace(PHONE_RE, '[телефон]')
    .replace(EMAIL_RE, '[email]')
    .replace(URL_RE, '[ссылка]');
}
