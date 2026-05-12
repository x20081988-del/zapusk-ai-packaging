import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { generatePrompt, generateAllPrompts, ALL_PROMPT_KINDS, type PromptKind } from '../services/promptBuilders.js';
import { generateFullPackaging } from '../services/packageService.js';

export const promptsRoutes = Router();
promptsRoutes.use(authMiddleware);

promptsRoutes.post('/:projectId/generate-full-packaging', async (req, res) => {
  const user = getUser(req);
  const owned = await prisma.project.findFirst({ where: { id: req.params.projectId, userId: user.id } });
  if (!owned) return res.status(404).json({ error: 'project_not_found' });
  try {
    const result = await generateFullPackaging(req.params.projectId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[full-packaging]', err);
    res.status(500).json({ error: 'full_packaging_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
});

async function assertOwnership(userId: string, projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, userId } }));
}

promptsRoutes.get('/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const prompts = await prisma.generatedPrompt.findMany({
    where: { projectId: req.params.projectId },
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  });
  res.json({ prompts });
});

promptsRoutes.post('/:projectId/generate/:kind', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const kind = req.params.kind as PromptKind;
  if (!ALL_PROMPT_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'unknown_kind' });
  }
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : undefined;
  try {
    const prompt = await generatePrompt(req.params.projectId, kind, feedback);
    res.status(201).json({ prompt });
  } catch (err) {
    console.error('[prompts]', err);
    res.status(500).json({ error: 'prompt_generation_failed' });
  }
});

promptsRoutes.post('/:projectId/generate-all', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const results = await generateAllPrompts(req.params.projectId);
  res.status(201).json({ generated: results });
});
