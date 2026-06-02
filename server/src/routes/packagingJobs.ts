import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth.js';
import { assertCanReadProject } from '../lib/ownership.js';

// Sprint 15: история job'ов AI orchestrator'а. Каждый ход pipeline
// (generatePrompt / generate-full-packaging) пишет сюда строку с
// провайдером + инструментом + ссылкой на сам артефакт. Из этого собирается
// «AI generated materials» history в Project Cockpit.
//
// Non-goals: тут нет запуска новых job'ов наружу (это делает /api/prompts).
// Только read-only история и одна служебная очистка для admin.

export const packagingJobsRoutes = Router();
packagingJobsRoutes.use(authMiddleware);
// Sprint 62.P11 — снят router-level requireNotInvestor: эти роуты read-only
// (история материалов), а demo-investor должен видеть материалы isDemo-проектов
// в /opportunities. Demo-aware доступ инкапсулирован в assertCanReadProject:
// admin-like → всё, owner → свои, demo-viewer → только isDemo. Запуск новых
// job'ов идёт через /api/prompts (там requireNotInvestor сохранён).

packagingJobsRoutes.get('/project/:projectId', async (req, res) => {
  const access = await assertCanReadProject(req, req.params.projectId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const jobs = await prisma.packagingJob.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ jobs });
});

packagingJobsRoutes.get('/:id', async (req, res) => {
  const job = await prisma.packagingJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not_found' });
  const access = await assertCanReadProject(req, job.projectId);
  if (!access.ok) return res.status(404).json({ error: 'not_found' });
  res.json({ job });
});
