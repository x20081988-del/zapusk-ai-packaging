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
// Sprint 61 — Project Knowledge Layer. После сохранения файла на диск
// автоматически шлём его в project-scoped KB (fire-and-forget), чтобы
// AI Assistant мог retrieve содержимое pitch-deck / финмодели.
import { scheduleProjectFileIngest } from '../services/projectKnowledgeIngest.js';
import { recoverUtf8Filename } from '../lib/filenameEncoding.js';

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
    // Sprint 61.HOTFIX — recover UTF-8 Cyrillic filenames mangled by multer's
    // default latin1 decoding. Without this Cyrillic names get stored as
    // "Ð¿Ñ€ÐµÐ·…" mojibake and break display + KB title.
    const originalNameUtf8 = recoverUtf8Filename(f.originalname);
    const ext = path.extname(originalNameUtf8) || path.extname(f.originalname);
    const diskName = `${randomUUID()}${ext}`;
    const rel = path.join(req.params.projectId, diskName);
    await storage.saveBuffer(rel, f.buffer);
    const row = await prisma.uploadedFile.create({
      data: {
        projectId: req.params.projectId,
        filename: diskName,
        originalName: originalNameUtf8,
        mimeType: f.mimetype,
        size: f.size,
        category,
        path: rel,
      },
    });
    created.push(row);
    // Sprint 61 — async fire-and-forget: парсим файл и регистрируем
    // KnowledgeSource(scope='project'). Если падает — лог, не блокирует ответ.
    // Environment по workspaceStatus вызывающего: demo workspace → demo KB,
    // production → production KB (см. retrieveKnowledgeForTranscript filter).
    // Sprint 61.P1 — feature flag kill-switch.
    if (env.PROJECT_KB_AUTO_INGEST_ENABLED) {
      scheduleProjectFileIngest(row.id, req.params.projectId, {
        environment: workspaceToKnowledgeEnv((req as { user?: { workspaceStatus?: string } }).user?.workspaceStatus ?? null),
        createdById: user.id,
      });
    }
  }
  res.status(201).json({ files: created });
});

function workspaceToKnowledgeEnv(status: string | null): 'production' | 'demo' | 'synthetic' {
  if (status === 'demo') return 'demo';
  if (status === 'synthetic') return 'synthetic';
  return 'production';
}

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

