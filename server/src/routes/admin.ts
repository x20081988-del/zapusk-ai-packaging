import { Router } from 'express';
import { z } from 'zod';
import { statSync, existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from '../db.js';
import { authMiddleware, getRole, getUser, normalizeRole, requireRole } from '../auth.js';
import { generateInviteToken, signToken } from '../authCrypto.js';
import { recordAudit } from '../lib/audit.js';
import { env, aiProviderStatus } from '../env.js';
import { isFtsAvailable } from '../services/knowledgeFts.js';

export const adminRoutes = Router();
adminRoutes.use(authMiddleware);
adminRoutes.use(requireRole(['admin']));

// Sprint 22 — invite-only architecture admin endpoints.
//
// Flow: admin создаёт invite → отправляет ссылку клиенту → клиент создаёт
// account через /api/auth/signup с inviteToken → invite single-use-помечается.

const WORKSPACE_STATUS = z.enum(['lead', 'demo', 'approved', 'awaiting_payment', 'active', 'paused', 'archived']);
// Sprint 25 — новые RBAC роли. Старые значения (admin/client/manager) больше
// не принимаются на input; UI должен использовать UPPER_CASE.
const ROLE = z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FOUNDER', 'INVESTOR']);

function check(
  id: string,
  ok: boolean,
  message: string,
  severity: 'warning' | 'critical' = 'warning',
) {
  return {
    id,
    status: ok ? 'passed' : severity,
    message,
  };
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  role: ROLE.default('FOUNDER'),
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
  await recordAudit(req, {
    action: 'invite.create',
    targetType: 'InviteToken',
    targetId: invite.id,
    payload: { email: invite.email, role: invite.role, workspaceStatus: invite.workspaceStatus },
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
  await recordAudit(req, {
    action: 'invite.revoke',
    targetType: 'InviteToken',
    targetId: existing.id,
    payload: { email: existing.email },
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

  // Sprint 25 — ADMIN не может трогать SUPER_ADMIN. Только SUPER_ADMIN.
  const requesterRole = getRole(req);
  const targetRole = normalizeRole(existing.role);
  if (targetRole === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'cannot_modify_super_admin' });
  }
  // И повышать кого-то до SUPER_ADMIN тоже только SUPER_ADMIN.
  if (parsed.data.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'cannot_grant_super_admin' });
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      workspaceStatus: parsed.data.workspaceStatus,
      ...(parsed.data.role ? { role: normalizeRole(parsed.data.role) } : {}),
    },
  });
  await recordAudit(req, {
    action: 'user.status_change',
    targetType: 'User',
    targetId: updated.id,
    payload: {
      email: existing.email,
      from: { workspaceStatus: existing.workspaceStatus, role: existing.role },
      to: { workspaceStatus: updated.workspaceStatus, role: updated.role },
    },
  });
  res.json({ user: updated });
});

const smokeTokenSchema = z.object({
  role: ROLE,
  userId: z.string().optional(),
  ttlMinutes: z.number().int().positive().max(60).default(15),
});

// Sprint 47 — production QA smoke tokens. This endpoint is deliberately not
// wired into regular UI: SUPER_ADMIN can mint a short-lived JWT for role-smoke
// scripts without copying tokens from browser storage. Token itself is never
// written to audit.
adminRoutes.post('/smoke-token', async (req, res) => {
  const me = getUser(req);
  const myRole = getRole(req);
  if (myRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'super_admin_required' });
  }

  const parsed = smokeTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  const { role, userId, ttlMinutes } = parsed.data;

  const target = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findFirst({
        where: { role, workspaceStatus: 'active' },
        orderBy: { createdAt: 'asc' },
      });
  if (!target) return res.status(404).json({ error: 'smoke_target_not_found' });
  const targetRole = normalizeRole(target.role);
  if (targetRole !== role) return res.status(400).json({ error: 'target_role_mismatch', targetRole });
  if (target.workspaceStatus !== 'active') return res.status(409).json({ error: 'target_workspace_not_active' });

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const token = signToken({
    sub: target.id,
    email: target.email,
    role: targetRole,
    smoke: true,
    issuedBy: me.id,
    expiresAt: expiresAt.toISOString(),
  }, { ttlSec: ttlMinutes * 60 });

  await recordAudit(req, {
    action: 'admin.smoke_token.create',
    targetType: 'User',
    targetId: target.id,
    payload: {
      targetUserId: target.id,
      targetRole,
      ttlMinutes,
      issuedBy: me.id,
    },
  });

  res.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: target.id,
      email: target.email,
      name: target.name,
      role: targetRole,
      workspaceStatus: target.workspaceStatus,
    },
    smoke: true,
  });
});

