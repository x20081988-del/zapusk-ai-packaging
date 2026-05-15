import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { requireNotInvestor } from '../lib/ownership.js';
import { streamProjectZip } from '../services/packageService.js';
import { sanitizePublicText } from '../services/publicText.js';
import { titleForKind } from '../services/promptBuilders.js';

export const exportRoutes = Router();
exportRoutes.use(authMiddleware);
// Sprint 37 P0.4 — экспорт project ZIP / JSON / prompts / documents — это
// founder-data. INVESTOR блокируется.
exportRoutes.use(requireNotInvestor());

exportRoutes.get('/:projectId/export/zip', async (req, res) => {
  const user = getUser(req);
  const project = await prisma.project.findFirst({ where: { id: req.params.projectId, userId: user.id } });
  if (!project) return res.status(404).json({ error: 'not_found' });
  try {
    await streamProjectZip(project.id, res);
  } catch (err) {
    console.error('[zip]', err);
    if (!res.headersSent) res.status(500).json({ error: 'zip_failed' });
  }
});

exportRoutes.get('/:projectId/export', async (req, res) => {
  const user = getUser(req);
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: user.id },
    include: {
      files: true,
      brief: true,
      investorTerms: true,
      generatedPrompts: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      generatedDocs: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      referenceMats: true,
    },
  });
  if (!project) return res.status(404).json({ error: 'not_found' });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^\w-]/g, '_')}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), project }, null, 2));
});

exportRoutes.get('/:projectId/prompts/:promptId.md', async (req, res) => {
  const user = getUser(req);
  const project = await prisma.project.findFirst({ where: { id: req.params.projectId, userId: user.id } });
  if (!project) return res.status(404).json({ error: 'not_found' });
  const prompt = await prisma.generatedPrompt.findFirst({
    where: { id: req.params.promptId, projectId: project.id },
  });
  if (!prompt) return res.status(404).json({ error: 'prompt_not_found' });

  const body = `# ${titleForKind(prompt.kind)} — версия ${prompt.version}\n\n${sanitizePublicText(prompt.body)}\n`;
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${prompt.kind}_v${prompt.version}.md"`);
  res.send(body);
});

exportRoutes.get('/:projectId/documents/:docId.md', async (req, res) => {
  const user = getUser(req);
  const project = await prisma.project.findFirst({ where: { id: req.params.projectId, userId: user.id } });
  if (!project) return res.status(404).json({ error: 'not_found' });
  const doc = await prisma.generatedDocument.findFirst({
    where: { id: req.params.docId, projectId: project.id },
  });
  if (!doc) return res.status(404).json({ error: 'doc_not_found' });

  const body = `# ${doc.title}\n\n${doc.body}\n`;
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.kind}_v${doc.version}.md"`);
  res.send(body);
});
