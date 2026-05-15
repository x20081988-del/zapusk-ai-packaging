import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { requireNotInvestor } from '../lib/ownership.js';

// Sprint 15: история job'ов AI orchestrator'а. Каждый ход pipeline
// (generatePrompt / generate-full-packaging) пишет сюда строку с
// провайдером + инструментом + ссылкой на сам артефакт. Из этого собирается
// «AI generated materials» history в Project Cockpit.
//
// Non-goals: тут нет запуска новых job'ов наружу (это делает /api/prompts).
// Только read-only история и одна служебная очистка для admin.

export const packagingJobsRoutes = Router();
packagingJobsRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не работает с packaging-pipeline.
packagingJobsRoutes.use(requireNotInvestor());

async function assertOwnership(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  return Boolean(project);
}

packagingJobsRoutes.get('/project/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const jobs = await prisma.packagingJob.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ jobs });
});

packagingJobsRoutes.get('/:id', async (req, res) => {
  const user = getUser(req);
  const job = await prisma.packagingJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (!(await assertOwnership(user.id, job.projectId))) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ job });
});
