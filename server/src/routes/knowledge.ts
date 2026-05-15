import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser, normalizeRole } from '../auth.js';
import { requireRole } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { getActorRole, isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import {
  ingestKnowledgeSource,
  retrieveKnowledgeForTranscript,
  KNOWLEDGE_SOURCE_TYPES,
  type KnowledgeScope,
  type KnowledgeSourceType,
  type KnowledgeStatus,
  type KnowledgeVisibility,
} from '../services/knowledgeService.js';

// Sprint 38 — Knowledge Base API.
//
// Назначение:
//   • admin/manager управляют source'ами (создание, статус, видимость, теги)
//   • из AI-разбора встречи кнопка «Добавить в базу знаний» зовёт POST /import-from-analysis
//   • из загруженного файла проекта — POST /import-from-file
//   • founder только читает list своего project'а (для будущего UI; не sensitive)
//
// Все mutation-routes admin-like only. INVESTOR заблокирован глобально.

export const knowledgeRoutes = Router();
knowledgeRoutes.use(authMiddleware);
knowledgeRoutes.use(requireNotInvestor());

const ingestFileSchema = z.object({
  projectId: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
  uploadedFileId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  status: z.enum(['draft', 'published', 'disabled']).optional(),
  visibility: z.enum(['internal', 'client_safe']).optional(),
  tags: z.array(z.string()).max(20).optional(),
  summary: z.string().max(2_000).optional().nullable(),
});

const ingestAnalysisSchema = z.object({
  projectId: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
  conversationAnalysisId: z.string().optional(),
  salesSessionId: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  status: z.enum(['draft', 'published', 'disabled']).optional(),
  visibility: z.enum(['internal', 'client_safe']).optional(),
  tags: z.array(z.string()).max(20).optional(),
  summary: z.string().max(2_000).optional().nullable(),
}).refine((d) => d.conversationAnalysisId || d.salesSessionId, {
  message: 'either conversationAnalysisId or salesSessionId required',
});

const patchSourceSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(['draft', 'published', 'disabled']).optional(),
  visibility: z.enum(['internal', 'client_safe']).optional(),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES).optional(),
  tags: z.array(z.string()).max(20).optional(),
  summary: z.string().max(2_000).optional().nullable(),
});

// ─── Routes ────────────────────────────────────────────────────────────────

// GET /api/knowledge — list sources. Admin sees all; founder — global+own project.
// Параметры query:
//   • projectId — фильтр (опционально)
//   • scope — 'global' | 'project'
//   • status — фильтр (опционально)
knowledgeRoutes.get('/', async (req, res) => {
  const role = getActorRole(req);
  const user = getUser(req);
  const isAdmin = isAdminLike(role);

  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  // Founder: фильтруем по client_safe + project_id принадлежит ему.
  // Sprint 38 P0 Security — нельзя смешивать чужой project knowledge.
  const where: Record<string, unknown> = { archivedAt: null };
  if (status) where.status = status;
  if (scope === 'global') where.scope = 'global';
  if (scope === 'project') where.scope = 'project';

  if (isAdmin) {
    // Admin может задать projectId фильтром, иначе видит всё.
    if (projectId) where.projectId = projectId;
  } else {
    // Founder: project sources только по своим проектам; global всегда видит,
    // но только visibility=client_safe.
    where.visibility = 'client_safe';
    where.OR = [
      { scope: 'global' },
      { scope: 'project', project: { is: { userId: user.id } } },
    ];
    if (projectId) {
      // founder может уточнить projectId — но только свой.
      const owned = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
        select: { id: true },
      });
      if (!owned) return res.status(404).json({ error: 'project_not_found' });
      where.OR = [
        { scope: 'global' },
        { scope: 'project', projectId },
      ];
    }
  }

  const sources = await prisma.knowledgeSource.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { _count: { select: { chunks: true } } },
  });

  res.json({
    sources: sources.map((s) => ({
      id: s.id,
      scope: s.scope,
      projectId: s.projectId,
      title: s.title,
      sourceType: s.sourceType,
      status: s.status,
      visibility: s.visibility,
      tags: s.tagsJson ? safeJson(s.tagsJson) : [],
      summary: s.summary,
      chunkCount: s._count.chunks,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
});

// GET /api/knowledge/:id/preview — preview chunks для admin/manager. Founder
// получает только title + summary (см. visibility). Возвращаем text для admin,
// redactedText (или null) для founder.
knowledgeRoutes.get('/:id/preview', async (req, res) => {
  const role = getActorRole(req);
  const isAdmin = isAdminLike(role);
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: req.params.id },
    include: {
      chunks: { orderBy: { chunkIndex: 'asc' }, take: 10 },
    },
  });
  if (!source || source.archivedAt) return res.status(404).json({ error: 'not_found' });

  // Founder может видеть только client_safe + свой project / global.
  if (!isAdmin) {
    if (source.visibility !== 'client_safe') return res.status(403).json({ error: 'forbidden' });
    if (source.scope === 'project' && source.projectId) {
      const owned = await prisma.project.findFirst({
        where: { id: source.projectId, userId: getUser(req).id },
        select: { id: true },
      });
      if (!owned) return res.status(404).json({ error: 'not_found' });
    }
  }

  res.json({
    source: {
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
      scope: source.scope,
      status: source.status,
      visibility: source.visibility,
      summary: source.summary,
      tags: source.tagsJson ? safeJson(source.tagsJson) : [],
    },
    chunks: source.chunks.map((c) => ({
      chunkIndex: c.chunkIndex,
      tokenEstimate: c.tokenEstimate,
      // Sprint 38 P0 — founder видит ТОЛЬКО redacted; admin/manager — оба.
      text: isAdmin ? c.text : null,
      redactedText: c.redactedText,
    })),
  });
});

