import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';

export const reviewsRoutes = Router();
reviewsRoutes.use(authMiddleware);
// Sprint 37 P0.4 — artefact reviews — founder/manager workflow. INVESTOR no.
reviewsRoutes.use(requireNotInvestor());

async function ownsProject(userId: string, projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, userId } }));
}

const upsertSchema = z.object({
  projectId: z.string(),
  artefactKind: z.enum(['prompt', 'document', 'brief']),
  artefactKey: z.string().min(1),
  artefactId: z.string().optional().nullable(),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
  approved: z.boolean().optional(),
  needsRework: z.boolean().optional(),
});

// Upsert review keyed by (projectId, artefactKind, artefactKey, reviewer).
// One reviewer keeps one running review per artefact; updating an existing one
// preserves the artefactId so we always know which version got the latest mark.
reviewsRoutes.post('/', async (req, res) => {
  const user = getUser(req);
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (!(await ownsProject(user.id, d.projectId))) return res.status(404).json({ error: 'project_not_found' });

  const existing = await prisma.artefactReview.findFirst({
    where: {
      projectId: d.projectId,
      artefactKind: d.artefactKind,
      artefactKey: d.artefactKey,
      reviewer: user.email,
    },
  });

  const review = existing
    ? await prisma.artefactReview.update({
        where: { id: existing.id },
        data: {
          artefactId: d.artefactId ?? existing.artefactId,
          score: d.score,
          comment: d.comment ?? null,
          approved: d.approved ?? false,
          needsRework: d.needsRework ?? false,
        },
      })
    : await prisma.artefactReview.create({
        data: {
          projectId: d.projectId,
          artefactKind: d.artefactKind,
          artefactKey: d.artefactKey,
          artefactId: d.artefactId ?? null,
          score: d.score,
          comment: d.comment ?? null,
          approved: d.approved ?? false,
          needsRework: d.needsRework ?? false,
          reviewer: user.email,
        },
      });
  res.status(existing ? 200 : 201).json({ review });
});

reviewsRoutes.get('/project/:projectId', async (req, res) => {
  const user = getUser(req);
  if (!(await ownsProject(user.id, req.params.projectId))) return res.status(404).json({ error: 'project_not_found' });
  const reviews = await prisma.artefactReview.findMany({
    where: { projectId: req.params.projectId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ reviews });
});

// Sprint 30 — soft-delete + audit.
reviewsRoutes.delete('/:id', async (req, res) => {
  const user = getUser(req);
  const review = await prisma.artefactReview.findUnique({ where: { id: req.params.id } });
  if (!review || review.archivedAt) return res.status(404).json({ error: 'not_found' });
  if (!(await ownsProject(user.id, review.projectId))) return res.status(404).json({ error: 'project_not_found' });
  await prisma.artefactReview.update({ where: { id: review.id }, data: { archivedAt: new Date() } });
  await recordAudit(req, {
    action: 'review.archive',
    targetType: 'ArtefactReview',
    targetId: review.id,
    payload: { projectId: review.projectId, artefactKey: review.artefactKey, score: review.score },
  });
  res.json({ ok: true, archivedAt: new Date().toISOString() });
});
