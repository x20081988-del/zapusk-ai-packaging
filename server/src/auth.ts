import type { Request, Response, NextFunction } from 'express';
import { prisma } from './db.js';
import { env } from './env.js';
import { verifyToken } from './authCrypto.js';

// Sprint 25 — нормальная RBAC. SUPER_ADMIN — владелец платформы, видит всё,
// может impersonate. ADMIN — обычный админ Zapusk. MANAGER — менеджер
// проектов. FOUNDER — клиент-фаундер (бывший 'client'). INVESTOR —
// инвестор с отдельным UX (Opportunities / Portfolio / Secondary).
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FOUNDER', 'INVESTOR'];

// Sprint 25 — back-compat alias: pre-Sprint-25 значения роли остаются для
// логирования и обратной совместимости (например, x-user-role header в legacy
// скриптах). normalizeRole() сам приводит их к новой шкале.
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  client: 'FOUNDER',
  founder: 'FOUNDER',
  sales: 'MANAGER',
  demo: 'FOUNDER',
  viewer: 'FOUNDER',
  investor: 'INVESTOR',
};

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
        const enrichedReq = req as Request & {
          user: typeof user;
          role: UserRole;
          impersonatedBy?: { sub: string; email: string; role: UserRole };
        };
        enrichedReq.user = user;
        enrichedReq.role = normalizeRole(user.role);
        // Sprint 25 — пробрасываем impersonation claim, если он есть.
        if (claims.impersonatedBy) {
          enrichedReq.impersonatedBy = {
            sub: claims.impersonatedBy.sub,
            email: claims.impersonatedBy.email,
            role: normalizeRole(claims.impersonatedBy.role),
          };
        }
        return next();
      }
    }
    // Bearer present but invalid → 401 (не падаем на header fallback —
    // не даём атакующему обойти проверку через подмену header'а).
    return res.status(401).json({ error: 'invalid_token' });
  }

  // 2. Header back-compat: x-user-email. Sprint 35 P0.4 — в production
  // отключён по умолчанию; в dev/test остаётся включён. Включается явно через
  // ENABLE_HEADER_AUTH=true (для demo-инстанса). См. env.ts.
  const headerEmail = (req.header('x-user-email') ?? '').toLowerCase().trim();
  if (!headerEmail) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  if (!env.HEADER_AUTH_ALLOWED) {
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
  // Sprint 24: расширили возврат — workspaceStatus полезен для роутов,
  // которые фильтруют контент по demo/active state (см. /api/projects).
  return (req as Request & { user: { id: string; email: string; name: string | null; role?: string; workspaceStatus?: string } }).user;
}

export function getRole(req: Request): UserRole {
  const tagged = (req as Request & { role?: UserRole }).role;
  if (tagged) return tagged;
  // Sprint 19: fallback на user.role (если middleware не выставил .role).
  const user = (req as Request & { user?: { role?: string } }).user;
  return normalizeRole(user?.role ?? 'client');
}

export function normalizeRole(role: unknown): UserRole {
  const raw = String(role ?? '').trim();
  if (!raw) return 'FOUNDER';
  // Sprint 25: новый формат — UPPER_CASE. Если совпало — используем.
  if (ROLES.includes(raw as UserRole)) return raw as UserRole;
  // Old lowercase значения → mapping.
  const lower = raw.toLowerCase();
  if (LEGACY_ROLE_MAP[lower]) return LEGACY_ROLE_MAP[lower];
  // Также поддержка smartcast вроде 'admin' → 'ADMIN'.
  const upper = raw.toUpperCase();
  if (ROLES.includes(upper as UserRole)) return upper as UserRole;
  return 'FOUNDER';
}

export function requireRole(roles: Array<UserRole | string>) {
  // Sprint 25: нормализуем входные роли. Старый код мог писать
  // requireRole(['admin']) — теперь это эквивалент requireRole(['ADMIN']).
  // SUPER_ADMIN автоматически проходит везде, где требуется ADMIN.
  const normalized = new Set<UserRole>(roles.map((r) => normalizeRole(r)));
  // SUPER_ADMIN inherits ADMIN access by design.
  if (normalized.has('ADMIN')) normalized.add('SUPER_ADMIN');
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRole(req);
    if (!normalized.has(role)) {
      return res.status(403).json({ error: 'forbidden', requiredRole: Array.from(normalized), role });
    }
    next();
  };
}

// Sprint 25 — explicit guard для super-admin-only операций. Используется на
// impersonate, system settings, любых destructive admin ops.
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRole(req);
    if (role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'forbidden', requiredRole: ['SUPER_ADMIN'], role });
    }
    next();
  };
}