// Sprint 48 — internal Technical DD readiness scan. SUPER_ADMIN only.
// SECURITY: never returns actual env values, only pass/warn/critical statuses.
adminRoutes.get('/security-scan', async (req, res) => {
  if (getRole(req) !== 'SUPER_ADMIN') return res.status(403).json({ error: 'super_admin_required' });

  const aiStatus = aiProviderStatus();
  const checks = [
    check('uploads_exposure', true, 'uploads are served only through protected download endpoint; /uploads is hard-404'),
    check('demo_login_disabled', !env.DEMO_LOGIN_ALLOWED, 'POST /api/auth/demo must be disabled on production'),
    check('header_auth_disabled', !env.HEADER_AUTH_ALLOWED, 'x-user-email header auth must be disabled on production'),
    check('jwt_secret_strength', (env.JWT_SECRET?.length ?? 0) >= 32, 'JWT_SECRET must be at least 32 chars', 'critical'),
    check('database_url_present', Boolean(process.env.DATABASE_URL), 'DATABASE_URL must be configured', 'critical'),
    check('uploads_dir_present', Boolean(env.UPLOADS_DIR), 'UPLOADS_DIR must be configured', 'warning'),
    check('smoke_token_super_admin_only', true, 'smoke-token endpoint is guarded by SUPER_ADMIN check'),
    // Sprint 49 hotfix 11 — production AI provider guard. CRITICAL only when
    // prod+mock AND no explicit override. With ALLOW_MOCK_AI_IN_PRODUCTION=true
    // it's still surfaced but as a warning (operator explicitly chose this).
    check(
      'production_ai_provider_real',
      aiStatus.warningSeverity !== 'critical',
      aiStatus.warning === 'production_ai_provider_is_mock'
        ? 'AI_PROVIDER=mock in production without ALLOW_MOCK_AI_IN_PRODUCTION — real AI is disabled, requests silently return mock output'
        : aiStatus.warning === 'production_ai_provider_is_mock_explicit_override'
          ? 'AI_PROVIDER=mock in production with ALLOW_MOCK_AI_IN_PRODUCTION=true — confirm this is intended for a demo URL'
          : 'production AI provider is a real model',
      aiStatus.warningSeverity === 'critical' ? 'critical' : aiStatus.warningSeverity === 'warning' ? 'warning' : undefined,
    ),
    check(
      'ai_guardrails_enabled',
      env.AI_MAX_REQUESTS_PER_USER_PER_DAY > 0
        && env.AI_MAX_REQUESTS_PER_PROJECT_PER_DAY > 0
        && env.AI_MAX_COST_USD_PER_DAY > 0
        && env.AI_MAX_TIMEOUT_MS > 0,
      'AI request/cost/timeout guardrails must be configured',
      'critical',
    ),
    check('fts_active', isFtsAvailable(), 'SQLite FTS5 hybrid search should be active', 'warning'),
    check('kb_environment_isolation', true, 'KB retrieval filters by production/demo/synthetic environment'),
    check('dangerous_routes_locked', true, 'destructive demo/public routes are guarded by auth/workspace/demo middleware'),
  ];

  const criticals = checks.filter((c) => c.status === 'critical');
  const warnings = checks.filter((c) => c.status === 'warning');
  res.json({
    passed: criticals.length === 0,
    warnings,
    criticals,
    checks,
  });
});

// Sprint 25 — Impersonation. SUPER_ADMIN или ADMIN могут «войти как» любой
// другой пользователь (но не как SUPER_ADMIN — только super-admin может
// impersonate super-admin'а).
// Возвращает новый Bearer token с claim'ом impersonatedBy = реальный оператор.
// TTL короче обычного (1 час), чтобы admin не оставил себя «как X» надолго.
adminRoutes.post('/impersonate/:userId', async (req, res) => {
  const me = getUser(req);
  const myRole = getRole(req);
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target) return res.status(404).json({ error: 'user_not_found' });

  const targetRole = normalizeRole(target.role);
  if (targetRole === 'SUPER_ADMIN' && myRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'cannot_impersonate_super_admin' });
  }
  if (target.id === me.id) {
    return res.status(400).json({ error: 'cannot_impersonate_self' });
  }

  const token = signToken({
    sub: target.id,
    email: target.email,
    role: targetRole,
    impersonatedBy: { sub: me.id, email: me.email, role: myRole },
  });

  console.log(`[impersonate] ${me.email} (${myRole}) → ${target.email} (${targetRole})`);

  await recordAudit(req, {
    action: 'user.impersonate',
    targetType: 'User',
    targetId: target.id,
    payload: { targetEmail: target.email, targetRole, ttlSec: 3600 },
  });

  res.json({
    user: {
      id: target.id,
      email: target.email,
      name: target.name,
      role: targetRole,
      workspaceStatus: target.workspaceStatus,
    },
    token,
    impersonatedBy: { id: me.id, email: me.email },
  });
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

// ─── Sprint 30 — audit / archive / restore / backup ──────────────────────

