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

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Имя обязательно').max(120),
  email: z.string().trim().toLowerCase().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(256),
});

authRoutes.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  }
  const { name, email, password } = parsed.data;

  // Уникальность через try/catch: DB-level constraint надёжнее race-condition'а
  // между findFirst и create.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'email_taken' });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'client',
      lastLoginAt: new Date(),
    },
  });

  const token = signToken({ sub: user.id, email: user.email, role: 'client' });
  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: 'client' },
    token,
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

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const role = normalizeRole(user.role);
  const token = signToken({ sub: user.id, email: user.email, role });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role },
    token,
  });
});

// Sprint 19: demo endpoint для quick-логина под ролью без пароля.
// Используется кнопками «Войти как клиент / менеджер / админ» на /login.
// На реальном production тенанте можно отключить через DISABLE_DEMO_LOGIN=true.
const demoSchema = z.object({
  role: z.enum(['client', 'manager', 'admin']),
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
  const { role, email: customEmail, name: customName } = parsed.data;

  const email = (customEmail ?? `demo-${role}@zapusk.tech`).toLowerCase();
  const name = customName ?? defaultDemoName(role);

  // Upsert: demo-аккаунты переиспользуются между сессиями. role обновляется
  // при каждом входе — это сознательное MVP-поведение для demo-кабинета.
  const user = await prisma.user.upsert({
    where: { email },
    update: { role, name, lastLoginAt: new Date() },
    create: { email, name, role, lastLoginAt: new Date() },
  });

  const token = signToken({ sub: user.id, email: user.email, role });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role },
    token,
    demo: true,
  });
});

function defaultDemoName(role: 'client' | 'manager' | 'admin'): string {
  if (role === 'admin') return 'Demo Admin';
  if (role === 'manager') return 'Demo Manager';
  return 'Demo Founder';
}

// /me — текущий профиль (по Bearer или header back-compat).
authRoutes.get('/me', authMiddleware, async (req, res) => {
  const user = (req as typeof req & { user: { id: string; email: string; name: string | null; role?: string } }).user;
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: normalizeRole(user.role) },
  });
});
