import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { authMiddleware, getUser, requireRole } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { storage } from '../services/storage.js';
import { env } from '../env.js';
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

// ─────────────────────────────────────────────────────────────
// Sprint 52 P0.1 — Template Context Attachments
// ─────────────────────────────────────────────────────────────
// Admin прикрепляет к prompt-шаблону файлы контекста (PDF / DOCX / TXT /
// MD / презентации / dataset'ы). MVP — metadata + storage; RAG / vector
// search накладываются сверху позже.
//
// Хранение: env.UPLOADS_DIR/template-attachments/<uuid><ext>. Доступ
// только через защищённый download endpoint (admin-only middleware
// продолжает действовать — он применён выше через templatesRoutes.use).
//
// Allowlist mime: pdf, docx, doc, txt, md, csv, xlsx, pptx, json, jpeg,
// png. Хочется быть строже чем «всё что угодно» — но шире чем project_file
// фильтр, потому что admin'у нужны разные training documents.
const TEMPLATE_ATTACHMENT_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const templateAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — больше project_file (50MB) уже перебор
  fileFilter: (_req, file, cb) => {
    if (!TEMPLATE_ATTACHMENT_ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('upload_rejected:mime_not_allowed'));
      return;
    }
    cb(null, true);
  },
});

function templateAttachmentUploadWithGuard(
  req: Parameters<typeof getUser>[0],
  res: { status: (code: number) => { json: (body: unknown) => void } },
  next: () => void,
): void {
  templateAttachmentUpload.single('file')(req as never, res as never, (err: unknown) => {
    if (!err) return next();
    if (err instanceof Error && err.message.startsWith('upload_rejected:')) {
      const reason = err.message.split(':')[1];
      res.status(400).json({ error: 'upload_rejected', reason });
      return;
    }
    if (err instanceof Error && /file too large/i.test(err.message)) {
      res.status(413).json({ error: 'file_too_large' });
      return;
    }
    res.status(400).json({ error: 'upload_failed', message: err instanceof Error ? err.message : 'unknown' });
  });
}

// GET /api/templates/:id/attachments — list (admin-only via router-level
// requireRole('admin') above).
templatesRoutes.get('/:id/attachments', async (req, res) => {
  const template = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'not_found' });
  const attachments = await prisma.templateAttachment.findMany({
    where: { templateId: req.params.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, originalName: true, mime: true, size: true, createdAt: true, uploadedById: true },
  });
  res.json({ attachments });
});

// POST /api/templates/:id/attachments — single-file upload via multipart.
templatesRoutes.post('/:id/attachments', templateAttachmentUploadWithGuard, async (req, res) => {
  const template = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'not_found' });
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: 'no_file' });
  const ext = path.extname(file.originalname).slice(0, 16) || '';
  const safeFilename = `${randomUUID()}${ext}`;
  const rel = path.join('template-attachments', safeFilename);
  await storage.saveBuffer(rel, file.buffer);
  const row = await prisma.templateAttachment.create({
    data: {
      templateId: req.params.id,
      filename: safeFilename,
      originalName: file.originalname,
      mime: file.mimetype,
      size: file.size,
      path: rel,
      uploadedById: getUser(req).id,
    },
    select: { id: true, originalName: true, mime: true, size: true, createdAt: true, uploadedById: true },
  });
  await recordAudit(req, {
    action: 'template_attachment.upload',
    targetType: 'TemplateAttachment',
    targetId: row.id,
    payload: {
      templateKey: template.key,
      originalName: row.originalName,
      mime: row.mime,
      size: row.size,
    },
  });
  res.status(201).json({ attachment: row });
});

// GET /api/templates/:id/attachments/:attId/download — same path-traversal
// guards as files.ts. Files at template-attachments/<uuid><ext>.
templatesRoutes.get('/:id/attachments/:attId/download', async (req, res) => {
  const att = await prisma.templateAttachment.findFirst({
    where: { id: req.params.attId, templateId: req.params.id },
  });
  if (!att) return res.status(404).json({ error: 'not_found' });
  const root = path.resolve(env.UPLOADS_DIR);
  const absolute = path.resolve(storage.resolvePath(att.path));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    console.error('[templates/attachment] download blocked — path traversal:', { id: att.id, path: att.path });
    return res.status(404).json({ error: 'not_found' });
  }
  if (!fs.existsSync(absolute)) {
    return res.status(404).json({ error: 'file_missing_on_disk' });
  }
  await recordAudit(req, {
    action: 'template_attachment.download',
    targetType: 'TemplateAttachment',
    targetId: att.id,
    payload: { templateId: att.templateId, originalName: att.originalName, size: att.size, mime: att.mime },
  });
  res.setHeader('Content-Type', att.mime || 'application/octet-stream');
  return res.download(absolute, att.originalName);
});

// DELETE /api/templates/:id/attachments/:attId — hard-delete (admin-only).
// Удаление файла на диске — fire-and-forget; row уходит сразу.
templatesRoutes.delete('/:id/attachments/:attId', async (req, res) => {
  const att = await prisma.templateAttachment.findFirst({
    where: { id: req.params.attId, templateId: req.params.id },
  });
  if (!att) return res.status(404).json({ error: 'not_found' });
  await prisma.templateAttachment.delete({ where: { id: att.id } });
  // Try to remove file from disk; don't block response if it fails.
  try {
    const absolute = path.resolve(storage.resolvePath(att.path));
    const root = path.resolve(env.UPLOADS_DIR);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (absolute.startsWith(rootWithSep) && fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch (err) {
    console.warn('[templates/attachment] disk cleanup failed (non-fatal):', err);
  }
  await recordAudit(req, {
    action: 'template_attachment.delete',
    targetType: 'TemplateAttachment',
    targetId: att.id,
    payload: { templateId: att.templateId, originalName: att.originalName },
  });
  res.json({ ok: true });
});
