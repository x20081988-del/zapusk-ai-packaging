import { Router } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser, normalizeRole } from '../auth.js';
import { storage } from '../services/storage.js';
import { recordAudit } from '../lib/audit.js';
import { isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import { env } from '../env.js';
import { scheduleProjectFileIngest } from '../services/projectKnowledgeIngest.js';

export const projectsRoutes = Router();
projectsRoutes.use(authMiddleware);
// Sprint 62.P10 — INVESTOR теперь может ЧИТАТЬ проекты (GET / и GET /:id):
// демо-инвестор видит инвест-возможности (isDemo=true) на /opportunities.
// where-фильтр в GET сам отдаёт демо-инвестору только isDemo-витрину
// (workspaceStatus='demo' → { isDemo: true }), реальному инвестору — его
// собственные (пусто на MVP). Мутации (POST/PATCH/DELETE) по-прежнему
// закрыты requireNotInvestor() пер-роут — инвестор остаётся read-only.
// Sprint 37 P0.4: ранее requireNotInvestor висел на всём роутере и возвращал
// 403 даже на чтение — это и блокировало /opportunities.

// Sprint 21: формат привлечения инвестиций. nullable — пользователь может
// ещё не выбрать (по умолчанию TrackPicker предложит на главной странице
// проекта). 'packaging_only' = «только упаковка», без планов размещения —
// этапы привлечения скрываются.
const TRACK_VALUES = ['shareholding', 'llc_share', 'convertible', 'safe', 'pre_ipo', 'packaging_only'] as const;

const projectSchema = z.object({
  name: z.string().min(1),
  inn: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  legalStatus: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  raiseAmount: z.number().optional().nullable(),
  currency: z.string().optional(),
  minCheck: z.number().optional().nullable(),
  equityOffered: z.number().optional().nullable(),
  raiseDeadline: z.string().optional().nullable(),
  investorType: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  investmentTrack: z.enum(TRACK_VALUES).optional().nullable(),
});

projectsRoutes.get('/', async (req, res) => {
  const user = getUser(req) as { id: string; workspaceStatus?: string; role?: string };
  // Sprint 24 — разделение demo и active workspace'ов:
  //   • demo — видит только глобальные показательные проекты (isDemo=true)
  //   • active — видит только свои реальные проекты (own userId + isDemo=false)
  //   • admin/manager/super_admin — видят всё для аудита
  const isDemo = user.workspaceStatus === 'demo';
  // Sprint 37 P0.4 — было `user.role === 'admin'` (lowercase legacy). Это
  // не покрывало SUPER_ADMIN, MANAGER и не работало после нормализации в
  // 'ADMIN'. Теперь через isAdminLike(normalizeRole(...)) — единая точка
  // правды для admin-like прав.
  const isAdmin = isAdminLike(normalizeRole(user.role));
  // Sprint 30: filter out archived projects from regular GET. Admin restore
  // pulls via /api/admin/audit + /api/admin/restore.
  const where = isAdmin
    ? { archivedAt: null }
    : isDemo
      ? { isDemo: true, archivedAt: null }
      : { userId: user.id, isDemo: false, archivedAt: null };
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      files: { where: { archivedAt: null }, select: { id: true } },
      brief: { select: { version: true, updatedAt: true } },
      _count: { select: { generatedDocs: true, generatedPrompts: true } },
    },
  });
  const projectIds = projects.map((p) => p.id);
  const aiContextRows = projectIds.length
    ? await prisma.knowledgeSource.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
          uploadedFileId: { not: null },
          status: 'published',
          archivedAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const aiContextByProject = new Map<string, number>();
  for (const row of aiContextRows) {
    if (row.projectId) aiContextByProject.set(row.projectId, row._count._all);
  }
  res.json({
    projects: projects.map((p) => {
      const { _count, ...project } = p;
      return {
        ...project,
        sourceMaterialsCount: project.files.length,
        generatedMaterialsCount: _count.generatedDocs + _count.generatedPrompts,
        aiContextMaterialsCount: aiContextByProject.get(project.id) ?? 0,
      };
    }),
  });
});

// Sprint 62.P10 — публичная демо-витрина. Всегда отдаёт только isDemo=true
// проекты, независимо от роли/workspaceStatus зрителя. Используется
// «Демо-кабинетом» (/demo): так показательные кейсы видны и admin'у, и
// реальному фаундеру без утечки настоящих клиентских проектов в демо-UI.
// Read-only, поэтому requireNotInvestor не нужен. Объявлен ДО '/:id', иначе
// роут '/:id' перехватил бы 'showcase' как id.
projectsRoutes.get('/showcase', async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { isDemo: true, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      files: { where: { archivedAt: null }, select: { id: true } },
      brief: { select: { version: true, updatedAt: true } },
      _count: { select: { generatedDocs: true, generatedPrompts: true } },
    },
  });
  res.json({
    projects: projects.map((p) => {
      const { _count, ...project } = p;
      return {
        ...project,
        sourceMaterialsCount: project.files.length,
        generatedMaterialsCount: _count.generatedDocs + _count.generatedPrompts,
        aiContextMaterialsCount: 0,
      };
    }),
  });
});

