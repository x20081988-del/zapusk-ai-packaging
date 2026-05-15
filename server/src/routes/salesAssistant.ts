import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth.js';
import { assertProjectOwnership, getActorRole, requireNotInvestor } from '../lib/ownership.js';
import { analyzeSalesTurn, analyzeSalesTurnFast } from '../services/salesAssistantService.js';

export const salesAssistantRoutes = Router();
salesAssistantRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не использует sales co-pilot.
salesAssistantRoutes.use(requireNotInvestor());

const analyzeSchema = z.object({
  transcript: z.string().trim().min(1).max(32_000),
  recent: z.string().max(16_000).optional().nullable(),
  recentContext: z.string().max(16_000).optional().nullable(),
  previousAdvice: z.unknown().optional().nullable(),
  previousSpinStage: z.enum(['S', 'P', 'I', 'N']).optional().nullable(),
  adviceHistory: z.array(z.unknown()).max(12).optional().nullable(),
  projectId: z.string().optional().nullable(),
});

salesAssistantRoutes.post('/analyze', async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Sprint 36 P0.2 — если фронт передал projectId, проверяем владение. Иначе
  // user A мог подставить projectId user B и получить AI-подсказку, построенную
  // на чужом brief'е (utвечка контента). Если projectId не задан — анализ без
  // project-context, это разрешено.
  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  try {
    const card = await analyzeSalesTurn({
      transcript: parsed.data.transcript.trim(),
      recentContext: parsed.data.recentContext ?? parsed.data.recent ?? undefined,
      previousAdvice: parsed.data.previousAdvice ?? undefined,
      previousSpinStage: parsed.data.previousSpinStage ?? undefined,
      adviceHistory: parsed.data.adviceHistory ?? undefined,
      projectId: parsed.data.projectId ?? null,
      // Sprint 38 — роль нужна для KB retrieval (visibility + raw vs redacted).
      actorRole: getActorRole(req),
    });
    res.json({ card });
  } catch (err) {
    console.error('[sales-assistant]', err);
    res.status(500).json({ error: 'analyze_failed' });
  }
});

// Sprint 34В — двухэтапная генерация. Этап 1: ultra-fast tactical reply
// для живой встречи (1-3 секунды). UI должен звать сначала /analyze-fast,
// рендерить главный вопрос/backup/self-sale, потом догнать через /analyze
// для полной аналитики.
salesAssistantRoutes.post('/analyze-fast', async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Sprint 36 P0.2 — те же ownership-правила, что и на /analyze.
  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  try {
    const fast = await analyzeSalesTurnFast({
      transcript: parsed.data.transcript.trim(),
      recentContext: parsed.data.recentContext ?? parsed.data.recent ?? undefined,
      previousAdvice: parsed.data.previousAdvice ?? undefined,
      previousSpinStage: parsed.data.previousSpinStage ?? undefined,
      adviceHistory: parsed.data.adviceHistory ?? undefined,
      projectId: parsed.data.projectId ?? null,
      // Sprint 38 — то же что и в /analyze.
      actorRole: getActorRole(req),
    });
    res.json({ fast });
  } catch (err) {
    console.error('[sales-assistant:fast]', err);
    res.status(500).json({ error: 'analyze_fast_failed' });
  }
});