// Sprint 62.P0 — единый registry материалов проекта.
//
// Важно: это read-only слой поверх уже существующих таблиц. Он НЕ запускает
// ingest, НЕ читает текст chunks и НЕ раскрывает prompt/transcript contents.
// Цель — дать UI понятный ответ: где исходные файлы, вошли ли они в AI-контекст,
// сколько chunks/facts получилось и какие generated-материалы уже есть.
filesRoutes.get('/:projectId/registry', async (req, res) => {
  const ok = await actorCanAccessProject(req, req.params.projectId);
  if (!ok) return res.status(404).json({ error: 'project_not_found' });

  const projectId = req.params.projectId;
  const [files, generatedPrompts, generatedDocs] = await Promise.all([
    prisma.uploadedFile.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.generatedPrompt.findMany({
      where: { projectId },
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
      select: { id: true, kind: true, version: true, createdAt: true },
    }),
    prisma.generatedDocument.findMany({
      where: { projectId },
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
      select: { id: true, kind: true, version: true, title: true, format: true, createdAt: true },
    }),
  ]);

  const fileIds = files.map((f) => f.id);
  const [sources, factGroups] = fileIds.length
    ? await Promise.all([
        prisma.knowledgeSource.findMany({
          where: { uploadedFileId: { in: fileIds }, archivedAt: null },
          orderBy: { updatedAt: 'desc' },
          include: { _count: { select: { chunks: true } } },
        }),
        prisma.projectNumericFact.groupBy({
          by: ['sourceFileId'],
          where: { projectId, sourceFileId: { in: fileIds } },
          _count: { _all: true },
        }),
      ])
    : [[], []] as const;

  const factsByFile = new Map<string, number>();
  for (const g of factGroups) {
    if (g.sourceFileId) factsByFile.set(g.sourceFileId, g._count._all);
  }

  const sourceByFile = new Map<string, typeof sources[number]>();
  for (const s of sources) {
    if (!s.uploadedFileId) continue;
    const prev = sourceByFile.get(s.uploadedFileId);
    if (!prev || s.updatedAt > prev.updatedAt) sourceByFile.set(s.uploadedFileId, s);
  }

  const sourceMaterials = files.map((file) => {
    const source = sourceByFile.get(file.id) ?? null;
    const chunkCount = source?._count.chunks ?? 0;
    const numericFactsCount = factsByFile.get(file.id) ?? 0;
    const aiStatus = resolveAiContextStatus(file, source, chunkCount);
    return {
      id: file.id,
      materialType: 'source',
      version: inferMaterialVersion(file.originalName),
      file,
      aiContext: {
        status: aiStatus.status,
        label: aiStatus.label,
        badges: buildAiBadges(file, source, chunkCount, numericFactsCount),
        knowledgeSourceId: source?.id ?? null,
        knowledgeSourceStatus: source?.status ?? null,
        scope: source?.scope ?? null,
        sourceType: source?.sourceType ?? null,
        projectId: source?.projectId ?? null,
        uploadedFileId: source?.uploadedFileId ?? null,
        isCandidate: source?.isCandidate ?? null,
        visibility: source?.visibility ?? null,
        chunkCount,
        numericFactsCount,
        retrievalCount: source?.retrievalCount ?? 0,
        lastAnalyzedAt: source?.updatedAt ?? null,
        lastRetrievedAt: source?.lastRetrievedAt ?? null,
      },
    };
  });

  const generatedMaterials = [
    ...generatedDocs.map((d) => ({
      id: d.id,
      materialType: 'generated',
      generatedType: 'document',
      kind: d.kind,
      title: d.title,
      version: d.version,
      format: d.format,
      createdAt: d.createdAt,
    })),
    ...generatedPrompts.map((p) => ({
      id: p.id,
      materialType: 'generated',
      generatedType: 'prompt',
      kind: p.kind,
      title: p.kind,
      version: p.version,
      format: 'prompt',
      createdAt: p.createdAt,
    })),
  ];

  res.json({
    sourceMaterials,
    generatedMaterials,
    summary: {
      sourceCount: sourceMaterials.length,
      generatedCount: generatedMaterials.length,
      aiContextCount: sourceMaterials.filter((m) => m.aiContext.status === 'connected').length,
      analyzingCount: sourceMaterials.filter((m) => m.aiContext.status === 'analyzing').length,
      storageOnlyCount: sourceMaterials.filter((m) => m.aiContext.status === 'storage_only').length,
      errorCount: sourceMaterials.filter((m) => m.aiContext.status === 'error').length,
      chunkCount: sourceMaterials.reduce((sum, m) => sum + m.aiContext.chunkCount, 0),
      numericFactsCount: sourceMaterials.reduce((sum, m) => sum + m.aiContext.numericFactsCount, 0),
    },
  });
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

type AiContextStatus = 'connected' | 'analyzing' | 'storage_only' | 'error';

function resolveAiContextStatus(
  file: { url: string | null; mimeType: string; originalName: string },
  source: { status: string; isCandidate: boolean } | null,
  chunkCount: number,
): { status: AiContextStatus; label: string } {
  if (file.url) return { status: 'storage_only', label: 'Только хранение' };
  if (!isIngestibleFile(file)) return { status: 'storage_only', label: 'Текст не извлекается' };
  if (!source) return { status: 'analyzing', label: 'AI-анализ ещё выполняется' };
  if (source.status === 'disabled') return { status: 'error', label: 'AI-анализ отключён' };
  if (chunkCount <= 0) return { status: 'error', label: 'Не удалось извлечь текст' };
  if (source.isCandidate || source.status === 'draft') return { status: 'analyzing', label: 'AI-анализ требует проверки' };
  return { status: 'connected', label: 'Файл добавлен в AI-контекст проекта' };
}

function buildAiBadges(
  file: { url: string | null; mimeType: string; originalName: string },
  source: { status: string } | null,
  chunkCount: number,
  numericFactsCount: number,
): string[] {
  const badges: string[] = [];
  const ext = fileExtension(file.originalName);
  if (source && chunkCount > 0) {
    badges.push('AI-контекст подключён');
    badges.push('Текст извлечён');
  } else if (file.url || !isIngestibleFile(file)) {
    badges.push('Только хранение');
  } else {
    badges.push('AI анализируется');
  }
  if (source?.status === 'disabled' || (source && chunkCount <= 0)) badges.push('Ошибка анализа');
  if (ext === '.xlsx') badges.push(chunkCount > 0 ? 'XLSX структурирован' : 'XLSX ждёт анализа');
  if (numericFactsCount > 0) badges.push('Numeric facts extracted');
  return [...new Set(badges)];
}

function isIngestibleFile(file: { url: string | null; mimeType: string; originalName: string }): boolean {
  if (file.url) return false;
  const ext = fileExtension(file.originalName);
  if (ext === '.pdf' || ext === '.docx' || ext === '.xlsx' || ext === '.txt' || ext === '.md') return true;
  return (file.mimeType ?? '').startsWith('text/');
}

function fileExtension(name: string): string {
  const match = name.match(/\.[a-z0-9]+$/i);
  return (match?.[0] ?? '').toLowerCase();
}

function inferMaterialVersion(name: string): number {
  const normalized = name.toLowerCase();
  const explicit = /(?:^|[\s._-])v(?:ersion)?\s*([0-9]{1,2})(?:\D|$)/i.exec(normalized)
    ?? /(?:^|[\s._-])версия\s*([0-9]{1,2})(?:\D|$)/i.exec(normalized);
  if (explicit?.[1]) return Number(explicit[1]);
  if (/(стало|after|final|финал)/i.test(name)) return 2;
  return 1;
}
