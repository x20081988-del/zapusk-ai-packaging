import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { leadProvider, type ProjectForAILeads } from '../services/aiLeadsService.js';

export const aiLeadsRoutes = Router();
aiLeadsRoutes.use(authMiddleware);

aiLeadsRoutes.get('/', async (req, res) => {
  const user = getUser(req);
  const projectId = typeof req.query.projectId === 'string' && req.query.projectId.trim()
    ? req.query.projectId.trim()
    : null;

  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
        include: { files: { select: { id: true, category: true } }, brief: true },
      })
    : await prisma.project.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        include: { files: { select: { id: true, category: true } }, brief: true },
      });

  if (projectId && !project) return res.status(404).json({ error: 'project_not_found' });

  // Sprint 27 — mock-лиды показываем ТОЛЬКО для demo workspace или явного
  // showcase-запроса (?demo=1 на странице /demo/ai-leads). Активный кабинет
  // получает empty state, без фиктивных «43 звонка сегодня».
  const demoQueryFlag = req.query.demo === '1' || req.query.demo === 'true';
  const demoMode = demoQueryFlag || user.workspaceStatus === 'demo';

  const dashboard = await leadProvider.getDashboard(
    project ? toAILeadProject(project) : null,
    { demoMode },
  );
  res.json(dashboard);
});

type ProjectWithAILeadContext = Prisma.ProjectGetPayload<{
  include: { files: { select: { id: true; category: true } }; brief: true };
}>;

function toAILeadProject(project: ProjectWithAILeadContext): ProjectForAILeads {
  return {
    id: project.id,
    name: project.name,
    industry: project.industry,
    stage: project.stage,
    raiseAmount: project.raiseAmount,
    minCheck: project.minCheck,
    equityOffered: project.equityOffered,
    files: (project.files ?? []).map((f) => ({ id: f.id, category: f.category })),
    brief: project.brief
      ? {
          version: project.brief.version,
          businessSummary: project.brief.businessSummary,
          monetization: project.brief.monetization,
          keyMetrics: project.brief.keyMetrics,
          investmentAsk: project.brief.investmentAsk,
          missingData: project.brief.missingData,
          missingByCategory: project.brief.missingByCategory,
          napkin: project.brief.napkin,
        }
      : null,
  };
}
