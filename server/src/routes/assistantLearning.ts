import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../auth.js';
import { requireNotInvestor } from '../lib/ownership.js';
import {
  buildDashboardPayload,
  topPerformingSources,
  weakSources,
  spinFunnel,
  outcomeDistribution,
  type OutcomeType,
} from '../services/assistantLearningService.js';

// Sprint 44 — Learning Dashboard routes.
//
// SECURITY:
//   • INVESTOR — entirely blocked (requireNotInvestor).
//   • FOUNDER — blocked, потому что это GLOBAL aggregate analytics по всем
//     проектам. Founder видит свои outcomes отдельно через /api/assistant-outcomes
//     (Sprint 43, projectId-фильтр).
//   • MANAGER + ADMIN + SUPER_ADMIN — допускаются.
//
// Audit: пока не пишем — read-only analytics aggregate. Если будут жалобы на
// privacy violations, можно добавить лёгкий лог 'learning.dashboard.read'.

export const assistantLearningRoutes = Router();
assistantLearningRoutes.use(authMiddleware);
assistantLearningRoutes.use(requireNotInvestor());
// MANAGER / ADMIN / SUPER_ADMIN. FOUNDER не имеет доступа к global aggregates.
assistantLearningRoutes.use(requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']));

// GET /api/assistant-learning/dashboard
// Composite payload — всё что нужно для главной страницы дашборда одним запросом.
assistantLearningRoutes.get('/dashboard', async (_req, res) => {
  try {
    const payload = await buildDashboardPayload();
    res.json(payload);
  } catch (err) {
    console.error('[assistant-learning:dashboard]', err);
    res.status(500).json({ error: 'dashboard_failed' });
  }
});

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

// GET /api/assistant-learning/top-sources?outcomeTypes=...&limit=10
// Параметр outcomeTypes — comma-separated whitelist; пусто → дефолтный
// «позитивный» набор.
assistantLearningRoutes.get('/top-sources', async (req, res) => {
  const limitRaw = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;
  const ofRaw = typeof req.query.outcomeTypes === 'string' ? req.query.outcomeTypes : '';
  const parsed = ofRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => (OUTCOME_TYPES as readonly string[]).includes(s)) as OutcomeType[];
  const types: OutcomeType[] = parsed.length
    ? parsed
    : ['investment_received', 'next_meeting_booked', 'investor_interested'];
  try {
    const sources = await topPerformingSources(types, limit);
    res.json({ sources, params: { limit, outcomeTypes: types } });
  } catch (err) {
    console.error('[assistant-learning:top-sources]', err);
    res.status(500).json({ error: 'top_sources_failed' });
  }
});

// GET /api/assistant-learning/outcomes?sinceDays=30
// Distribution по outcomeType. sinceDays необязательный — без него весь период.
const outcomesQuerySchema = z.object({
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
});

assistantLearningRoutes.get('/outcomes', async (req, res) => {
  const parsed = outcomesQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const dist = await outcomeDistribution(parsed.data.sinceDays);
    res.json(dist);
  } catch (err) {
    console.error('[assistant-learning:outcomes]', err);
    res.status(500).json({ error: 'outcomes_failed' });
  }
});

// GET /api/assistant-learning/spin-funnel
assistantLearningRoutes.get('/spin-funnel', async (_req, res) => {
  try {
    const funnel = await spinFunnel();
    res.json({ funnel });
  } catch (err) {
    console.error('[assistant-learning:spin-funnel]', err);
    res.status(500).json({ error: 'spin_funnel_failed' });
  }
});

// GET /api/assistant-learning/weak-sources?limit=10
// Sprint 44 — отдельный endpoint для «риск-материалов»; UI рендерит их
// в отдельной секции с другим tone, поэтому удобно держать как отдельный ручник.
assistantLearningRoutes.get('/weak-sources', async (req, res) => {
  const limitRaw = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;
  try {
    const sources = await weakSources(limit);
    res.json({ sources });
  } catch (err) {
    console.error('[assistant-learning:weak-sources]', err);
    res.status(500).json({ error: 'weak_sources_failed' });
  }
});