// POST /api/knowledge/import-from-file — admin/manager. Берёт UploadedFile,
// извлекает текст, чанкирует, создаёт source.
knowledgeRoutes.post(
  '/import-from-file',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const parsed = ingestFileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;
    // Validate file exists
    const file = await prisma.uploadedFile.findUnique({ where: { id: d.uploadedFileId } });
    if (!file) return res.status(404).json({ error: 'file_not_found' });
    try {
      const out = await ingestKnowledgeSource({
        scope: d.scope as KnowledgeScope,
        projectId: d.projectId ?? null,
        title: d.title,
        sourceType: d.sourceType as KnowledgeSourceType,
        status: (d.status ?? 'draft') as KnowledgeStatus,
        visibility: (d.visibility ?? 'internal') as KnowledgeVisibility,
        tags: d.tags,
        summary: d.summary ?? null,
        createdById: getUser(req).id,
        uploadedFileId: d.uploadedFileId,
      });
      await recordAudit(req, {
        action: 'knowledge.import_file',
        targetType: 'KnowledgeSource',
        targetId: out.sourceId,
        payload: { fileId: d.uploadedFileId, chunkCount: out.chunkCount, scope: d.scope, sourceType: d.sourceType },
      });
      res.status(201).json(out);
    } catch (err) {
      console.error('[knowledge:import-file]', err);
      const msg = err instanceof Error ? err.message : 'ingest_failed';
      res.status(400).json({ error: msg });
    }
  },
);

// POST /api/knowledge/import-from-analysis — кнопка «Добавить в базу знаний»
// в AI-разборе встречи. Принимает conversationAnalysisId или salesSessionId.
knowledgeRoutes.post(
  '/import-from-analysis',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const parsed = ingestAnalysisSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;
    try {
      const out = await ingestKnowledgeSource({
        scope: d.scope as KnowledgeScope,
        projectId: d.projectId ?? null,
        title: d.title,
        sourceType: d.sourceType as KnowledgeSourceType,
        status: (d.status ?? 'draft') as KnowledgeStatus,
        visibility: (d.visibility ?? 'internal') as KnowledgeVisibility,
        tags: d.tags,
        summary: d.summary ?? null,
        createdById: getUser(req).id,
        conversationAnalysisId: d.conversationAnalysisId,
        salesSessionId: d.salesSessionId,
      });
      await recordAudit(req, {
        action: 'knowledge.import_analysis',
        targetType: 'KnowledgeSource',
        targetId: out.sourceId,
        payload: {
          conversationAnalysisId: d.conversationAnalysisId,
          salesSessionId: d.salesSessionId,
          chunkCount: out.chunkCount,
          scope: d.scope,
          sourceType: d.sourceType,
        },
      });
      res.status(201).json(out);
    } catch (err) {
      console.error('[knowledge:import-analysis]', err);
      const msg = err instanceof Error ? err.message : 'ingest_failed';
      res.status(400).json({ error: msg });
    }
  },
);

// PATCH /api/knowledge/:id — admin/manager обновляет статус/visibility/tags.
knowledgeRoutes.patch(
  '/:id',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const parsed = patchSourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const existing = await prisma.knowledgeSource.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });
    const d = parsed.data;
    const updated = await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.visibility !== undefined ? { visibility: d.visibility } : {}),
        ...(d.sourceType !== undefined ? { sourceType: d.sourceType } : {}),
        ...(d.tags !== undefined ? { tagsJson: d.tags.length ? JSON.stringify(d.tags) : null } : {}),
        ...(d.summary !== undefined ? { summary: d.summary } : {}),
      },
    });
    // Sprint 39 P2 — гранулярный audit. Спека просит публикацию/отключение
    // как отдельные события, чтобы их было видно в audit-логе без парсинга
    // payload'а. Для остальных полей пишем общий update.
    const action =
      d.status === 'published' ? 'knowledge.source.publish'
      : d.status === 'disabled' ? 'knowledge.source.disable'
      : 'knowledge.source.update';
    await recordAudit(req, {
      action,
      targetType: 'KnowledgeSource',
      targetId: existing.id,
      payload: {
        changed: Object.keys(d),
        // не пишем сами значения чтобы не утечь — статус/visibility достаточно для audit'а.
        status: d.status,
        visibility: d.visibility,
        previousStatus: existing.status,
      },
    });
    res.json({ source: { id: updated.id, status: updated.status, visibility: updated.visibility } });
  },
);

