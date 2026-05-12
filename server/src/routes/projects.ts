import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';

export const projectsRoutes = Router();
projectsRoutes.use(authMiddleware);

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
});

projectsRoutes.get('/', async (req, res) => {
  const user = getUser(req);
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
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
    },
  });
  res.status(201).json({ project });
});

projectsRoutes.get('/:id', async (req, res) => {
  const user = getUser(req);
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: user.id },
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
