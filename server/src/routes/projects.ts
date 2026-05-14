import { Router } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { storage } from '../services/storage.js';

export const projectsRoutes = Router();
projectsRoutes.use(authMiddleware);

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
  //   • admin — видит всё для аудита
  const isDemo = user.workspaceStatus === 'demo';
  const isAdmin = user.role === 'admin';
  const where = isAdmin
    ? {}
    : isDemo
      ? { isDemo: true }
      : { userId: user.id, isDemo: false };
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { files: { select: { id: true } }, brief: { select: { version: true, updatedAt: true } } },
  });
  res.json({ projects });
});

projectsRoutes.post('/', async (req, res) => {
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
    await prisma.uploadedFile.create({
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
  }
  res.status(201).json({ project });
});

projectsRoutes.get('/:id', async (req, res) => {
  const user = getUser(req) as { id: string; workspaceStatus?: string; role?: string };
  const isDemo = user.workspaceStatus === 'demo';
  const isAdmin = user.role === 'admin';

  // Sprint 24: demo users могут читать только isDemo проекты, active — только
  // свои own. Admin видит всё.
  const where = isAdmin
    ? { id: req.params.id }
    : isDemo
      ? { id: req.params.id, isDemo: true }
      : { id: req.params.id, userId: user.id };

  const project = await prisma.project.findFirst({
    where,
    include: {
      files: true,
      brief: true,
      investorTerms: true,
      generatedPrompts: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      generatedDocs: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      referenceMats: true,
    },
  });
  if (!project) return res.status(404).json({ error: 'not_found' });
  res.json({ project });
});

projectsRoutes.patch('/:id', async (req, res) => {
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

projectsRoutes.delete('/:id', async (req, res) => {
  const user = getUser(req);
  const owned = await prisma.project.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!owned) return res.status(404).json({ error: 'not_found' });
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
