import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const templatesRoutes = Router();
templatesRoutes.use(authMiddleware);
templatesRoutes.use(requireRole(['admin']));

templatesRoutes.get('/', async (_req, res) => {
  const templates = await prisma.promptTemplate.findMany({ orderBy: { category: 'asc' } });
  res.json({ templates });
});

// Sprint 15: registry endpoint — фронт получает каноничные provider/tool/
// outputType списки одним вызовом, чтобы строить селекты и бейджи.
templatesRoutes.get('/orchestration/registry', async (_req, res) => {
  const { PROVIDERS, TOOLS, OUTPUT_TYPES, TEMPLATE_ORCHESTRATION } = await import('../services/aiProviders.js');
  res.json({
    providers: Object.values(PROVIDERS),
    tools: Object.values(TOOLS),
    outputTypes: Object.values(OUTPUT_TYPES),
    defaults: TEMPLATE_ORCHESTRATION,
  });
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
  // Sprint 15: orchestration metadata — optional, чтобы старые скрипты не
  // ломались. Семантическая валидация enum'ов сделана в registry (см.
  // services/aiProviders.ts), здесь оставляем мягкий string-приём, чтобы
  // админ мог регистрировать новые провайдеры на лету.
  provider: z.string().trim().min(1).optional().nullable(),
  tool: z.string().trim().min(1).optional().nullable(),
  model: z.string().trim().min(1).optional().nullable(),
  outputType: z.string().trim().min(1).optional().nullable(),
});

templatesRoutes.post('/', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const template = await prisma.promptTemplate.create({
      data: {
        key: parsed.data.key,
        name: parsed.data.name,
        category: parsed.data.category,
        body: parsed.data.body,
        description: parsed.data.description?.trim() || null,
        active: parsed.data.active ?? true,
        provider: parsed.data.provider?.trim() || null,
        tool: parsed.data.tool?.trim() || null,
        model: parsed.data.model?.trim() || null,
        outputType: parsed.data.outputType?.trim() || null,
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
  // Sprint 15: orchestration fields — admin может править провайдера/инструмент
  // прямо из Templates UI. Передача null очистит поле (если кто-то решит
  // вернуть template в «default-orchestration» режим).
  provider: z.string().trim().min(1).nullable().optional(),
  tool: z.string().trim().min(1).nullable().optional(),
  model: z.string().trim().min(1).nullable().optional(),
  outputType: z.string().trim().min(1).nullable().optional(),
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
