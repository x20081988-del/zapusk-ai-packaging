import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser, requireRole } from '../auth.js';

export const managerRoutes = Router();
managerRoutes.use(authMiddleware);
managerRoutes.use(requireRole(['manager', 'admin']));

managerRoutes.get('/dashboard', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      brief: { select: { missingData: true, missingByCategory: true, updatedAt: true } },
      _count: { select: { files: true, generatedPrompts: true, generatedDocs: true, artefactReviews: true } },
    },
    take: 24,
  });

  const staleMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const tasks = projects.flatMap((project) => {
    const items: Array<{ id: string; projectId: string; projectName: string; title: string; priority: 'high' | 'medium' | 'low'; owner: string }> = [];
    if (!project.brief) {
      items.push({
        id: `${project.id}-brief`,
        projectId: project.id,
        projectName: project.name,
        title: 'Помочь клиенту завершить бриф проекта',
        priority: 'high',
        owner: 'Менеджер',
      });
    }
    if (project._count.generatedPrompts < 3) {
      items.push({
        id: `${project.id}-materials`,
        projectId: project.id,
        projectName: project.name,
        title: 'Проверить, хватает ли материалов для упаковки',
        priority: 'medium',
        owner: 'Маркетолог',
      });
    }
    if (now - project.updatedAt.getTime() > staleMs) {
      items.push({
        id: `${project.id}-stale`,
        projectId: project.id,
        projectName: project.name,
        title: 'Связаться с клиентом: нет активности больше 7 дней',
        priority: 'medium',
        owner: 'Менеджер',
      });
    }
    return items;
  }).slice(0, 12);

  // Sprint 18: подмешиваем счётчик «Задач на упаковку» (awaiting_manager) в
  // KPI. Менеджер сразу видит, сколько артефактов ждут ручной сборки.
  const packagingTaskCount = await prisma.packagingJob.count({
    where: { status: 'awaiting_manager' },
  });

  res.json({
    kpis: {
      myProjects: projects.length,
      stuckProjects: tasks.filter((t) => t.priority !== 'low').length,
      newLeads: 7,
      openQuestions: projects.filter((p) => Boolean(p.brief?.missingByCategory || p.brief?.missingData)).length,
      inactiveProjects: projects.filter((p) => now - p.updatedAt.getTime() > staleMs).length,
      packagingTasks: packagingTaskCount,
    },
    projects,
    tasks,
  });
});

// ─── Sprint 18: Managed Packaging Flow ──────────────────────────────────────
// Менеджер видит все awaiting_manager job'ы, копирует prompt, делает работу во
// внешнем инструменте, вставляет результат обратно. Endpoint полностью внутри
// /api/manager — клиент его не видит (требует role=manager|admin).

managerRoutes.get('/packaging-tasks', async (req, res) => {
  const status = (req.query.status as string | undefined) ?? 'awaiting_manager';
  const jobs = await prisma.packagingJob.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      project: { select: { id: true, name: true, industry: true, user: { select: { email: true, name: true } } } },
    },
  });
  res.json({ jobs });
});

managerRoutes.get('/packaging-tasks/:id', async (req, res) => {
  const job = await prisma.packagingJob.findUnique({
    where: { id: req.params.id },
    include: {
      project: { select: { id: true, name: true, industry: true, user: { select: { email: true, name: true } } } },
    },
  });
  if (!job) return res.status(404).json({ error: 'not_found' });
  res.json({ job });
});

const completeSchema = z.object({
  resultUrl: z.string().trim().url().optional().nullable(),
  previewUrl: z.string().trim().url().optional().nullable(),
  managerComment: z.string().trim().max(2_000).optional().nullable(),
});

managerRoutes.post('/packaging-tasks/:id/complete', async (req, res) => {
  const user = getUser(req);
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const job = await prisma.packagingJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not_found' });
  // Не дадим случайно «закрыть» уже завершённую задачу: только awaiting_manager
  // (или failed — manager может «починить» проваленный auto-run).
  if (job.status !== 'awaiting_manager' && job.status !== 'failed') {
    return res.status(409).json({ error: 'invalid_state', currentStatus: job.status });
  }

  // resultPreview перезаписываем понятным client-facing текстом, который
  // увидит фаундер в «AI generated materials». Если менеджер написал comment
  // — используем его, иначе дефолтное «Готово».
  const clientPreview = (parsed.data.managerComment?.trim())
    || (parsed.data.previewUrl || parsed.data.resultUrl ? 'Материал готов. Откройте ссылку, чтобы посмотреть результат.' : 'Материал готов.');

  const updated = await prisma.packagingJob.update({
    where: { id: req.params.id },
    data: {
      status: 'succeeded',
      previewUrl: parsed.data.previewUrl ?? job.previewUrl,
      resultUrl: parsed.data.resultUrl ?? job.resultUrl,
      managerComment: parsed.data.managerComment ?? null,
      resultPreview: clientPreview,
      completedBy: user.email,
      completedAt: new Date(),
      // Очищаем technical errorCode/Message — задача закрыта, клиенту нечего
      // объяснять про прошлые сбои AI.
      errorCode: null,
      errorMessage: null,
    },
  });
  res.json({ job: updated });
});

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

managerRoutes.post('/packaging-tasks/:id/cancel', async (req, res) => {
  const user = getUser(req);
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const job = await prisma.packagingJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (job.status === 'succeeded') {
    return res.status(409).json({ error: 'already_completed' });
  }
  const updated = await prisma.packagingJob.update({
    where: { id: req.params.id },
    data: {
      status: 'failed',
      errorCode: 'manager_cancelled',
      errorMessage: parsed.data.reason ?? null,
      managerComment: parsed.data.reason ?? null,
      resultPreview: 'Задача отменена менеджером. Свяжитесь с командой ZAPUSK AI.',
      completedBy: user.email,
      completedAt: new Date(),
    },
  });
  res.json({ job: updated });
});
