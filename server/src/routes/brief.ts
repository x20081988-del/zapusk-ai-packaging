import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import {
  filterAnsweredMissingByCategory,
  filterAnsweredMissingData,
  generateBrief,
  mergeInterviewAnswers,
  parseAnswers,
  regenerateBriefWithFeedback,
  serializeNapkinWithInterviewAnswers,
  snapshotBrief,
} from '../services/briefService.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';

export const briefRoutes = Router();
briefRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не работает с founder-брифами.
briefRoutes.use(requireNotInvestor());

async function assertOwnership(userId: string, projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, userId } }));
}

const answerSchema = z.object({
  question: z.string().min(1),
  answer: z.string(),
  category: z.string().optional(),
});
const interviewSchema = z.object({ answers: z.array(answerSchema) });
const briefFeedbackSchema = z.object({
  feedback: z.string().trim().min(1),
  focus: z.enum(['narrative', 'finance', 'risks', 'investor_offer', 'missing_data']).optional(),
});

briefRoutes.post('/:projectId/generate', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  try {
    const result = await generateBrief(req.params.projectId);
    res.json(result);
  } catch (err) {
    console.error('[brief]', err);
    res.status(500).json({ error: 'brief_generation_failed' });
  }
});

briefRoutes.get('/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const brief = await prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } });
  // Sprint 37 P0.3 — audit на чтение брифа. Бриф — это вся инвест-аналитика
  // проекта (бизнес-резюме, монетизация, валидация). Любая утечка — серьёзный
  // инцидент. Логируем только metadata (projectId + version), не сам текст.
  if (brief) {
    await recordAudit(req, {
      action: 'brief.read',
      targetType: 'ProjectBrief',
      targetId: brief.id,
      payload: { projectId: brief.projectId, version: brief.version },
    });
  }
  res.json({ brief });
});

briefRoutes.post('/:projectId/regenerate-with-feedback', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const parsed = briefFeedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await regenerateBriefWithFeedback(
      req.params.projectId,
      parsed.data.feedback,
      parsed.data.focus,
    );
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error && err.name === 'BriefNotGenerated') {
      return res.status(409).json({ error: 'brief_not_generated', message: 'Сначала сгенерируйте бриф.' });
    }
    console.error('[brief-feedback]', err);
    res.status(500).json({ error: 'brief_feedback_regeneration_failed' });
  }
});

// Save AI Interview answers onto the existing brief. We persist answers as a
// stable JSON array on ProjectBrief — they survive brief regenerations and feed
// promptBuilders + the next generateBrief() via the AI user prompt.
briefRoutes.patch('/:projectId/interview', async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: 'project_not_found' });
  }
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } });
  if (!existing) {
    return res.status(409).json({ error: 'brief_not_generated', message: 'Сгенерируйте бриф перед сохранением ответов интервью.' });
  }

  const previousAnswers = parseAnswers(existing.interviewAnswers);
  const savedAt = new Date().toISOString();
  const mergedAnswers = mergeInterviewAnswers(previousAnswers, parsed.data.answers, savedAt);
  const nextVersion = existing.version + 1;
  const nextNapkin = serializeNapkinWithInterviewAnswers(existing.napkin, mergedAnswers);

  // Sprint 32 — snapshot предыдущей версии brief'а до того как interview
  // ответы перепишут missingData / napkin.
  await snapshotBrief(existing, 'interview');

  const brief = await prisma.projectBrief.update({
    where: { projectId: req.params.projectId },
    data: {
      version: nextVersion,
      interviewAnswers: JSON.stringify(mergedAnswers),
      missingData: filterAnsweredMissingData(existing.missingData, mergedAnswers),
      missingByCategory: filterAnsweredMissingByCategory(existing.missingByCategory, mergedAnswers),
      napkin: nextNapkin,
    },
  });

  await prisma.generatedDocument.create({
    data: {
      projectId: req.params.projectId,
      kind: 'napkin',
      version: nextVersion,
      format: 'json',
      title: `Бизнес на салфетке v${nextVersion} · AI-интервью`,
      body: JSON.stringify(JSON.parse(nextNapkin), null, 2),
    },
  });
  res.json({ brief, savedCount: mergedAnswers.length });
});

// ─── Sprint 32 — brief versions: list + restore ───────────────────────────

// GET /api/brief/:projectId/versions — append-only history брифа.
briefRoutes.get("/:projectId/versions", async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: "project_not_found" });
  }
  const [current, versions] = await Promise.all([
    prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } }),
    prisma.projectBriefVersion.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);
  res.json({ current, versions });
});

// POST /api/brief/:projectId/restore/:versionId — snapshot current → restore old.
// Никаких данных не теряется: текущая версия сохраняется в ProjectBriefVersion
// перед тем как старая записывается обратно в ProjectBrief.
briefRoutes.post("/:projectId/restore/:versionId", async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: "project_not_found" });
  }
  const current = await prisma.projectBrief.findUnique({ where: { projectId: req.params.projectId } });
  if (!current) return res.status(404).json({ error: "brief_not_generated" });

  const target = await prisma.projectBriefVersion.findFirst({
    where: { id: req.params.versionId, projectId: req.params.projectId },
  });
  if (!target) return res.status(404).json({ error: "version_not_found" });

  // 1. Snapshot текущего состояния, чтобы restore был обратим.
  await snapshotBrief(current, "restore");

  // 2. Перезаписать ProjectBrief данными старой версии. Version=current+1 —
  //    restore это новая версия, не клон старой.
  const restored = await prisma.projectBrief.update({
    where: { projectId: req.params.projectId },
    data: {
      version: current.version + 1,
      businessSummary: target.businessSummary,
      monetization: target.monetization,
      keyMetrics: target.keyMetrics,
      investmentAsk: target.investmentAsk,
      strengths: target.strengths,
      weaknesses: target.weaknesses,
      missingData: target.missingData,
      missingByCategory: target.missingByCategory,
      interviewAnswers: target.interviewAnswers,
      napkin: target.napkin,
      rawAIResponse: target.rawAIResponse,
    },
  });

  await recordAudit(req, {
    action: "brief.restore",
    targetType: "ProjectBrief",
    targetId: restored.id,
    payload: {
      projectId: restored.projectId,
      restoredFromVersionId: target.id,
      restoredFromVersionNumber: target.version,
      newVersion: restored.version,
    },
  });

  res.json({ brief: restored, restoredFrom: { id: target.id, version: target.version } });
});

// GET /api/brief/:projectId/versions/:versionId — full snapshot одной версии.
briefRoutes.get("/:projectId/versions/:versionId", async (req, res) => {
  const user = getUser(req);
  if (!(await assertOwnership(user.id, req.params.projectId))) {
    return res.status(404).json({ error: "project_not_found" });
  }
  const v = await prisma.projectBriefVersion.findFirst({
    where: { id: req.params.versionId, projectId: req.params.projectId },
  });
  if (!v) return res.status(404).json({ error: "not_found" });
  res.json({ version: v });
});

