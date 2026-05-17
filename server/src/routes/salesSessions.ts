import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { assertProjectOwnership, getActorRole, isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import { captureCandidateFromSalesSession } from '../services/knowledgeService.js';
import { isAIGuardrailError } from '../ai/client.js';
import { withIdempotency } from '../lib/idempotency.js';
import { actorCanReadSalesSession } from '../lib/accessPolicy.js';
import {
  completeSession,
  persistSession,
  listSessions,
  getSession,
  updateSessionOutcome,
  type CompleteSessionInput,
  type SessionOutcome,
} from '../services/salesSessionService.js';
import { createNegotiationMemory } from '../services/negotiationMemoryService.js';
import { runCleanTranscription, persistCleanTranscript } from '../services/cleanTranscriptService.js';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storage } from '../services/storage.js';

export const salesSessionsRoutes = Router();
salesSessionsRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не имеет доступа к встречам founder'а.
salesSessionsRoutes.use(requireNotInvestor());

const completeSchema = z.object({
  projectId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  investorName: z.string().optional().nullable(),
  investorPhone: z.string().optional().nullable(),
  transcript: z.string().min(10, 'transcript_too_short'),
  adviceHistory: z.array(z.unknown()).optional(),
  startedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
  // Sprint 43 P0.4 — frontend передаёт id всех full-analyze advice events,
  // которые произошли в рамках этой встречи. После создания SalesSession мы
  // backfill'им их salesSessionId. Это и есть link для outcome-attribution.
  adviceEventIds: z.array(z.string()).max(50).optional(),
  // Sprint 52 P0.4 — multi-project context. Опционально: все упомянутые
  // проекты в этом разговоре. Передаётся для NegotiationMemory.projectIds.
  projectIds: z.array(z.string()).max(10).optional(),
  // Sprint 52 P0.3 — outcome dataset. Опционально на /complete; чаще будет
  // обновляться через PATCH /:id/outcome после звонка.
  outcome: z.enum(['success', 'failed', 'followup', 'unknown']).optional(),
  managerOutcomeNotes: z.string().max(4000).optional().nullable(),
});

