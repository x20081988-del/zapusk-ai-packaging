import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import {
  filterAnsweredMissingByCategory,
  filterAnsweredMissingData,
  generateBrief,
  mergeInterviewAnswers,
  parseAnswers,
  regenerateBriefWithFeedback,
  serializeNapkinWithInterviewAnswers,
} from '../services/briefService.js';

export const briefRoutes = Router();
briefRoutes.use(authMiddleware);

async function assertOwnership(userId: string, projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, userId } }));
}

const answerSchema = z.object({
  question: z.string().min(1),
  answer: z.string(),
  category: z.string().optional(),
});
const interviewSchema = z.object({ answers: z.array(answerSchema) });
const briefFeedbackSchema = z.object({
  feedback: z.string().trim().min(1),
  focus: z.enum(['narrative', 'finance', 'risks', 'investor_offer', 'missing_data']).optional(),
});

briefRoutes.post('/:projectId/generate', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  try {
    const result = await generateBrief(req.params.projectId);
    res.json(result);
  } catch (err) {
    console.error('[brief]', err);
    res.status(500).json({ error: 'brief_generation_failed' });
  }
});

briefRoutes.get('/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const brief = await prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } });
  res.json({ brief });
});

briefRoutes.post('/:projectId/regenerate-with-feedback', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const parsed = briefFeedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await regenerateBriefWithFeedback(
      req.params.projectId,
      parsed.data.feedback,
      parsed.data.focus,
    );
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error && err.name === 'BriefNotGenerated') {
      return res.status(409).json({ error: 'brief_not_generated', message: 'Сначала сгенерируйте бриф.' });
    }
    console.error('[brief-feedback]', err);
    res.status(500).json({ error: 'brief_feedback_regeneration_failed' });
  }
});

// Save AI Interview answers onto the existing brief. We persist answers as a
// stable JSON array on ProjectBrief — they survive brief regenerations and feed
// promptBuilders + the next generateBrief() via the AI user prompt.
briefRoutes.patch('/:projectId/interview', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } });
  if (!existing) {
    return res.status(409).json({ error: 'brief_not_generated', message: 'Сгенерируйте бриф перед сохранением ответов интервью.' });
  }

  const previousAnswers = parseAnswers(existing.interviewAnswers);
  const savedAt = new Date().toISOString();
  const mergedAnswers = mergeInterviewAnswers(previousAnswers, parsed.data.answers, savedAt);
  const nextVersion = existing.version + 1;
  const nextNapkin = serializeNapkinWithInterviewAnswers(existing.napkin, mergedAnswers);

  const brief = await prisma.projectBrief.update({
    where: { projectId: req.params.projectId },
    data: {
      version: nextVersion,
      interviewAnswers: JSON.stringify(mergedAnswers),
      missingData: filterAnsweredMissingData(existing.missingData, mergedAnswers),
      missingByCategory: filterAnsweredMissingByCategory(existing.missingByCategory, mergedAnswers),
      napkin: nextNapkin,
    },
  });

  await prisma.generatedDocument.create({
    data: {
      projectId: req.params.projectId,
      kind: 'napkin',
      version: nextVersion,
      format: 'json',
      title: `Бизнес на салфетке v${nextVersion} · AI-интервью`,
      body: JSON.stringify(JSON.parse(nextNapkin), null, 2),
    },
  });
  res.json({ brief, savedCount: mergedAnswers.length });
});
