import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth.js';
import { analyzeSalesTurn } from '../services/salesAssistantService.js';

export const salesAssistantRoutes = Router();
salesAssistantRoutes.use(authMiddleware);

const analyzeSchema = z.object({
  transcript: z.string().trim().min(1).max(8_000),
  recent: z.string().max(16_000).optional().nullable(),
  projectId: z.string().optional().nullable(),
});

salesAssistantRoutes.post('/analyze', async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const card = await analyzeSalesTurn({
      transcript: parsed.data.transcript.trim(),
      recent: parsed.data.recent ?? undefined,
      projectId: parsed.data.projectId ?? null,
    });
    res.json({ card });
  } catch (err) {
    console.error('[sales-assistant]', err);
    res.status(500).json({ error: 'analyze_failed' });
  }
});
