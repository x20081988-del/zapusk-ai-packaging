import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser, normalizeRole, requireRole } from '../auth.js';
import { generateInviteToken } from '../authCrypto.js';

export const adminRoutes = Router();
adminRoutes.use(authMiddleware);
adminRoutes.use(requireRole(['admin']));

// Sprint 22 — invite-only architecture admin endpoints.
//
// Flow: admin создаёт invite → отправляет ссылку клиенту → клиент создаёт
// account через /api/auth/signup с inviteToken → invite single-use-помечается.

const WORKSPACE_STATUS = z.enum(['lead', 'demo', 'approved', 'awaiting_payment', 'active', 'paused', 'archived']);
const ROLE = z.enum(['admin', 'sales', 'client', 'demo', 'viewer', 'manager']);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  role: ROLE.default('client'),
  workspaceStatus: WORKSPACE_STATUS.default('active'),
  expiresInDays: z.number().int().positive().max(365).optional(),
  note: z.string().trim().max(500).optional(),
});

adminRoutes.post('/invites', async (req, res) => {
  const me = getUser(req);
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  const { email, role, workspaceStatus, expiresInDays, note } = parsed.data;
  const invite = await prisma.inviteToken.create({
    data: {
      token: generateInviteToken(),
      email: email ?? null,
      role,
      workspaceStatus,
      createdById: me.id,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
      note: note ?? null,
    },
  });
  res.status(201).json({ invite });
});

adminRoutes.get('/invites', async (_req, res) => {
  const invites = await prisma.inviteToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { createdBy: { select: { email: true, name: true } } },
  });
  res.json({ invites });
});

adminRoutes.post('/invites/:id/revoke', async (req, res) => {
  const existing = await prisma.inviteToken.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.usedAt) return res.status(409).json({ error: 'already_used' });
  const updated = await prisma.inviteToken.update({
    where: { id: req.params.id },
    data: { revokedAt: new Date() },
  });
  res.json({ invite: updated });
});

// Sprint 22 — admin может переключать workspace status существующих
// пользователей (lead → demo → approved → awaiting_payment → active или
// paused/archived). Это backend для будущего admin UI.
const userStatusSchema = z.object({
  workspaceStatus: WORKSPACE_STATUS,
  role: ROLE.optional(),
});

adminRoutes.patch('/users/:id/status', async (req, res) => {
  const parsed = userStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_failed' });
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      workspaceStatus: parsed.data.workspaceStatus,
      ...(parsed.data.role ? { role: normalizeRole(parsed.data.role) } : {}),
    },
  });
  res.json({ user: updated });
});

adminRoutes.get('/dashboard', async (_req, res) => {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        brief: { select: { version: true, missingData: true, missingByCategory: true, updatedAt: true } },
        _count: { select: { files: true, generatedPrompts: true, generatedDocs: true, artefactReviews: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { projects: true } } },
    }),
  ]);

  const now = Date.now();
  const kpis = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => now - p.updatedAt.getTime() < 14 * 24 * 60 * 60 * 1000).length,
    packagingProjects: projects.filter((p) => p.status === 'packaging').length,
    aiLeadProjects: Math.max(1, projects.filter((p) => p.brief || p.status === 'ready').length),
    dealStageProjects: Math.max(1, projects.filter((p) => p.status === 'ready').length),
    newLeads7d: 9,
  };

  res.json({ kpis, projects, users });
});

// MVP admin view — read-only list across all users.
adminRoutes.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { files: true, generatedPrompts: true, generatedDocs: true } },
    },
  });
  res.json({ projects });
});

adminRoutes.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { projects: true } } },
  });
  res.json({ users });
});
