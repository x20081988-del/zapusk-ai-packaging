import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, normalizeRole } from '../auth.js';
import { hashPassword, signToken, verifyPassword } from '../authCrypto.js';

export const authRoutes = Router();

// Sprint 19: реальная регистрация по email/password.
// • password >=8 символов (валидация);
// • email уникален (DB constraint);
// • пароль хранится как scrypt:salt:hash через node:crypto;
// • роль нового пользователя всегда 'client'. Admin/manager — только через
//   seed (DEMO_USERS) или ручной апдейт БД.

// Sprint 22 — invite-only architecture. Signup без inviteToken'а закрыт.
// Платформа B2B / investment-infrastructure: доступ выдаётся через
// admin/sales после demo + approval + payment.
const signupSchema = z.object({
  name: z.string().trim().min(1, 'Имя обязательно').max(120),
  email: z.string().trim().toLowerCase().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(256),
  // Sprint 22: обязательный поле. Без валидного invite — 403.
  inviteToken: z.string().trim().min(16, 'Нужен код приглашения'),
});

authRoutes.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  }
  const { name, email, password, inviteToken } = parsed.data;

  // Sprint 22: проверяем invite — единственный путь регистрации.
  const invite = await prisma.inviteToken.findUnique({ where: { token: inviteToken } });
  if (!invite) {
    return res.status(403).json({ error: 'invite_invalid' });
  }
  if (invite.revokedAt) {
    return res.status(403).json({ error: 'invite_revoked' });
  }
  if (invite.usedAt) {
    return res.status(403).json({ error: 'invite_used' });
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return res.status(403).json({ error: 'invite_expired' });
  }
  // Если invite привязан к email — он должен совпасть.
  if (invite.email && invite.email.toLowerCase() !== email) {
    return res.status(403).json({ error: 'invite_email_mismatch' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'email_taken' });
  }

  // Sprint 25: invite.role хранится в новой шкале (SUPER_ADMIN/ADMIN/...).
  // normalizeRole() гарантирует, что даже если что-то старое пролезло —
  // мы получим валидное новое значение.
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: normalizeRole(invite.role),
      workspaceStatus: invite.workspaceStatus,
      lastLoginAt: new Date(),
    },
  });

  // Помечаем invite использованным — single-use гарантированно.
  await prisma.inviteToken.update({
    where: { id: invite.id },
    data: { usedAt: new Date(), usedByUserId: user.id },
  });

  const role = normalizeRole(user.role);
  const token = signToken({ sub: user.id, email: user.email, role });
  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role, workspaceStatus: user.workspaceStatus },
    token,
  });
});

// Sprint 22 — read-only invite check endpoint. Фронт открывает /signup?invite=X
// и сразу зовёт это, чтобы показать (а) валиден ли invite, (б) для какого
// email он выпущен (предзаполнить форму). Без auth.
authRoutes.get('/invite/:token', async (req, res) => {
  const invite = await prisma.inviteToken.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.revokedAt || invite.usedAt) {
    return res.status(404).json({ error: 'invite_not_available' });
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return res.status(410).json({ error: 'invite_expired' });
  }
  res.json({
    invite: {
      email: invite.email,
      role: invite.role,
      workspaceStatus: invite.workspaceStatus,
      note: invite.note,
    },
  });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRoutes.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed' });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish response: не различаем «пользователь не найден» и «пароль
  // неверный» — это закрывает enumeration attack.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  // Sprint 22: блокируем login для archived/paused workspace'ов на этом
  // же шаге — пользователь видит понятный код ошибки, не доходит до
  // middleware-stage с 403. lead / awaiting_payment / demo / approved / active
  // допускаются — фронт сам решит что показать.
  if (user.workspaceStatus === 'archived') {
    return res.status(403).json({ error: 'workspace_archived' });
  }
  if (user.workspaceStatus === 'paused') {
    return res.status(403).json({ error: 'workspace_paused' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const role = normalizeRole(user.role);
  const token = signToken({ sub: user.id, email: user.email, role });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role, workspaceStatus: user.workspaceStatus },
    token,
  });
});

// Sprint 19: demo endpoint для quick-логина под ролью без пароля.
// Используется кнопками «Войти как клиент / менеджер / админ» на /login.
// На реальном production тенанте можно отключить через DISABLE_DEMO_LOGIN=true.
// Sprint 25 — demo endpoint остаётся для legacy скриптов и dev-tooling.
// Принимает и старые и новые имена ролей.
const demoSchema = z.object({
  role: z.string(),
  /** Опциональный кастомный email (по умолчанию demo-{role}@zapusk.tech). */
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
});

authRoutes.post('/demo', async (req, res) => {
  if (process.env.DISABLE_DEMO_LOGIN === 'true') {
    return res.status(403).json({ error: 'demo_login_disabled' });
  }
  const parsed = demoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'validation_failed' });
  const { role: rawRole, email: customEmail, name: customName } = parsed.data;
  // Sprint 25 — пропускаем role через normalizeRole, чтобы 'admin'/'manager'/
  // 'client' из старых скриптов автоматически становились 'ADMIN'/'MANAGER'/
  // 'FOUNDER'. Email слаг тоже унифицируем через lowercase role-имени.
  const role = normalizeRole(rawRole);
  const emailSlug = role.toLowerCase().replace('_', '-');
  const email = (customEmail ?? `demo-${emailSlug}@zapusk.tech`).toLowerCase();
  const name = customName ?? defaultDemoName(role);

  // Upsert: demo-аккаунты переиспользуются между сессиями. role обновляется
  // при каждом входе — это сознательное MVP-поведение для demo-кабинета.
  // Sprint 22: team demo accounts получают workspaceStatus='active' — это
  // внутренний инструмент, не выдача доступа клиенту.
  const user = await prisma.user.upsert({
    where: { email },
    update: { role, name, workspaceStatus: 'active', lastLoginAt: new Date() },
    create: { email, name, role, workspaceStatus: 'active', lastLoginAt: new Date() },
  });

  const token = signToken({ sub: user.id, email: user.email, role });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role, workspaceStatus: user.workspaceStatus },
    token,
    demo: true,
  });
});

function defaultDemoName(role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR'): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'Demo Super-admin';
    case 'ADMIN': return 'Demo Admin';
    case 'MANAGER': return 'Demo Manager';
    case 'INVESTOR': return 'Demo Investor';
    default: return 'Demo Founder';
  }
}

// /me — текущий профиль (по Bearer или header back-compat).
// Sprint 22: возвращаем workspaceStatus — фронт реагирует (показать
// «awaiting payment» баннер, спрятать write UI для 'demo' и т.д.).
// Sprint 25: + impersonatedBy claim для красной плашки «вы вошли как X».
authRoutes.get('/me', authMiddleware, async (req, res) => {
  const r = req as typeof req & {
    user: { id: string; email: string; name: string | null; role?: string; workspaceStatus?: string };
    impersonatedBy?: { sub: string; email: string; role: string };
  };
  res.json({
    user: {
      id: r.user.id,
      email: r.user.email,
      name: r.user.name,
      role: normalizeRole(r.user.role),
      workspaceStatus: r.user.workspaceStatus ?? 'active',
    },
    impersonatedBy: r.impersonatedBy
      ? { email: r.impersonatedBy.email, role: r.impersonatedBy.role }
      : null,
  });
});
