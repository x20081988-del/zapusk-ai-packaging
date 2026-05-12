import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth.js';

export const templatesRoutes = Router();
templatesRoutes.use(authMiddleware);

templatesRoutes.get('/', async (_req, res) => {
  const templates = await prisma.promptTemplate.findMany({ orderBy: { category: 'asc' } });
  res.json({ templates });
});

templatesRoutes.get('/financial-models/list', async (_req, res) => {
  const models = await prisma.financialModelTemplate.findMany();
  res.json({ models });
});

const templateSchema = z.object({
  key: z.string().trim().min(1).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, digits, _ or -'),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  description: z.string().optional(),
  body: z.string().trim().min(1),
  active: z.boolean().optional(),
});

templatesRoutes.post('/', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const template = await prisma.promptTemplate.create({
      data: {
        ...parsed.data,
        description: parsed.data.description?.trim() || null,
        active: parsed.data.active ?? true,
      },
    });
    res.status(201).json({ template });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'template_key_exists' });
    }
    throw err;
  }
});

templatesRoutes.get('/:id', async (req, res) => {
  const t = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json({ template: t });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  body: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

templatesRoutes.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const data = {
    ...parsed.data,
    ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
  };
  const t = await prisma.promptTemplate.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ template: t });
});

templatesRoutes.delete('/:id', async (req, res) => {
  const existing = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.promptTemplate.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
