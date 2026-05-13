import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

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

  res.json({
    kpis: {
      myProjects: projects.length,
      stuckProjects: tasks.filter((t) => t.priority !== 'low').length,
      newLeads: 7,
      openQuestions: projects.filter((p) => Boolean(p.brief?.missingByCategory || p.brief?.missingData)).length,
      inactiveProjects: projects.filter((p) => now - p.updatedAt.getTime() > staleMs).length,
    },
    projects,
    tasks,
  });
});