// POST /api/knowledge/create-note — Sprint 39. Ручная заметка из raw text.
// Используется формой «Создать заметку» в админ-разделе «База знаний».
// Backend в Sprint 38 уже поддерживал rawText в ingestKnowledgeSource,
// но HTTP-эндпоинта для него не было.
const createNoteSchema = z.object({
  projectId: z.string().optional().nullable(),
  scope: z.enum(['global', 'project']),
  title: z.string().trim().min(1).max(300),
  text: z.string().trim().min(40, 'too_short').max(60_000),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  status: z.enum(['draft', 'published', 'disabled']).optional(),
  visibility: z.enum(['internal', 'client_safe']).optional(),
  tags: z.array(z.string()).max(20).optional(),
  summary: z.string().max(2_000).optional().nullable(),
});

knowledgeRoutes.post(
  '/create-note',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;
    try {
      const out = await ingestKnowledgeSource({
        scope: d.scope as KnowledgeScope,
        projectId: d.projectId ?? null,
        title: d.title,
        sourceType: d.sourceType as KnowledgeSourceType,
        status: (d.status ?? 'draft') as KnowledgeStatus,
        visibility: (d.visibility ?? 'internal') as KnowledgeVisibility,
        tags: d.tags,
        summary: d.summary ?? null,
        createdById: getUser(req).id,
        rawText: d.text,
      });
      await recordAudit(req, {
        action: 'knowledge.source.create',
        targetType: 'KnowledgeSource',
        targetId: out.sourceId,
        payload: {
          scope: d.scope,
          sourceType: d.sourceType,
          chunkCount: out.chunkCount,
          totalChars: out.totalChars,
          // НЕ пишем full text — только сигнатуру (см. Sprint 38 audit policy).
        },
      });
      res.status(201).json(out);
    } catch (err) {
      console.error('[knowledge:create-note]', err);
      const msg = err instanceof Error ? err.message : 'create_failed';
      res.status(400).json({ error: msg });
    }
  },
);

// POST /api/knowledge/search-debug — Sprint 39 P1. Тестовая ручка для
// отладки качества retrieval'а: «Проверить поиск» в админке. Возвращает
// тот же shape, что и внутренний retrieve, но с raw score'ом видимым.
// Только admin/manager — это диагностический инструмент.
const searchDebugSchema = z.object({
  query: z.string().trim().min(3).max(8_000),
  projectId: z.string().optional().nullable(),
  topN: z.number().int().min(1).max(20).optional(),
});

knowledgeRoutes.post(
  '/search-debug',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const parsed = searchDebugSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const d = parsed.data;
    const role = getActorRole(req);
    const result = await retrieveKnowledgeForTranscript(d.query, {
      projectId: d.projectId ?? null,
      role,
      topN: d.topN ?? 8,
    });
    await recordAudit(req, {
      action: 'knowledge.search.debug',
      targetType: 'KnowledgeSearch',
      targetId: null,
      payload: {
        projectId: d.projectId ?? null,
        queryLength: d.query.length,
        hitCount: result.sources.length,
        chunksScanned: result.totalChunksScanned,
        // Сам query не пишем — он может содержать transcript встречи.
      },
    });
    res.json({
      sources: result.sources.map((s) => ({
        sourceId: s.sourceId,
        title: s.title,
        sourceType: s.sourceType,
        scope: s.scope,
        visibility: s.visibility,
        summary: s.summary,
        // Admin/manager — raw snippet видят полностью.
        snippet: s.snippetText,
        score: Number(s.score.toFixed(4)),
      })),
      totalChunksScanned: result.totalChunksScanned,
    });
  },
);

// DELETE /api/knowledge/:id — soft-delete. Chunks остаются, но source
// помечается archivedAt и retrieval его уже не учтёт.
knowledgeRoutes.delete(
  '/:id',
  requireRole(['ADMIN', 'MANAGER']),
  async (req, res) => {
    const existing = await prisma.knowledgeSource.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });
    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    await recordAudit(req, {
      action: 'knowledge.archive',
      targetType: 'KnowledgeSource',
      targetId: existing.id,
      payload: { title: existing.title, sourceType: existing.sourceType, scope: existing.scope },
    });
    res.json({ ok: true, archivedAt: new Date().toISOString() });
  },
);

// ─── helpers ───────────────────────────────────────────────────────────────

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return []; }
}

// Helper: unused but kept for future use. tsx complains about unused imports
// of normalizeRole, so this is a no-op to silence it (cleaner than @ts-ignore).
void normalizeRole;
