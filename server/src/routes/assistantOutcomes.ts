import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import {
  assertProjectOwnership,
  getActorRole,
  isAdminLike,
  requireNotInvestor,
} from '../lib/ownership.js';

// Sprint 43 P0.5 — AssistantOutcomeEvent CRUD.
//
// POST /api/assistant-outcomes — manager/founder фиксирует, что произошло после
// AI-подсказки (отправил follow-up, инвестор согласился, потеряли).
// GET  /api/assistant-outcomes — список outcomes (фильтр по projectId).
// PATCH /api/assistant-outcomes/:id — правка user-facing metadata outcome.
// DELETE /api/assistant-outcomes/:id — soft-delete через archivedAt.
//
// SECURITY:
//   • INVESTOR заблокирован глобально (requireNotInvestor).
//   • FOUNDER может писать только outcomes для своих проектов / своих advice
//     events / своих sales sessions. Cross-tenant attempts → 404.
//   • Audit пишется с metadata (outcomeType + projectId), но НЕ note —
//     note может содержать персональные данные.

export const assistantOutcomesRoutes = Router();
assistantOutcomesRoutes.use(authMiddleware);
assistantOutcomesRoutes.use(requireNotInvestor());

// Whitelist outcome types — должны совпадать со спекой Sprint 43.
const OUTCOME_TYPES = [
  'follow_up_sent',
  'next_meeting_booked',
  'investor_requested_docs',
  'investor_interested',
  'investment_received',
  'lost',
  'ghosted',
  'no_decision',
  'bad_fit',
] as const;

const createOutcomeSchema = z.object({
  adviceEventId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  salesSessionId: z.string().optional().nullable(),
  conversationAnalysisId: z.string().optional().nullable(),
  investorName: z.string().trim().max(200).optional().nullable(),
  outcomeType: z.enum(OUTCOME_TYPES),
  valueRub: z.number().min(0).max(1_000_000_000).optional().nullable(),
  probabilityAfter: z.number().int().min(0).max(100).optional().nullable(),
  // Sprint 43 P0.security — note ограничен по длине. Audit его не пишет.
  note: z.string().trim().max(2_000).optional().nullable(),
}).refine(
  (d) => Boolean(d.projectId || d.salesSessionId || d.conversationAnalysisId || d.adviceEventId),
  { message: 'at_least_one_of_projectId_salesSessionId_conversationAnalysisId_adviceEventId' },
);

const updateOutcomeSchema = z.object({
  investorName: z.string().trim().max(200).optional().nullable(),
  outcomeType: z.enum(OUTCOME_TYPES).optional(),
  valueRub: z.number().min(0).max(1_000_000_000).optional().nullable(),
  probabilityAfter: z.number().int().min(0).max(100).optional().nullable(),
  note: z.string().trim().max(2_000).optional().nullable(),
}).refine((d) => Object.keys(d).length > 0, { message: 'no_fields_to_update' });

type OutcomeRecord = Awaited<ReturnType<typeof prisma.assistantOutcomeEvent.findUnique>>;

async function assertOutcomeAccess(
  req: Parameters<typeof getUser>[0],
  outcomeId: string,
): Promise<{ ok: true; outcome: NonNullable<OutcomeRecord> } | { ok: false; status: number; error: string }> {
  const outcome = await prisma.assistantOutcomeEvent.findUnique({ where: { id: outcomeId } });
  if (!outcome || outcome.archivedAt) return { ok: false, status: 404, error: 'outcome_not_found' };

  const role = getActorRole(req);
  if (isAdminLike(role)) return { ok: true, outcome };

  const user = getUser(req);
  if (outcome.projectId) {
    const ok = await assertProjectOwnership(req, outcome.projectId);
    if (ok.ok) return { ok: true, outcome };
    return { ok: false, status: 404, error: 'outcome_not_found' };
  }

  if (outcome.salesSessionId) {
    const s = await prisma.salesSession.findUnique({
      where: { id: outcome.salesSessionId },
      select: { projectId: true },
    });
    if (s?.projectId) {
      const p = await prisma.project.findUnique({ where: { id: s.projectId }, select: { userId: true } });
      if (p?.userId === user.id) return { ok: true, outcome };
    }
    return { ok: false, status: 404, error: 'outcome_not_found' };
  }

  if (outcome.conversationAnalysisId) {
    const c = await prisma.conversationAnalysis.findUnique({
      where: { id: outcome.conversationAnalysisId },
      select: { projectId: true },
    });
    if (c?.projectId) {
      const p = await prisma.project.findUnique({ where: { id: c.projectId }, select: { userId: true } });
      if (p?.userId === user.id) return { ok: true, outcome };
    }
    return { ok: false, status: 404, error: 'outcome_not_found' };
  }

  if (outcome.adviceEventId) {
    const ev = await prisma.assistantAdviceEvent.findUnique({
      where: { id: outcome.adviceEventId },
      select: { actorId: true, projectId: true },
    });
    if (ev?.actorId === user.id) return { ok: true, outcome };
    if (ev?.projectId) {
      const ok = await assertProjectOwnership(req, ev.projectId);
      if (ok.ok) return { ok: true, outcome };
    }
    return { ok: false, status: 404, error: 'outcome_not_found' };
  }

  if (outcome.createdById === user.id) return { ok: true, outcome };
  return { ok: false, status: 404, error: 'outcome_not_found' };
}

