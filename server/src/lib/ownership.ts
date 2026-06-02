import type { Request, Response, NextFunction } from 'express';
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

// Sprint 37 P0.4 — гейт «не-investor». INVESTOR — это инвестор-side роль,
// её UX состоит из read-only списков и собственного портфеля. Она ДОЛЖНА
// быть отрезана от founder-flow routes: create/edit/delete projects, uploads,
// brief generate, prompts, packaging jobs, sales-assistant, sales-sessions,
// conversation-analysis ingest. SUPER_ADMIN/ADMIN/MANAGER/FOUNDER — пропускаем.
//
// Не используем requireRole(['FOUNDER','MANAGER','ADMIN','SUPER_ADMIN'])
// напрямую потому, что хочется явный 403 invest_forbidden, а не общий
// 'forbidden' — фронту удобнее отрисовать таргетированную плашку.
export function requireNotInvestor() {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getActorRole(req);
    if (role === 'INVESTOR') {
      return res.status(403).json({
        error: 'investor_forbidden',
        message: 'Эта операция доступна только фаундерам и команде платформы.',
      });
    }
    return next();
  };
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

// Sprint 62.P11 — read-доступ к ресурсам проекта с учётом demo-витрины.
// В отличие от assertProjectOwnership (write-путь, founder только свои), это
// READ-guard: demo-viewer (workspaceStatus='demo'), включая INVESTOR, может
// читать ресурсы любого isDemo-проекта (packaging jobs, материалы). Owner —
// свои. Admin-like — всё. Non-demo/archived проекты demo-зрителю отдаются 404
// (без утечки факта существования). Write по-прежнему через requireNotInvestor
// + assertProjectOwnership.
export async function assertCanReadProject(
  req: Request,
  projectId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const role = getActorRole(req);
  if (isAdminLike(role)) return { ok: true };
  if (!projectId) return { ok: false, status: 404, error: 'project_not_found' };

  const user = getUser(req) as { id: string; workspaceStatus?: string };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, isDemo: true, archivedAt: true },
  });
  if (!project || project.archivedAt) return { ok: false, status: 404, error: 'project_not_found' };
  if (project.userId === user.id) return { ok: true };
  if (user.workspaceStatus === 'demo' && project.isDemo) return { ok: true };
  return { ok: false, status: 404, error: 'project_not_found' };
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
