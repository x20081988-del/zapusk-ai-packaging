import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser, requireRole } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import {
  assertNoPromptSecrets,
  checksumTemplate,
  createInitialPromptTemplateVersion,
  getPromptTemplateHistory,
  isPromptTemplateSecretError,
  updatePromptTemplateWithVersion,
} from '../services/promptTemplateVersioning.js';

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
  key: z.string().trim().min(1).regex(/^[a-z0-9_.-]+$/, 'Use lowercase letters, digits, ., _ or -'),
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
    assertNoPromptSecrets(parsed.data.body);
  } catch (err) {
    if (isPromptTemplateSecretError(err)) return res.status(400).json({ error: 'prompt_body_contains_secret_like_value' });
    throw err;
  }
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
        version: 1,
        checksum: checksumTemplate(parsed.data.body),
        changedById: getUser(req).id,
        publishedAt: new Date(),
      },
    });
    await createInitialPromptTemplateVersion(template.id, getUser(req).id);
    res.status(201).json({ template });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'template_key_exists' });
    }
    throw err;
  }
});

templatesRoutes.get('/:id/history', async (req, res) => {
  const history = await getPromptTemplateHistory(req.params.id);
  if (!history) return res.status(404).json({ error: 'not_found' });
  res.json(history);
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
  const data = {
    ...parsed.data,
    ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
  };
  try {
    const result = await updatePromptTemplateWithVersion(req.params.id, data, getUser(req).id);
    if (!result) return res.status(404).json({ error: 'not_found' });
    await recordAudit(req, {
      action: 'prompt_template.version_publish',
      targetType: 'PromptTemplate',
      targetId: result.template.id,
      payload: {
        key: result.template.key,
        version: result.template.version,
        previousVersionId: result.template.previousVersionId,
      },
    });
    res.json({ template: result.template, version: result.version });
  } catch (err) {
    if (isPromptTemplateSecretError(err)) return res.status(400).json({ error: 'prompt_body_contains_secret_like_value' });
    throw err;
  }
});

templatesRoutes.delete('/:id', async (req, res) => {
  const existing = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await prisma.promptTemplate.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