assistantOutcomesRoutes.post('/', async (req, res) => {
  const parsed = createOutcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // Ownership: для founder проверяем доступ к каждому FK. Admin/manager — пропуск.
  const role = getActorRole(req);
  const user = getUser(req);
  if (!isAdminLike(role)) {
    if (d.projectId) {
      const ok = await assertProjectOwnership(req, d.projectId);
      if (!ok.ok) return res.status(ok.status).json({ error: ok.error });
    }
    if (d.adviceEventId) {
      const ev = await prisma.assistantAdviceEvent.findUnique({
        where: { id: d.adviceEventId },
        select: { id: true, actorId: true, projectId: true },
      });
      if (!ev) return res.status(404).json({ error: 'advice_event_not_found' });
      // Founder допускается, если он автор advice ИЛИ проект — его. Cross-tenant
      // → 404 чтобы не палить, что чужой advice существует.
      const isOwner = ev.actorId === user.id;
      let inOwnProject = false;
      if (ev.projectId) {
        const p = await prisma.project.findUnique({ where: { id: ev.projectId }, select: { userId: true } });
        inOwnProject = p?.userId === user.id;
      }
      if (!isOwner && !inOwnProject) return res.status(404).json({ error: 'advice_event_not_found' });
    }
    if (d.salesSessionId) {
      const s = await prisma.salesSession.findUnique({
        where: { id: d.salesSessionId },
        select: { id: true, projectId: true, createdById: true },
      });
      if (!s) return res.status(404).json({ error: 'session_not_found' });
      // Sprint 49 hotfix 11 — orphan session is allowed when the creator
      // matches the actor (Sprint 49 hotfix 10 added createdById). Otherwise
      // fall back to the old project-ownership check. Cross-tenant → 404
      // to avoid leaking session existence.
      if (s.createdById !== user.id) {
        if (!s.projectId) return res.status(404).json({ error: 'session_not_found' });
        const p = await prisma.project.findUnique({ where: { id: s.projectId }, select: { userId: true } });
        if (p?.userId !== user.id) return res.status(404).json({ error: 'session_not_found' });
      }
    }
    if (d.conversationAnalysisId) {
      const c = await prisma.conversationAnalysis.findUnique({
        where: { id: d.conversationAnalysisId },
        select: { id: true, projectId: true },
      });
      if (!c) return res.status(404).json({ error: 'analysis_not_found' });
      if (c.projectId) {
        const p = await prisma.project.findUnique({ where: { id: c.projectId }, select: { userId: true } });
        if (p?.userId !== user.id) return res.status(404).json({ error: 'analysis_not_found' });
      } else {
        return res.status(404).json({ error: 'analysis_not_found' });
      }
    }
  }

  try {
    const outcome = await prisma.assistantOutcomeEvent.create({
      data: {
        adviceEventId: d.adviceEventId ?? null,
        projectId: d.projectId ?? null,
        salesSessionId: d.salesSessionId ?? null,
        conversationAnalysisId: d.conversationAnalysisId ?? null,
        investorName: d.investorName ?? null,
        outcomeType: d.outcomeType,
        valueRub: typeof d.valueRub === 'number' ? d.valueRub : null,
        probabilityAfter: typeof d.probabilityAfter === 'number' ? d.probabilityAfter : null,
        note: d.note ?? null,
        createdById: user.id,
      },
    });

    // Sprint 43 security: audit metadata only — НЕ пишем note, валидные ПД могут
    // быть внутри.
    await recordAudit(req, {
      action: 'assistant_outcome.create',
      targetType: 'AssistantOutcomeEvent',
      targetId: outcome.id,
      payload: {
        outcomeType: d.outcomeType,
        projectId: d.projectId ?? null,
        adviceEventId: d.adviceEventId ?? null,
        salesSessionId: d.salesSessionId ?? null,
        hasNote: Boolean(d.note),
        valueRub: typeof d.valueRub === 'number' ? d.valueRub : null,
        probabilityAfter: typeof d.probabilityAfter === 'number' ? d.probabilityAfter : null,
      },
    });

    res.status(201).json({ outcome });
  } catch (err) {
    console.error('[assistant-outcomes:create]', err);
    res.status(500).json({ error: 'create_failed' });
  }
});

