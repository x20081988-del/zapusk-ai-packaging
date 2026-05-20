import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { requireNotInvestor } from '../lib/ownership.js';
import { leadProvider, type ProjectForAILeads } from '../services/aiLeadsService.js';

export const aiLeadsRoutes = Router();
aiLeadsRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не имеет AI-leads (это founder-side инструмент).
aiLeadsRoutes.use(requireNotInvestor());

// Sprint 62.P1 demo hotfix — dedicated showcase endpoint for /demo/ai-leads.
// Sprint 35 правильно убрал доверие к ?demo=1 на основном /api/ai-leads/,
// потому что любой user мог одним GET'ом подмешать себе моков. Но
// /demo/ai-leads — это маркетинговая страница, она ВСЕГДА должна показывать
// синтетические demo-данные (Sprint 35 их санитизировал). Отдельный endpoint
// делает интент явным и не реактивирует ?demo=1-bypass.
//
// Никаких real-DB-данных не возвращает — это purely showcase, тот же
// mockLeads() что и в demo workspace.
aiLeadsRoutes.get('/showcase', async (_req, res) => {
  const dashboard = await leadProvider.getDashboard(null, { demoMode: true });
  res.json(dashboard);
});

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

  // Sprint 35 P0.2 — demo data разрешено ТОЛЬКО для demo workspace. Query
  // ?demo=1 больше не доверяем: иначе active user мог одним GET'ом включить
  // себе моковые лиды и принять их за реальные сигналы.
  // /demo/ai-leads — frontend-only showcase, серверу про него знать не нужно.
  const demoMode = user.workspaceStatus === 'demo';

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