// POST /api/sales-sessions/complete — analyze + persist in one call.
// The route returns both the structured summary and the persisted record so
// the frontend can show the summary modal immediately and link to the meeting.
// Sprint 50 P0.1 — idempotency on meeting finalize. Double-click on
// "Завершить встречу" or a retried fetch with the same X-Idempotency-Key
// returns the cached response instead of creating a duplicate session.
salesSessionsRoutes.post('/complete', withIdempotency(), async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // Sprint 49 hotfix 10 — orphan-safe finalize. AI-assistant может завершить
  // встречу без projectId; createdById становится владельцем. Если projectId
  // ЕСТЬ — продолжаем проверять ownership (нельзя приписать встречу к чужому
  // проекту). Если projectId нет — пропускаем gate, ничего leak'нуть нельзя.
  const input: CompleteSessionInput = { ...parsed.data, createdById: getUser(req).id };
  if (input.projectId) {
    const ownership = await assertProjectOwnership(req, input.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  try {
    const summary = await completeSession(input);
    const session = await persistSession(input, summary);

    // Sprint 43 P0.4 — линкуем advice events этой встречи. Ownership:
    // founder может линковать только свои advice (по actorId или projectId);
    // admin/manager — любые. Защита от того, что user A передаст id из встречи
    // user B и «своруёт» аналитику. updateMany возвращает только count'ы —
    // не рапортуем фронту, какие именно id сматчились.
    const adviceIds = parsed.data.adviceEventIds ?? [];
    if (adviceIds.length > 0) {
      const role = getActorRole(req);
      const baseWhere: { id: { in: string[] }; projectId?: string | null; actorId?: string } = {
        id: { in: adviceIds },
      };
      if (!isAdminLike(role)) {
        // Только свои advice: либо запись связана с тем же projectId владельца,
        // либо actorId == user.id. Любое из условий допускается.
        const user = getUser(req);
        // На уровне Prisma OR{actorId, projectId-our-own}. Сначала найдём,
        // какие id допустимы, потом обновим.
        const allowed = await prisma.assistantAdviceEvent.findMany({
          where: {
            id: { in: adviceIds },
            OR: [
              { actorId: user.id },
              input.projectId ? { projectId: input.projectId } : { id: '__none__' },
            ],
          },
          select: { id: true },
        });
        baseWhere.id = { in: allowed.map((a) => a.id) };
      }
      await prisma.assistantAdviceEvent.updateMany({
        where: baseWhere,
        data: { salesSessionId: session.id },
      });
    }

    // Sprint 40 P0.3 — auto-capture candidate в KB. Fire-and-forget, не
    // блокирует ответ. Quality gate внутри: если probability/tone/objections
    // не дотягивают — capture не создаст source. isCandidate=true →
    // retrieval его не получит, пока manager не подтвердит.
    const user = getUser(req);
    captureCandidateFromSalesSession(session.id, user.id)
      .then((r) => {
        if (r.captured) {
          console.log(`[sales-sessions/auto-capture] sourceId=${r.sourceId} duplicate=${r.duplicate ?? false}`);
        } else {
          console.log(`[sales-sessions/auto-capture] skipped reason=${r.reason}`);
        }
      })
      .catch((err) => console.warn('[sales-sessions/auto-capture] failed', err));

    // Sprint 52 P0.2 — auto-save Negotiation Memory. Fire-and-forget, не
    // блокирует ответ финализации (если упадёт — встреча всё равно сохранена).
    // Каждая завершённая встреча/звонок добавляется в memory layer для
    // будущего retrieval и training dataset'ов.
    const projectIds = parsed.data.projectIds && parsed.data.projectIds.length > 0
      ? parsed.data.projectIds
      : (input.projectId ? [input.projectId] : []);
    createNegotiationMemory({
      salesSessionId: session.id,
      primaryProjectId: input.projectId ?? null,
      projectIds,
      investorName: input.investorName ?? null,
      investorPhone: input.investorPhone ?? null,
      transcript: input.transcript,
      summary: summary.summary,
      outcome: input.outcome ?? 'unknown',
      objections: summary.objections,
      tags: [],
      speakerInsights: null,
      managerNotes: input.managerOutcomeNotes ?? null,
      createdById: user.id,
    })
      .then((memory) => {
        console.log(`[sales-sessions/memory] created id=${memory.id} outcome=${memory.outcome ?? '-'}`);
      })
      .catch((err) => console.warn('[sales-sessions/memory] create failed', err));

    res.status(201).json({ summary, session });
  } catch (err) {
    // Sprint 49 hotfix 15 — guardrail propagation. Finalize that hits the
    // daily quota wall must surface 429/402-equivalent to the UI, not 500.
    // friendlyFinalizeError() (frontend, hotfix 10) already classifies these
    // by status code.
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    console.error('[sales-sessions/complete]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'complete_session_failed' });
  }
});

salesSessionsRoutes.get('/', async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;

  // Sprint 35 P0.3 — founder видит только свои сессии. Admin/manager — все.
  const role = getActorRole(req);
  const ownerUserId = isAdminLike(role) ? undefined : getUser(req).id;

  const sessions = await listSessions({ projectId, leadId, ownerUserId });
  res.json({ sessions });
});

salesSessionsRoutes.get('/:id', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });

  // Sprint 50 P0.3 — single ownership predicate. Combines orphan-by-author
  // (Sprint 49 hotfix 10) + project ownership + admin-like role.
  const sessionRow = session as { projectId: string | null; createdById?: string | null };
  const allowed = await actorCanReadSalesSession(req, {
    projectId: sessionRow.projectId,
    createdById: sessionRow.createdById ?? null,
  });
  if (!allowed) return res.status(404).json({ error: 'not_found' });

  // Sprint 37 P0.3 — audit на чтение карточки встречи. Содержит transcript,
  // оценку вероятности, инфу об инвесторе. Metadata-only — не пишем transcript.
  await recordAudit(req, {
    action: 'sales_session.read',
    targetType: 'SalesSession',
    targetId: session.id,
    payload: {
      projectId: session.projectId,
      investorName: session.investorName,
      probabilityScore: session.probabilityScore,
      tone: session.tone,
    },
  });

  res.json({ session });
});

// Sprint 52 P0.3 — outcome dataset. Менеджер размечает результат звонка
// после факта: success / failed / followup / unknown + optional manager notes.
// Используется как training dataset для следующих переговоров (см. spec P0.3).
const outcomePatchSchema = z.object({
  outcome: z.enum(['success', 'failed', 'followup', 'unknown']).optional(),
  managerOutcomeNotes: z.string().max(4000).optional().nullable(),
});

salesSessionsRoutes.patch('/:id/outcome', async (req, res) => {
  const parsed = outcomePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.salesSession.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });
  // Same ownership rule as GET — autor or admin/manager.
  const allowed = await actorCanReadSalesSession(req, {
    projectId: existing.projectId,
    createdById: existing.createdById,
  });
  if (!allowed) return res.status(404).json({ error: 'not_found' });
  const updated = await updateSessionOutcome(req.params.id, {
    outcome: (parsed.data.outcome ?? undefined) as SessionOutcome | undefined,
    managerOutcomeNotes: parsed.data.managerOutcomeNotes ?? null,
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  await recordAudit(req, {
    action: 'sales_session.outcome_update',
    targetType: 'SalesSession',
    targetId: updated.id,
    payload: { outcome: updated.outcome, hasNotes: Boolean(updated.managerOutcomeNotes) },
  });
  res.json({ session: updated });
});

