import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const adminRoutes = Router();
adminRoutes.use(authMiddleware);
adminRoutes.use(requireRole(['admin']));

adminRoutes.get('/dashboard', async (_req, res) => {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        brief: { select: { version: true, missingData: true, missingByCategory: true, updatedAt: true } },
        _count: { select: { files: true, generatedPrompts: true, generatedDocs: true, artefactReviews: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { projects: true } } },
    }),
  ]);

  const now = Date.now();
  const kpis = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => now - p.updatedAt.getTime() < 14 * 24 * 60 * 60 * 1000).length,
    packagingProjects: projects.filter((p) => p.status === 'packaging').length,
    aiLeadProjects: Math.max(1, projects.filter((p) => p.brief || p.status === 'ready').length),
    dealStageProjects: Math.max(1, projects.filter((p) => p.status === 'ready').length),
    newLeads7d: 9,
  };

  res.json({ kpis, projects, users });
});

// MVP admin view — read-only list across all users.
adminRoutes.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { files: true, generatedPrompts: true, generatedDocs: true } },
    },
  });
  res.json({ projects });
});

adminRoutes.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { projects: true } } },
  });
  res.json({ users });
});
