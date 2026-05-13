import type { Request, Response, NextFunction } from 'express';
import { prisma } from './db.js';
import { env } from './env.js';
import { verifyToken } from './authCrypto.js';

export type UserRole = 'client' | 'manager' | 'admin';

const ROLES: UserRole[] = ['client', 'manager', 'admin'];

// Sprint 19: auth middleware теперь поддерживает два источника:
//   1. Authorization: Bearer <jwt>  — основной способ (signup / login через
//      пароль). Token подписан HS256 с JWT_SECRET, содержит userId + role.
//   2. x-user-email + x-user-role headers — back-compat для demo-логина и
//      старых интеграционных тестов. На demo-инстансе это удобный путь,
//      на production должен быть отключён (DISABLE_HEADER_AUTH=true).
//
// Если ни один не сработал — 401 unauthenticated. Раньше middleware молча
// upsert'ил пользователя для любого email из header'а; теперь — нет, чтобы
// предотвратить privilege escalation через x-user-role: admin.
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Bearer JWT
  const auth = req.header('authorization') ?? '';
  const bearerMatch = /^bearer\s+(.+)$/i.exec(auth);
  if (bearerMatch) {
    const claims = verifyToken(bearerMatch[1].trim());
    if (claims) {
      const user = await prisma.user.findUnique({ where: { id: claims.sub } });
      if (user) {
        (req as Request & { user: typeof user; role: UserRole }).user = user;
        (req as Request & { user: typeof user; role: UserRole }).role = normalizeRole(user.role);
        return next();
      }
    }
    // Bearer present but invalid → 401 (не падаем на header fallback —
    // не даём атакующему обойти проверку через подмену header'а).
    return res.status(401).json({ error: 'invalid_token' });
  }

  // 2. Header back-compat: x-user-email. Включён по умолчанию на demo-URL'ах,
  // отключается на реальном production tenant через DISABLE_HEADER_AUTH=true.
  // Это компромисс: новые signup/login клиенты используют Bearer; старые
  // demo-flows и интеграционные скрипты продолжают работать через header
  // до момента отказа от них.
  const headerAuthDisabled = process.env.DISABLE_HEADER_AUTH === 'true';

  const headerEmail = (req.header('x-user-email') ?? '').toLowerCase().trim();
  if (!headerEmail) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  if (headerAuthDisabled) {
    return res.status(401).json({ error: 'unauthenticated', hint: 'header_auth_disabled' });
  }

  // Dev/demo path: upsert (back-compat с прежним поведением) — но НЕ берём
  // role из заголовка x-user-role; role теперь только из БД. Если пользователя
  // нет — создаём с role='client' и null password. Это позволяет существующим
  // demo-скриптам продолжать работать без явного signup.
  const user = await prisma.user.upsert({
    where: { email: headerEmail },
    update: {},
    create: {
      email: headerEmail,
      name: headerEmail === env.DEV_USER_EMAIL.toLowerCase() ? env.DEV_USER_NAME : headerEmail,
      role: 'client',
    },
  });

  (req as Request & { user: typeof user; role: UserRole }).user = user;
  (req as Request & { user: typeof user; role: UserRole }).role = normalizeRole(user.role);
  next();
}

export function getUser(req: Request) {
  return (req as Request & { user: { id: string; email: string; name: string | null; role?: string } }).user;
}

export function getRole(req: Request): UserRole {
  const tagged = (req as Request & { role?: UserRole }).role;
  if (tagged) return tagged;
  // Sprint 19: fallback на user.role (если middleware не выставил .role).
  const user = (req as Request & { user?: { role?: string } }).user;
  return normalizeRole(user?.role ?? 'client');
}

export function normalizeRole(role: unknown): UserRole {
  const r = String(role ?? '').toLowerCase();
  return ROLES.includes(r as UserRole) ? (r as UserRole) : 'client';
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRole(req);
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden', requiredRole: roles, role });
    }
    next();
  };
}
