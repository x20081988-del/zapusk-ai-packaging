import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { assertProjectOwnership, getActorRole, isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import { captureCandidateFromConversationAnalysis } from '../services/knowledgeService.js';
import {
  ingestConversation,
  listAnalyses,
  getAnalysis,
} from '../services/conversationAnalysisService.js';
import { isAIGuardrailError } from '../ai/client.js';
import { withRateLimit } from '../lib/rateLimit.js';

export const conversationAnalysisRoutes = Router();
conversationAnalysisRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не работает с founder-conversation-analysis.
conversationAnalysisRoutes.use(requireNotInvestor());

// 60 MB cap — handles ~2 hours of compressed audio on most codecs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// POST /api/conversation-analysis — single entry point. Accepts:
//   • multipart with `file` field   (audio upload)
//   • body.transcript               (paste text)
//   • body.audioUrl                 (recording URL)
// All optional fields: projectId, investorName.
// Sprint 50 P0.2 — file_upload bucket on the multipart route (limits the
// concurrent file-upload abuse vector; the inner ai_inference work is also
// bounded by the AI cost guardrails). Order matters: rate-limit BEFORE the
// multer parse so we drop too-many-requests before paying the bandwidth.
conversationAnalysisRoutes.post('/', withRateLimit('file_upload'), upload.single('file'), async (req, res) => {
  try {
    const file = (req as { file?: Express.Multer.File }).file;
    const transcript = typeof req.body.transcript === 'string' ? req.body.transcript : null;
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl : null;
    const projectId = optionalString(req.body.projectId);
    const investorName = optionalString(req.body.investorName);

    if (!file && !transcript && !audioUrl) {
      return res.status(400).json({ error: 'no_input', message: 'Прикрепите файл, вставьте transcript или укажите audioUrl.' });
    }

    // Sprint 48A — projectId опционален. Если проект выбран, проверяем
    // владение; если нет — сохраняем разбор как личный createdById текущего
    // пользователя и не требуем project_required.
    if (projectId) {
      const ownership = await assertProjectOwnership(req, projectId);
      if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    }

    const result = await ingestConversation({
      audioBuffer: file?.buffer ?? null,
      audioMime: file?.mimetype ?? null,
      originalFileName: file?.originalname ?? null,
      fileSize: file?.size ?? null,
      audioUrl,
      pastedTranscript: transcript,
      projectId,
      investorName,
      createdById: getUser(req).id,
    });

    // Sprint 40 P0.3 — auto-capture candidate в KB. Fire-and-forget.
    captureCandidateFromConversationAnalysis((result.row as { id: string }).id, getUser(req).id)
      .then((r) => {
        if (r.captured) console.log(`[conv-analysis/auto-capture] sourceId=${r.sourceId} duplicate=${r.duplicate ?? false}`);
        else console.log(`[conv-analysis/auto-capture] skipped reason=${r.reason}`);
      })
      .catch((err) => console.warn('[conv-analysis/auto-capture] failed', err));

    res.status(201).json({ analysis: result.card, row: result.row });
  } catch (err) {
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    if (err instanceof Error && err.message === 'transcript_too_short') {
      return res.status(400).json({ error: 'transcript_too_short', message: 'Transcript слишком короткий для анализа.' });
    }
    console.error('[conversation-analysis]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'analysis_failed' });
  }
});

const analyzeOnlySchema = z.object({
  transcript: z.string().min(20),
  projectId: z.string().optional().nullable(),
  investorName: z.string().optional().nullable(),
});

// Convenience endpoint for pure text analysis without multipart parsing.
conversationAnalysisRoutes.post('/text', withRateLimit('ai_inference'), async (req, res) => {
  const parsed = analyzeOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Sprint 48A — projectId опционален. Без проекта анализируем только transcript
  // и привязываем запись к текущему пользователю через createdById.
  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  try {
    const result = await ingestConversation({
      pastedTranscript: parsed.data.transcript,
      projectId: parsed.data.projectId ?? null,
      investorName: parsed.data.investorName ?? null,
      createdById: getUser(req).id,
    });
    // Sprint 40 P0.3 — auto-capture для /text endpoint тоже.
    captureCandidateFromConversationAnalysis((result.row as { id: string }).id, getUser(req).id)
      .then((r) => {
        if (r.captured) console.log(`[conv-analysis/text auto-capture] sourceId=${r.sourceId}`);
      })
      .catch((err) => console.warn('[conv-analysis/text auto-capture] failed', err));
    res.status(201).json({ analysis: result.card, row: result.row });
  } catch (err) {
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    console.error('[conversation-analysis/text]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'analysis_failed' });
  }
});

conversationAnalysisRoutes.get('/', async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

  // Sprint 35 P0.3 — founder видит только свои анализы.
  const role = getActorRole(req);
  const ownerUserId = isAdminLike(role) ? undefined : getUser(req).id;

  const rows = await listAnalyses({ projectId, ownerUserId });
  res.json({ analyses: rows });
});

conversationAnalysisRoutes.get('/:id', async (req, res) => {
  const row = await getAnalysis(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  // Sprint 48A — founder может открыть запись своего проекта или собственный
  // projectless-разбор (createdById). 404 чтобы не палить чужие записи.
  const role = getActorRole(req);
  if (!isAdminLike(role)) {
    const userId = getUser(req).id;
    if (row.createdById !== userId) {
      if (!row.projectId) return res.status(404).json({ error: 'not_found' });
      const ownership = await assertProjectOwnership(req, row.projectId);
      if (!ownership.ok) return res.status(404).json({ error: 'not_found' });
    }
  }

  // Sprint 37 P0.3 — audit на чтение анализа. Содержит transcript разговора
  // фаундера с инвестором — высокочувствительный контент. Metadata-only:
  // projectId + investorName + spinStage + aiScore.
  await recordAudit(req, {
    action: 'conversation_analysis.read',
    targetType: 'ConversationAnalysis',
    targetId: row.id,
    payload: {
      projectId: row.projectId,
      investorName: row.investorName,
      spinStage: row.spinStage,
      aiScore: row.aiScore,
    },
  });

  res.json({ analysis: row });
});

// Sprint 30 — soft-delete + audit.
conversationAnalysisRoutes.delete('/:id', async (req, res) => {
  const existing = await prisma.conversationAnalysis.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });

  // Sprint 48A — founder может архивировать свой projectless-разбор или запись
  // своего проекта.
  const role = getActorRole(req);
  if (!isAdminLike(role)) {
    const userId = getUser(req).id;
    if (existing.createdById !== userId) {
      if (!existing.projectId) return res.status(404).json({ error: 'not_found' });
      const ownership = await assertProjectOwnership(req, existing.projectId);
      if (!ownership.ok) return res.status(404).json({ error: 'not_found' });
    }
  }

  await prisma.conversationAnalysis.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  await recordAudit(req, {
    action: 'conversation_analysis.archive',
    targetType: 'ConversationAnalysis',
    targetId: existing.id,
    payload: { projectId: existing.projectId, investorName: existing.investorName },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});

function optionalString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}