projectsRoutes.post('/', requireNotInvestor(), async (req, res) => {
  const user = getUser(req);
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: d.name,
      inn: d.inn ?? null,
      website: d.website ?? null,
      industry: d.industry ?? null,
      legalStatus: d.legalStatus ?? null,
      stage: d.stage ?? null,
      raiseAmount: d.raiseAmount ?? null,
      currency: d.currency ?? 'RUB',
      minCheck: d.minCheck ?? null,
      equityOffered: d.equityOffered ?? null,
      raiseDeadline: d.raiseDeadline ? new Date(d.raiseDeadline) : null,
      investorType: d.investorType ?? null,
      investmentTrack: d.investmentTrack ?? null,
    },
  });
  if (d.description?.trim()) {
    const body = d.description.trim();
    const diskName = `${randomUUID()}.txt`;
    const rel = path.join(project.id, diskName);
    const buffer = Buffer.from(body, 'utf8');
    await storage.saveBuffer(rel, buffer);
    const row = await prisma.uploadedFile.create({
      data: {
        projectId: project.id,
        filename: diskName,
        originalName: 'Контекст проекта.txt',
        mimeType: 'text/plain',
        size: buffer.byteLength,
        category: 'description',
        path: rel,
      },
    });
    if (env.PROJECT_KB_AUTO_INGEST_ENABLED) {
      scheduleProjectFileIngest(row.id, project.id, {
        environment: workspaceToKnowledgeEnv(user.workspaceStatus ?? null),
        createdById: user.id,
      });
    }
  }
  res.status(201).json({ project });
});

projectsRoutes.get('/:id', async (req, res) => {
  const user = getUser(req) as { id: string; workspaceStatus?: string; role?: string };
  const isDemo = user.workspaceStatus === 'demo';
  // Sprint 37 P0.4 — было `user.role === 'admin'` (lowercase legacy). Заменили
  // на isAdminLike(normalizeRole(...)) — теперь SUPER_ADMIN/ADMIN/MANAGER все
  // получают админ-доступ к чужим проектам.
  const isAdmin = isAdminLike(normalizeRole(user.role));

  // Sprint 24: demo users могут читать только isDemo проекты, active — только
  // свои own. Admin видит всё.
  // Sprint 30: архивные проекты скрыты от GET. Restore — через admin endpoint.
  const where = isAdmin
    ? { id: req.params.id, archivedAt: null }
    : isDemo
      ? { id: req.params.id, isDemo: true, archivedAt: null }
      : { id: req.params.id, userId: user.id, archivedAt: null };

  const project = await prisma.project.findFirst({
    where,
    include: {
      files: { where: { archivedAt: null } },
      brief: true,
      investorTerms: true,
      generatedPrompts: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      generatedDocs: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      referenceMats: true,
    },
  });
  if (!project) return res.status(404).json({ error: 'not_found' });

  // Sprint 37 P0.3 — audit «admin посмотрел чужой проект». Это самый
  // чувствительный read-сценарий: владелец платформы / менеджер открыл
  // карточку клиента (включая бриф, файлы, генерации). Для owner-самого-себя
  // НЕ логируем — иначе таблица за неделю взорвётся от штатных просмотров.
  if (isAdmin && project.userId !== user.id) {
    await recordAudit(req, {
      action: 'project.read_sensitive',
      targetType: 'Project',
      targetId: project.id,
      payload: {
        projectName: project.name,
        ownerUserId: project.userId,
        isDemo: project.isDemo,
      },
    });
  }

  res.json({ project });
});

projectsRoutes.patch('/:id', requireNotInvestor(), async (req, res) => {
  const user = getUser(req);
  const owned = await prisma.project.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!owned) return res.status(404).json({ error: 'not_found' });
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const updated = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...d,
      raiseDeadline: d.raiseDeadline ? new Date(d.raiseDeadline) : undefined,
    },
  });
  res.json({ project: updated });
});

// Sprint 30 — soft-delete. Проект помечается archivedAt вместо физического
// удаления. Admin может восстановить через POST /api/admin/restore/project/:id.
// Через 30 дней (ARCHIVE_RETENTION_DAYS) cleanup job сделает физический delete
// (cleanup пока не реализован — out of scope).
projectsRoutes.delete('/:id', requireNotInvestor(), async (req, res) => {
  const user = getUser(req);
  const owned = await prisma.project.findFirst({
    where: { id: req.params.id, userId: user.id, archivedAt: null },
  });
  if (!owned) return res.status(404).json({ error: 'not_found' });
  await prisma.project.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  await recordAudit(req, {
    action: 'project.archive',
    targetType: 'Project',
    targetId: owned.id,
    payload: { name: owned.name, userId: owned.userId, isDemo: owned.isDemo },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});

function workspaceToKnowledgeEnv(status: string | null): 'production' | 'demo' | 'synthetic' {
  if (status === 'demo') return 'demo';
  if (status === 'synthetic') return 'synthetic';
  return 'production';
}
