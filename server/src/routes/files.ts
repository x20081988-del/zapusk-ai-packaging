import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { storage } from '../services/storage.js';
import { recordAudit } from '../lib/audit.js';

export const filesRoutes = Router();
filesRoutes.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function assertOwnership(userId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, userId } });
  return Boolean(p);
}

filesRoutes.post('/:projectId/upload', upload.array('files', 20), async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const files = (req.files as Express.Multer.File[]) ?? [];
  const category = (req.body.category as string) || 'other';

  const created = [];
  for (const f of files) {
    const ext = path.extname(f.originalname);
    const diskName = `${randomUUID()}${ext}`;
    const rel = path.join(req.params.projectId, diskName);
    await storage.saveBuffer(rel, f.buffer);
    const row = await prisma.uploadedFile.create({
      data: {
        projectId: req.params.projectId,
        filename: diskName,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        category,
        path: rel,
      },
    });
    created.push(row);
  }
  res.status(201).json({ files: created });
});

const linkSchema = z.object({
  category: z.string().default('reference'),
  url: z.string().url(),
  note: z.string().optional(),
});

// External resource (Google Doc / Notion / website) — stored as an UploadedFile
// row with a URL and zero-byte placeholder so the cockpit lists everything together.
filesRoutes.post('/:projectId/link', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const row = await prisma.uploadedFile.create({
    data: {
      projectId: req.params.projectId,
      filename: 'link',
      originalName: parsed.data.note ?? parsed.data.url,
      mimeType: 'text/uri-list',
      size: 0,
      category: parsed.data.category,
      path: '',
      url: parsed.data.url,
    },
  });
  res.status(201).json({ file: row });
});

filesRoutes.get('/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const files = await prisma.uploadedFile.findMany({
    where: { projectId: req.params.projectId, archivedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ files });
});

// Sprint 30 — soft-delete. Файл помечается archivedAt; физический файл на
// диске НЕ удаляется до hard-cleanup через 30 дней (out of scope).
// Admin может восстановить через /api/admin/restore/file/:id.
filesRoutes.delete('/:projectId/:fileId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const f = await prisma.uploadedFile.findFirst({
    where: { id: req.params.fileId, projectId: req.params.projectId, archivedAt: null },
  });
  if (!f) return res.status(404).json({ error: 'file_not_found' });
  await prisma.uploadedFile.update({
    where: { id: f.id },
    data: { archivedAt: new Date() },
  });
  await recordAudit(req, {
    action: 'file.archive',
    targetType: 'UploadedFile',
    targetId: f.id,
    payload: { originalName: f.originalName, projectId: f.projectId, category: f.category },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});