// Sprint 54 P0 — Hybrid transcription: upload the recorded audio that drove
// realtime transcription, and let backend re-transcribe via gpt-4o-transcribe
// (offline, more accurate) to replace the draft with a clean final.
//
// Pipeline:
//   1. Frontend MediaRecorder produces a Blob during the live call.
//   2. After completeMeeting succeeds, frontend POSTs the blob here.
//   3. We persist the audio to /var/data/sales-audio/<sessionId>.<ext>.
//   4. Run runCleanTranscription() — gpt-4o-transcribe + brand normalize.
//   5. If success: update SalesSession.transcript with clean text + flags.
//   6. If failure: only update transcriptQualityStatus='failed' (draft kept).
//
// Up to 50 MB per upload (typical 2-min call ≈ 1-2 MB webm).
const SALES_AUDIO_DIR = 'sales-audio';
const SALES_AUDIO_ALLOWED_MIMES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
]);

const salesAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // MediaRecorder mimeType can be 'audio/webm;codecs=opus' which we accept.
    const ok = SALES_AUDIO_ALLOWED_MIMES.has(file.mimetype) ||
      file.mimetype.startsWith('audio/webm') ||
      file.mimetype.startsWith('audio/ogg');
    if (!ok) return cb(new Error('upload_rejected:mime_not_audio'));
    cb(null, true);
  },
});

function salesAudioUploadWithGuard(
  req: Parameters<typeof getUser>[0],
  res: { status: (code: number) => { json: (body: unknown) => void } },
  next: () => void,
): void {
  salesAudioUpload.single('audio')(req as never, res as never, (err: unknown) => {
    if (!err) return next();
    if (err instanceof Error && err.message.startsWith('upload_rejected:')) {
      const reason = err.message.split(':')[1];
      res.status(400).json({ error: 'upload_rejected', reason });
      return;
    }
    if (err instanceof Error && /file too large/i.test(err.message)) {
      res.status(413).json({ error: 'file_too_large' });
      return;
    }
    res.status(400).json({ error: 'upload_failed', message: err instanceof Error ? err.message : 'unknown' });
  });
}

salesSessionsRoutes.post('/:id/audio', salesAudioUploadWithGuard, async (req, res) => {
  const existing = await prisma.salesSession.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });
  const allowed = await actorCanReadSalesSession(req, {
    projectId: existing.projectId,
    createdById: existing.createdById,
  });
  if (!allowed) return res.status(404).json({ error: 'not_found' });

  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: 'no_file' });

  // Persist audio to storage. Filename: <sessionId>.<ext> (ext from mime).
  const ext = file.mimetype.startsWith('audio/webm') ? 'webm'
    : file.mimetype.startsWith('audio/ogg')  ? 'ogg'
    : file.mimetype.startsWith('audio/wav')  || file.mimetype.startsWith('audio/wave') || file.mimetype.startsWith('audio/x-wav') ? 'wav'
    : file.mimetype.startsWith('audio/mp4')  ? 'm4a'
    : 'mp3';
  const rel = path.join(SALES_AUDIO_DIR, `${existing.id}-${randomUUID()}.${ext}`);
  await storage.saveBuffer(rel, file.buffer);

  // Optimistic update: mark as processing.
  await prisma.salesSession.update({
    where: { id: existing.id },
    data: { audioStoragePath: rel },
  });

  // Run clean transcription. Synchronous on the request to keep MVP simple.
  // For 2-min audio, gpt-4o-transcribe latency is typically 5-15 sec —
  // acceptable for finalize flow. Future: queue + webhook if grows.
  const result = await runCleanTranscription({
    buffer: file.buffer,
    mimeType: file.mimetype,
    fileName: file.originalname || `${existing.id}.${ext}`,
  });
  await persistCleanTranscript(existing.id, result, rel);

  await recordAudit(req, {
    action: 'sales_session.audio_upload',
    targetType: 'SalesSession',
    targetId: existing.id,
    payload: {
      mime: file.mimetype,
      sizeBytes: file.size,
      status: result.status,
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
    },
  });

  console.log(
    `[sales-sessions/audio] session=${existing.id} ` +
    `status=${result.status} latencyMs=${result.latencyMs} ` +
    `provider=${result.provider ?? '-'} model=${result.model ?? '-'} ` +
    `audioBytes=${file.size}`,
  );

  res.status(200).json({
    status: result.status,
    audioStoragePath: rel,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  });
});

// Sprint 30 — soft-delete + audit. demoGuard на app level продолжает блокировать
// destructive ops в demo workspace.
salesSessionsRoutes.delete('/:id', async (req, res) => {
  const existing = await prisma.salesSession.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.archivedAt) return res.status(404).json({ error: 'not_found' });

  // Sprint 50 P0.3 — same single predicate as GET /:id. For archive we
  // currently use the read predicate (same rule); a write-specific
  // predicate can split out later when manager assignment lands.
  const allowed = await actorCanReadSalesSession(req, {
    projectId: existing.projectId,
    createdById: existing.createdById,
  });
  if (!allowed) return res.status(404).json({ error: 'not_found' });

  await prisma.salesSession.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } });
  await recordAudit(req, {
    action: 'sales_session.archive',
    targetType: 'SalesSession',
    targetId: existing.id,
    payload: { projectId: existing.projectId, investorName: existing.investorName },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});
