import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import {
  assertCanReadProject, requireNotInvestor, getActorRole, isAdminLike,
} from '../lib/ownership.js';

// Sprint 62.P11 — investor-facing crowdinvesting showcase.
// POST /api/investor-applications — заявка инвестора с публичной витрины
//   /opportunities. Доступно ВСЕМ авторизованным ролям, включая INVESTOR и
//   demo workspace (POST-путь добавлен в DEMO_INFERENCE_ALLOW). Заявка
//   привязывается к demo-проекту, который инвестор реально может прочитать
//   (assertCanReadProject), чтобы нельзя было подать заявку на чужой
//   приватный проект по угаданному id.
// GET /api/investor-applications — список заявок для команды (admin/manager)
//   и фаундера (только по своим проектам). INVESTOR отрезан requireNotInvestor.
export const investorApplicationsRoutes = Router();
investorApplicationsRoutes.use(authMiddleware);

const CHECK_RANGES = new Set(['500k_1m', '1m_3m', '3m_10m', '10m_plus']);
const INTERESTS = new Set(['materials', 'discuss', 'invest', 'compare']);

investorApplicationsRoutes.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  const checkRange = typeof body.checkRange === 'string' ? body.checkRange.trim() : '';
  const interest = typeof body.interest === 'string' ? body.interest.trim() : '';
  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;

  if (!projectId) return res.status(400).json({ error: 'project_required' });
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!contact) return res.status(400).json({ error: 'contact_required' });
  if (!CHECK_RANGES.has(checkRange)) return res.status(400).json({ error: 'invalid_check_range' });
  if (!INTERESTS.has(interest)) return res.status(400).json({ error: 'invalid_interest' });

  // Заявку можно подать только на проект, который заявитель реально видит
  // (demo-витрина / свой / admin). 404 без утечки факта существования.
  const access = await assertCanReadProject(req, projectId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const user = getUser(req) as { workspaceStatus?: string };
  const isDemo = user.workspaceStatus === 'demo';

  const application = await prisma.investorApplication.create({
    data: {
      projectId,
      name,
      contact,
      email,
      checkRange,
      interest,
      comment,
      source: 'opportunities',
      status: isDemo ? 'demo_new' : 'new',
      isDemo,
    },
    select: { id: true, status: true, createdAt: true },
  });

  // Sprint 62.P11 — демо-режим: НЕ шлём внешних уведомлений. Заявка просто
  // персистится и подмешивается в demo AI-leads витрину (/api/ai-leads/showcase).
  res.status(201).json({
    application,
    message: 'Заявка отправлена. Менеджер ZAPUSK AI свяжется с вами и предоставит доступ к материалам.',
  });
});

investorApplicationsRoutes.get('/', requireNotInvestor(), async (req, res) => {
  const role = getActorRole(req);
  if (isAdminLike(role)) {
    const applications = await prisma.investorApplication.findMany({
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    });
    return res.json({ applications });
  }

  // FOUNDER — только заявки по своим проектам.
  const user = getUser(req);
  const applications = await prisma.investorApplication.findMany({
    where: { project: { userId: user.id } },
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { id: true, name: true } } },
  });
  res.json({ applications });
});