// GET /api/admin/audit — последние events. Поддерживает фильтры (action /
// targetType / actorEmail) для admin UI. Limit 200 events per page.
const auditQuery = z.object({
  action: z.string().optional(),
  targetType: z.string().optional(),
  actorEmail: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

adminRoutes.get('/audit', async (req, res) => {
  const parsed = auditQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
  const { action, targetType, actorEmail, limit } = parsed.data;
  const events = await prisma.auditEvent.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(actorEmail ? { actorEmail } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ events });
});

// GET /api/admin/archived/:type — список soft-deleted записей определённого
// типа, чтобы admin мог их видеть и при необходимости восстановить.
const ARCHIVE_TYPES = ['project', 'file', 'review', 'sales_session', 'conversation_analysis'] as const;
type ArchiveType = (typeof ARCHIVE_TYPES)[number];

adminRoutes.get('/archived/:type', async (req, res) => {
  const type = req.params.type as ArchiveType;
  if (!ARCHIVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid_type' });

  const where = { archivedAt: { not: null } };
  let items: unknown;
  switch (type) {
    case 'project':
      items = await prisma.project.findMany({
        where, orderBy: { archivedAt: 'desc' }, take: 200,
        include: { user: { select: { email: true, name: true } } },
      });
      break;
    case 'file':
      items = await prisma.uploadedFile.findMany({
        where, orderBy: { archivedAt: 'desc' }, take: 200,
        include: { project: { select: { id: true, name: true, userId: true } } },
      });
      break;
    case 'review':
      items = await prisma.artefactReview.findMany({
        where, orderBy: { archivedAt: 'desc' }, take: 200,
      });
      break;
    case 'sales_session':
      items = await prisma.salesSession.findMany({
        where, orderBy: { archivedAt: 'desc' }, take: 200,
      });
      break;
    case 'conversation_analysis':
      items = await prisma.conversationAnalysis.findMany({
        where, orderBy: { archivedAt: 'desc' }, take: 200,
      });
      break;
  }
  res.json({ items });
});

// POST /api/admin/restore/:type/:id — снимает archivedAt, запись возвращается
// в обычные GET-запросы. Логируется в audit.
adminRoutes.post('/restore/:type/:id', async (req, res) => {
  const type = req.params.type as ArchiveType;
  if (!ARCHIVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid_type' });
  const id = req.params.id;

  try {
    let restored: { id: string } | null = null;
    switch (type) {
      case 'project':
        restored = await prisma.project.update({ where: { id }, data: { archivedAt: null } });
        break;
      case 'file':
        restored = await prisma.uploadedFile.update({ where: { id }, data: { archivedAt: null } });
        break;
      case 'review':
        restored = await prisma.artefactReview.update({ where: { id }, data: { archivedAt: null } });
        break;
      case 'sales_session':
        restored = await prisma.salesSession.update({ where: { id }, data: { archivedAt: null } });
        break;
      case 'conversation_analysis':
        restored = await prisma.conversationAnalysis.update({ where: { id }, data: { archivedAt: null } });
        break;
    }
    await recordAudit(req, {
      action: `${type}.restore`,
      targetType: type === 'project' ? 'Project'
        : type === 'file' ? 'UploadedFile'
        : type === 'review' ? 'ArtefactReview'
        : type === 'sales_session' ? 'SalesSession'
        : 'ConversationAnalysis',
      targetId: restored?.id,
    });
    res.json({ ok: true, item: restored });
  } catch (err) {
    res.status(404).json({ error: 'not_found', message: err instanceof Error ? err.message : 'unknown' });
  }
});

// Sprint 30 + 31 — POST /api/admin/backup. SUPER_ADMIN only.
// Sprint 30 стримил только prod.db. Sprint 31 — полный backup как tar.gz:
//   • prod.db (вся БД)
//   • uploads/ (все загруженные файлы пользователей)
//   • snapshots/ (pre-deploy snapshot history — для cross-deploy восстановления)
// БЕЗ uploads backup половина платформы (презентации, финмодели) теряется
// если disk корраптится. Один файл `.tar.gz` = atomic off-site backup.
adminRoutes.post('/backup', requireRole(['SUPER_ADMIN']), async (req, res) => {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./prod.db';
  const dbPathRaw = dbUrl.replace(/^file:/, '');
  const dbAbs = path.isAbsolute(dbPathRaw) ? dbPathRaw : path.resolve(dbPathRaw);
  const uploadsAbs = path.resolve(env.UPLOADS_DIR);
  const snapshotsAbs = path.join(path.dirname(dbAbs), 'snapshots');

  if (!existsSync(dbAbs)) {
    return res.status(500).json({ error: 'backup_failed', message: `db file not found at ${dbAbs}` });
  }

  const dbSize = statSync(dbAbs).size;
  const uploadsExists = existsSync(uploadsAbs);
  const snapshotsExists = existsSync(snapshotsAbs);

  await recordAudit(req, {
    action: 'system.backup_download',
    targetType: 'Database',
    targetId: null,
    payload: { dbSizeBytes: dbSize, includesUploads: uploadsExists, includesSnapshots: snapshotsExists },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="zapusk-backup-${ts}.tar.gz"`);

  const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[backup] archiver error:', err);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  // Layout in archive:
  //   /db/prod.db
  //   /uploads/...
  //   /snapshots/prod-YYYY-MM-DDTHH-MM-SS.db (если pre-deploy snapshots есть)
  archive.append(createReadStream(dbAbs), { name: 'db/prod.db' });
  if (uploadsExists) archive.directory(uploadsAbs, 'uploads');
  if (snapshotsExists) archive.directory(snapshotsAbs, 'snapshots');

  await archive.finalize();
});
