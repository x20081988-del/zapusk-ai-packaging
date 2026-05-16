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
  type CompleteSessionInput,
} from '../services/salesSessionService.js';

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
