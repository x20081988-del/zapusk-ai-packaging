import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { storage } from '../services/storage.js';
import { recordAudit } from '../lib/audit.js';
import { env } from '../env.js';
import { getActorRole, isAdminLike, requireNotInvestor } from '../lib/ownership.js';
import { multerFileFilter, uploadRejectionMessage } from '../lib/uploadValidation.js';

export const filesRoutes = Router();
filesRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не имеет доступа к founder-files.
filesRoutes.use(requireNotInvestor());

// Sprint 50 P1.2 — fileFilter rejects non-document uploads upstream of
// the buffer copy. See lib/uploadValidation.ts for the allowlist.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: multerFileFilter('project_file'),
});

async function assertOwnership(userId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, userId } });
  return Boolean(p);
}

// Sprint 36 P0.1 — admin/manager видят любой проект; founder — только свой.
// Возвращаем «принадлежит ли user проекту» без 403/404 — это решает route.
async function actorCanAccessProject(req: Parameters<typeof getUser>[0], projectId: string): Promise<boolean> {
  const role = getActorRole(req);
  if (isAdminLike(role)) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    return Boolean(exists);
  }
  return assertOwnership(getUser(req).id, projectId);
}

// Sprint 50 P1.2 — wrap multer to catch its fileFilter rejection and turn
// it into a friendly 400 instead of multer's default 500.
function multerUploadWithGuard(req: Parameters<typeof getUser>[0], res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void): void {
  upload.array('files', 20)(req as never, res as never, (err: unknown) => {
    if (!err) return next();
    if (err instanceof Error && err.message.startsWith('upload_rejected:')) {
      const reason = err.message.split(':')[1];
      res.status(400).json({ error: 'upload_rejected', reason, message: uploadRejectionMessage(reason) });
      return;
    }
    if (err instanceof Error && /file too large/i.test(err.message)) {
      res.status(413).json({ error: 'file_too_large' });
      return;
    }
    res.status(400).json({ error: 'upload_failed', message: err instanceof Error ? err.message : 'unknown' });
  });
}

filesRoutes.post('/:projectId/upload', multerUploadWithGuard, async (req, res) => {
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

// Sprint 36 P0.1 — защищённый download. Раньше файлы раздавались публично через
// `app.use('/uploads', express.static(...))` — любой с URL мог скачать
// презентацию, финмодель или запись разговора клиента. Теперь:
//   • SUPER_ADMIN / ADMIN / MANAGER могут скачать любой файл;
//   • FOUNDER — только файлы своих проектов;
//   • path traversal невозможен: путь строится из DB-row, а финальный путь
//     явно проверяется на принадлежность storage-root.
filesRoutes.get('/:projectId/:fileId/download', async (req, res) => {
  const ok = await actorCanAccessProject(req, req.params.projectId);
  if (!ok) return res.status(404).json({ error: 'project_not_found' });

  const file = await prisma.uploadedFile.findFirst({
    where: { id: req.params.fileId, projectId: req.params.projectId, archivedAt: null },
  });
  if (!file) return res.status(404).json({ error: 'file_not_found' });

  // Sprint 36 P0.1 — link-files (внешние URL'ы) не отдаём через download:
  // ничего на диске нет, только UploadedFile.url с типа 'text/uri-list'.
  if (!file.path) return res.status(404).json({ error: 'file_not_downloadable' });

  // Защита от path traversal: вычисляем абсолютный путь к файлу и проверяем,
  // что он строго внутри storage-root. Даже если DB-row был испорчен —
  // запрос вне директории не пройдёт.
  const root = path.resolve(env.UPLOADS_DIR);
  const absolute = path.resolve(storage.resolvePath(file.path));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    console.error('[files] download blocked — path traversal attempt:', { fileId: file.id, path: file.path });
    return res.status(404).json({ error: 'file_not_found' });
  }

  if (!fs.existsSync(absolute)) {
    return res.status(404).json({ error: 'file_missing_on_disk' });
  }

  // Sprint 37 P0.3 — audit на чувствительные скачивания. Логируем только
  // metadata (никаких контентов файла) — для расследования утечек: кто, что,
  // когда скачал. recordAudit не падает на ошибках записи, так что не блокирует
  // отдачу файла.
  await recordAudit(req, {
    action: 'file.download',
    targetType: 'UploadedFile',
    targetId: file.id,
    payload: {
      projectId: file.projectId,
      originalName: file.originalName,
      category: file.category,
      size: file.size,
      mimeType: file.mimeType,
    },
  });

  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  return res.download(absolute, file.originalName || path.basename(absolute));
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
