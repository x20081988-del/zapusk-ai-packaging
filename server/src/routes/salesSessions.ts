import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { assertProjectOwnership, getActorRole, isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import { captureCandidateFromSalesSession } from '../services/knowledgeService.js';
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
});

// POST /api/sales-sessions/complete — analyze + persist in one call.
// The route returns both the structured summary and the persisted record so
// the frontend can show the summary modal immediately and link to the meeting.
salesSessionsRoutes.post('/complete', async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const input: CompleteSessionInput = parsed.data;

  // Sprint 35 P0.3 — founder может создать сессию только если projectId — его
  // проект. Admin/manager — допускаются без проверки, в т.ч. orphan'ы.
  const ownership = await assertProjectOwnership(req, input.projectId ?? null);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  try {
    const summary = await completeSession(input);
    const session = await persistSession(input, summary);

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

  // Sprint 35 P0.3 — founder может открыть запись только если она привязана к
  // его проекту. Orphan'ы (projectId=null) — admin-only. Возвращаем 404 чтобы
  // не палить факт существования чужой записи.
  const role = getActorRole(req);
  if (!isAdminLike(role)) {
    const ownership = await assertProjectOwnership(req, session.projectId ?? null);
    if (!ownership.ok) return res.status(404).json({ error: 'not_found' });
  }

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

  // Sprint 35 P0.3 — founder может архивировать только свою запись.
  const role = getActorRole(req);
  if (!isAdminLike(role)) {
    const ownership = await assertProjectOwnership(req, existing.projectId ?? null);
    if (!ownership.ok) return res.status(404).json({ error: 'not_found' });
  }

  await prisma.salesSession.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } });
  await recordAudit(req, {
    action: 'sales_session.archive',
    targetType: 'SalesSession',
    targetId: existing.id,
    payload: { projectId: existing.projectId, investorName: existing.investorName },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});
