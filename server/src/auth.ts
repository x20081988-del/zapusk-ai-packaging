import type { Request, Response, NextFunction } from 'express';
import { prisma } from './db.js';
import { env } from './env.js';

export type UserRole = 'client' | 'manager' | 'admin';

const ROLES: UserRole[] = ['client', 'manager', 'admin'];

// MVP auth: a single dev user, identified by the `x-user-email` header
// (set by the web client after /login). Easy to replace with JWT / session later.
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const email = (req.header('x-user-email') ?? env.DEV_USER_EMAIL).toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: email === env.DEV_USER_EMAIL.toLowerCase() ? env.DEV_USER_NAME : email },
    });
  }
  (req as Request & { user: typeof user }).user = user;
  next();
}

export function getUser(req: Request) {
  return (req as Request & { user: { id: string; email: string; name: string | null } }).user;
}

export function getRole(req: Request): UserRole {
  const role = (req.header('x-user-role') ?? '').toLowerCase();
  return ROLES.includes(role as UserRole) ? role as UserRole : 'client';
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
