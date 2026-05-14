import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import {
  ingestConversation,
  listAnalyses,
  getAnalysis,
} from '../services/conversationAnalysisService.js';

export const conversationAnalysisRoutes = Router();
conversationAnalysisRoutes.use(authMiddleware);

// 60 MB cap — handles ~2 hours of compressed audio on most codecs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// POST /api/conversation-analysis — single entry point. Accepts:
//   • multipart with `file` field   (audio upload)
//   • body.transcript               (paste text)
//   • body.audioUrl                 (recording URL)
// All optional fields: projectId, investorName.
conversationAnalysisRoutes.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = (req as { file?: Express.Multer.File }).file;
    const transcript = typeof req.body.transcript === 'string' ? req.body.transcript : null;
    const audioUrl = typeof req.body.audioUrl === 'string' ? req.body.audioUrl : null;
    const projectId = optionalString(req.body.projectId);
    const investorName = optionalString(req.body.investorName);

    if (!file && !transcript && !audioUrl) {
      return res.status(400).json({ error: 'no_input', message: 'Прикрепите файл, вставьте transcript или укажите audioUrl.' });
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
    });

    res.status(201).json({ analysis: result.card, row: result.row });
  } catch (err) {
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
conversationAnalysisRoutes.post('/text', async (req, res) => {
  const parsed = analyzeOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await ingestConversation({
      pastedTranscript: parsed.data.transcript,
      projectId: parsed.data.projectId ?? null,
      investorName: parsed.data.investorName ?? null,
    });
    res.status(201).json({ analysis: result.card, row: result.row });
  } catch (err) {
    console.error('[conversation-analysis/text]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'analysis_failed' });
  }
});

conversationAnalysisRoutes.get('/', async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const rows = await listAnalyses({ projectId });
  res.json({ analyses: rows });
});

conversationAnalysisRoutes.get('/:id', async (req, res) => {
  const row = await getAnalysis(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ analysis: row });
});

// Sprint 30 — soft-delete + audit.
conversationAnalysisRoutes.delete('/:id', async (req, res) => {
  const existing = await prisma.conversationAnalysis.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });
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
