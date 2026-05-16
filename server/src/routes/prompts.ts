import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, getUser, requireRole } from '../auth.js';
import { generatePrompt, generateAllPrompts, ALL_PROMPT_KINDS, type PromptKind } from '../services/promptBuilders.js';
import { generateFullPackaging } from '../services/packageService.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';
import { getPromptTemplateHistory } from '../services/promptTemplateVersioning.js';
import { isAIGuardrailError } from '../ai/client.js';

export const promptsRoutes = Router();
promptsRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не запускает packaging и не работает с founder-prompts.
promptsRoutes.use(requireNotInvestor());

// Sprint 48 — PromptTemplate history. Placed before /:projectId so `history`
// is not treated as a project route. Admin/manager only: history can reveal
// operational template changes, but never returns full template body.
promptsRoutes.get('/:id/history', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const history = await getPromptTemplateHistory(req.params.id);
  if (!history) return res.status(404).json({ error: 'not_found' });
  res.json(history);
});

promptsRoutes.post('/:projectId/generate-full-packaging', async (req, res) => {
  const user = getUser(req);
  const owned = await prisma.project.findFirst({ where: { id: req.params.projectId, userId: user.id } });
  if (!owned) return res.status(404).json({ error: 'project_not_found' });
  try {
    const result = await generateFullPackaging(req.params.projectId);
    res.status(201).json(result);
  } catch (err) {
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    console.error('[full-packaging]', err);
    res.status(500).json({ error: 'full_packaging_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
});

async function assertOwnership(userId: string, projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, userId } }));
}

promptsRoutes.get('/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const prompts = await prisma.generatedPrompt.findMany({
    where: { projectId: req.params.projectId },
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  });
  res.json({ prompts });
});

promptsRoutes.post('/:projectId/generate/:kind', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const kind = req.params.kind as PromptKind;
  if (!ALL_PROMPT_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'unknown_kind' });
  }
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : undefined;
  try {
    const prompt = await generatePrompt(req.params.projectId, kind, feedback);
    res.status(201).json({ prompt });
  } catch (err) {
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    console.error('[prompts]', err);
    res.status(500).json({ error: 'prompt_generation_failed' });
  }
});

promptsRoutes.post('/:projectId/generate-all', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  try {
    const results = await generateAllPrompts(req.params.projectId);
    res.status(201).json({ generated: results });
  } catch (err) {
    if (isAIGuardrailError(err)) {
      return res.status(err.statusCode).json({ error: err.code });
    }
    console.error('[prompts/generate-all]', err);
    res.status(500).json({ error: 'prompt_generation_failed' });
  }
});

// ─── Sprint 32 — append-only versions per prompt kind ─────────────────────

// GET /api/prompts/:projectId/:kind/versions — all versions of one prompt kind,
// newest first. Каждый regenerate уже создаёт новую строку (Sprint 21 design),
// этот endpoint просто отдаёт историю.
promptsRoutes.get('/:projectId/:kind/versions', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const versions = await prisma.generatedPrompt.findMany({
    where: { projectId: req.params.projectId, kind: req.params.kind },
    orderBy: { version: 'desc' },
    take: 50,
  });
  res.json({ versions });
});

// POST /api/prompts/:projectId/:kind/restore/:promptId — promote старую версию
// в latest. Реализовано как «create a new row with same body» — append-only,
// никаких update. UI всегда показывает latest version по (projectId, kind).
promptsRoutes.post('/:projectId/:kind/restore/:promptId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const source = await prisma.generatedPrompt.findFirst({
    where: { id: req.params.promptId, projectId: req.params.projectId, kind: req.params.kind },
  });
  if (!source) return res.status(404).json({ error: 'version_not_found' });

  const latest = await prisma.generatedPrompt.findFirst({
    where: { projectId: req.params.projectId, kind: req.params.kind },
    orderBy: { version: 'desc' },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const restored = await prisma.generatedPrompt.create({
    data: {
      projectId: req.params.projectId,
      kind: req.params.kind,
      version: nextVersion,
      body: source.body,
      feedback: `[restored from v${source.version}]${source.feedback ? ` · ${source.feedback}` : ''}`,
    },
  });

  await recordAudit(req, {
    action: 'prompt.restore',
    targetType: 'GeneratedPrompt',
    targetId: restored.id,
    payload: { projectId: restored.projectId, kind: restored.kind, restoredFromVersion: source.version, newVersion: nextVersion },
  });

  res.status(201).json({ prompt: restored, restoredFrom: { id: source.id, version: source.version } });
});

// GET /api/prompts/:projectId/documents/:kind/versions — same shape for GeneratedDocument.
promptsRoutes.get('/:projectId/documents/:kind/versions', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const versions = await prisma.generatedDocument.findMany({
    where: { projectId: req.params.projectId, kind: req.params.kind },
    orderBy: { version: 'desc' },
    take: 50,
  });
  res.json({ versions });
});

// POST /api/prompts/:projectId/documents/:kind/restore/:documentId
promptsRoutes.post('/:projectId/documents/:kind/restore/:documentId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const source = await prisma.generatedDocument.findFirst({
    where: { id: req.params.documentId, projectId: req.params.projectId, kind: req.params.kind },
  });
  if (!source) return res.status(404).json({ error: 'version_not_found' });

  const latest = await prisma.generatedDocument.findFirst({
    where: { projectId: req.params.projectId, kind: req.params.kind },
    orderBy: { version: 'desc' },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const restored = await prisma.generatedDocument.create({
    data: {
      projectId: req.params.projectId,
      kind: req.params.kind,
      version: nextVersion,
      format: source.format,
      title: `${source.title} · restored from v${source.version}`,
      body: source.body,
    },
  });

  await recordAudit(req, {
    action: 'document.restore',
    targetType: 'GeneratedDocument',
    targetId: restored.id,
    payload: { projectId: restored.projectId, kind: restored.kind, restoredFromVersion: source.version, newVersion: nextVersion },
  });

  res.status(201).json({ document: restored, restoredFrom: { id: source.id, version: source.version } });
});