assistantOutcomesRoutes.get('/', async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const sessionId = typeof req.query.salesSessionId === 'string' ? req.query.salesSessionId : undefined;
  const sessionIds = typeof req.query.salesSessionIds === 'string'
    ? req.query.salesSessionIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100)
    : [];

  const role = getActorRole(req);
  const user = getUser(req);

  // Founder: only own outcomes (own projects). Admin/manager: всё.
  const where: { projectId?: string; salesSessionId?: string | { in: string[] }; archivedAt: null } = { archivedAt: null };
  if (projectId) where.projectId = projectId;
  if (sessionIds.length > 0) where.salesSessionId = { in: sessionIds };
  else if (sessionId) where.salesSessionId = sessionId;

  if (!isAdminLike(role)) {
    // Если projectId задан, проверим owner. Иначе ограничим списком своих
    // проектов через subquery — но это дороже; пока требуем явный projectId.
    if (projectId) {
      const ok = await assertProjectOwnership(req, projectId);
      if (!ok.ok) return res.status(ok.status).json({ error: ok.error });
    } else if (sessionId || sessionIds.length > 0) {
      // Sprint 49 hotfix 11 — orphan sessions are now founder-visible via
      // SalesSession.createdById (Sprint 49 hotfix 10 added that column).
      // Old logic blanket-rejected any session without projectId; that fired
      // 404 in the meetings list when a meeting was finalized without a
      // project. New rule per session:
      //   • projectId present + owned by user  → allow
      //   • createdById === user.id            → allow
      //   • everything else                    → drop silently (no leak).
      // Sessions that simply don't exist in the DB are also dropped — we
      // don't 404 the whole batch because one stale id lingered on the
      // client. The outcome query naturally returns [] for unknown sessions.
      const ids = sessionIds.length > 0 ? sessionIds : [sessionId!];
      const sessions = await prisma.salesSession.findMany({
        where: { id: { in: ids } },
        select: { id: true, projectId: true, createdById: true },
      });
      const ownedProjectIds = new Set(
        (await prisma.project.findMany({
          where: {
            id: { in: sessions.map((s) => s.projectId).filter((x): x is string => Boolean(x)) },
            userId: user.id,
          },
          select: { id: true },
        })).map((p) => p.id),
      );
      const allowedSessionIds = sessions
        .filter((s) => s.createdById === user.id || (s.projectId && ownedProjectIds.has(s.projectId)))
        .map((s) => s.id);
      // Tighten the WHERE to the subset the user is allowed to see; if none
      // of the requested ids are accessible, return [] so the meetings page
      // doesn't show a banner — the user simply has no outcomes for the
      // sessions they're looking at. Older behaviour returned 404 here.
      where.salesSessionId = { in: allowedSessionIds };
    } else {
      // founder без projectId — отдадим только outcomes им же созданные.
      // Это покрывает кейс «у меня есть проект, дай все мои outcomes» если фронт
      // забыл передать projectId.
      return res.json({
        outcomes: await prisma.assistantOutcomeEvent.findMany({
          where: { createdById: user.id, archivedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      });
    }
  }

  const outcomes = await prisma.assistantOutcomeEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ outcomes });
});

assistantOutcomesRoutes.patch('/:id', async (req, res) => {
  const parsed = updateOutcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const access = await assertOutcomeAccess(req, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const d = parsed.data;
  const outcome = await prisma.assistantOutcomeEvent.update({
    where: { id: access.outcome.id },
    data: {
      ...(Object.prototype.hasOwnProperty.call(d, 'investorName') ? { investorName: d.investorName ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(d, 'outcomeType') ? { outcomeType: d.outcomeType } : {}),
      ...(Object.prototype.hasOwnProperty.call(d, 'valueRub') ? { valueRub: d.valueRub ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(d, 'probabilityAfter') ? { probabilityAfter: d.probabilityAfter ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(d, 'note') ? { note: d.note ?? null } : {}),
    },
  });

  await recordAudit(req, {
    action: 'assistant_outcome.update',
    targetType: 'AssistantOutcomeEvent',
    targetId: outcome.id,
    payload: {
      projectId: outcome.projectId,
      outcomeType: outcome.outcomeType,
      previousOutcomeType: access.outcome.outcomeType,
      changedFields: Object.keys(d),
      hasNote: Boolean(outcome.note),
      valueRub: outcome.valueRub,
      probabilityAfter: outcome.probabilityAfter,
    },
  });

  res.json({ outcome });
});

assistantOutcomesRoutes.delete('/:id', async (req, res) => {
  const access = await assertOutcomeAccess(req, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const outcome = await prisma.assistantOutcomeEvent.update({
    where: { id: access.outcome.id },
    data: { archivedAt: new Date() },
  });

  await recordAudit(req, {
    action: 'assistant_outcome.archive',
    targetType: 'AssistantOutcomeEvent',
    targetId: outcome.id,
    payload: {
      projectId: outcome.projectId,
      outcomeType: outcome.outcomeType,
      adviceEventId: outcome.adviceEventId,
      salesSessionId: outcome.salesSessionId,
    },
  });

  res.json({ outcome });
});
