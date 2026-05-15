import type { Request } from 'express';
import { prisma } from '../db.js';
import { getRole, getUser, normalizeRole, type UserRole } from '../auth.js';

// Sprint 35 P0.3 — единый guard «видит ли user эту запись».
//
// Роли:
//   • SUPER_ADMIN / ADMIN / MANAGER — admin-like read/write на любые записи.
//   • FOUNDER — только записи своих проектов (project.userId = user.id).
//   • Orphan записи без projectId — admin-like only.
//
// Контракт: helper'ы возвращают bool. Маршрут сам решает 403/404 (предпочтительно
// 404, чтобы не палить, что запись существует у другого пользователя).

export function isAdminLike(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
}

export function getActorRole(req: Request): UserRole {
  return normalizeRole(getRole(req));
}

export async function assertProjectOwnership(
  req: Request,
  projectId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const role = getActorRole(req);
  if (isAdminLike(role)) return { ok: true };

  // founder: orphan-проектов у него быть не должно.
  if (!projectId) return { ok: false, status: 403, error: 'project_required' };

  const user = getUser(req);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) return { ok: false, status: 404, error: 'project_not_found' };
  if (project.userId !== user.id) return { ok: false, status: 404, error: 'project_not_found' };
  return { ok: true };
}

// Применимо к записям с опциональным projectId (SalesSession, ConversationAnalysis).
// Founder видит запись только если она привязана к его проекту.
export function canFounderSeeRecord(
  record: { projectId: string | null } & Record<string, unknown>,
  ownedProjectIds: Set<string>,
): boolean {
  if (!record.projectId) return false; // orphan → admin only
  return ownedProjectIds.has(record.projectId);
}

export async function listOwnedProjectIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.project.findMany({
    where: { userId },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
