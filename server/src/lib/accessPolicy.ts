import type { Request } from 'express';
import { prisma } from '../db.js';
import type { UserRole } from '../auth.js';
import { getUser } from '../auth.js';
import { assertProjectOwnership, getActorRole, isAdminLike } from './ownership.js';

// Sprint 50 P0.3 — single source of truth for read/write authorization.
//
// Why this exists: ownership rules used to live inline in every route.
// Sprint 49 hotfixes 10–12 exposed the cost: orphan support for
// SalesSession + ConversationAnalysis had to be retro-fitted into four
// different files, each subtly different. This module collapses them
// into named predicates that every route uses verbatim.
//
// Goal for Sprint 50 first cut: preserve current behavior exactly. The
// predicates delegate to the existing helpers (`assertProjectOwnership`,
// `isAdminLike`) under the hood so a passing tsc-and-smoke is proof of
// equivalence. Future sprints can move the logic inward without changing
// call-sites.
//
// Conventions:
//   - investor is universally denied write paths via requireNotInvestor()
//     at the router level; predicates here assume the middleware has
//     already filtered investors out of mutation routes. Read predicates
//     return false for investor explicitly.
//   - 404 vs 403 is a route-level choice (we usually 404 to avoid leaking
//     existence). The predicates only answer yes/no; routes decide the
//     status code.
//   - admin-like (`SUPER_ADMIN`, `ADMIN`, `MANAGER`) sees everything;
//     `MANAGER` is currently equivalent to `ADMIN` for these predicates —
//     manager-assignment narrowing is a Sprint 51+ concern (P0.3 spec
//     explicitly defers it).

export type AccessResult = { allowed: true } | { allowed: false; reason: string };

function actorContext(req: Request): { role: UserRole; userId: string } {
  return { role: getActorRole(req), userId: getUser(req).id };
}

// ─── Project ──────────────────────────────────────────────────────────────

export async function actorCanReadProject(req: Request, projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false; // we never expose a "list all projects" path through here
  const { role } = actorContext(req);
  if (isAdminLike(role)) return true;
  const r = await assertProjectOwnership(req, projectId);
  return r.ok === true;
}

export async function actorCanWriteProject(req: Request, projectId: string): Promise<boolean> {
  // Today: same predicate as read. INVESTOR is blocked by requireNotInvestor()
  // at the router; founders only write their own. Manager assignment is
  // Sprint 51+ work — for now manager/admin can write any project the
  // founder owns.
  return actorCanReadProject(req, projectId);
}

export async function actorCanArchiveProject(req: Request, projectId: string): Promise<boolean> {
  // Same gate as write. Admin/manager preserved for support flows.
  return actorCanReadProject(req, projectId);
}

export async function actorCanDownloadFile(req: Request, projectId: string): Promise<boolean> {
  // File downloads go through this gate. Founders can download files
  // belonging to their own projects; admin/manager any. INVESTOR is
  // blocked at the router (requireNotInvestor on filesRoutes).
  return actorCanReadProject(req, projectId);
}

// ─── SalesSession ─────────────────────────────────────────────────────────

export async function actorCanReadSalesSession(
  req: Request,
  session: { projectId: string | null; createdById: string | null },
): Promise<boolean> {
  const { role, userId } = actorContext(req);
  if (isAdminLike(role)) return true;
  // Sprint 49 hotfix 10 — orphan sessions are visible to their author.
  if (session.createdById && session.createdById === userId) return true;
  if (session.projectId) {
    const r = await assertProjectOwnership(req, session.projectId);
    if (r.ok) return true;
  }
  return false;
}

// ─── ConversationAnalysis ────────────────────────────────────────────────

export async function actorCanReadConversationAnalysis(
  req: Request,
  record: { projectId: string | null; createdById: string | null },
): Promise<boolean> {
  const { role, userId } = actorContext(req);
  if (isAdminLike(role)) return true;
  // Sprint 48A — ConversationAnalysis has createdById; orphan-by-author allowed.
  if (record.createdById && record.createdById === userId) return true;
  if (record.projectId) {
    const r = await assertProjectOwnership(req, record.projectId);
    if (r.ok) return true;
  }
  return false;
}

// ─── AssistantOutcome ────────────────────────────────────────────────────

export interface OutcomeAccessTarget {
  id: string;
  projectId: string | null;
  salesSessionId: string | null;
  conversationAnalysisId: string | null;
  adviceEventId: string | null;
  createdById: string | null;
}

export async function actorCanReadAssistantOutcome(
  req: Request,
  outcome: OutcomeAccessTarget,
): Promise<boolean> {
  const { role, userId } = actorContext(req);
  if (isAdminLike(role)) return true;
  // Sprint 49 hotfix 12 — own-outcome fast path. The user always owns the
  // outcomes they authored, regardless of which FK they linked.
  if (outcome.createdById === userId) return true;
  if (outcome.projectId) {
    const r = await assertProjectOwnership(req, outcome.projectId);
    if (r.ok) return true;
  }
  if (outcome.salesSessionId) {
    const s = await prisma.salesSession.findUnique({
      where: { id: outcome.salesSessionId },
      select: { projectId: true, createdById: true },
    });
    if (s && await actorCanReadSalesSession(req, s)) return true;
  }
  if (outcome.conversationAnalysisId) {
    const c = await prisma.conversationAnalysis.findUnique({
      where: { id: outcome.conversationAnalysisId },
      select: { projectId: true, createdById: true },
    });
    if (c && await actorCanReadConversationAnalysis(req, c)) return true;
  }
  if (outcome.adviceEventId) {
    const ev = await prisma.assistantAdviceEvent.findUnique({
      where: { id: outcome.adviceEventId },
      select: { actorId: true, projectId: true },
    });
    if (ev?.actorId === userId) return true;
    if (ev?.projectId) {
      const r = await assertProjectOwnership(req, ev.projectId);
      if (r.ok) return true;
    }
  }
  return false;
}

// ─── KnowledgeSource ─────────────────────────────────────────────────────

export async function actorCanManageKnowledgeSource(req: Request): Promise<boolean> {
  // Sprint 39 — knowledge base is admin / manager / super_admin only.
  // Founders consume KB through retrieval (read-only via the AI pipeline)
  // and have no direct management endpoints.
  const { role } = actorContext(req);
  return isAdminLike(role);
}

// ─── Convenience adapters for routes that prefer the structured result ──

export async function readProjectOrFail(req: Request, projectId: string | null | undefined): Promise<AccessResult> {
  if (!projectId) return { allowed: false, reason: 'project_required' };
  return (await actorCanReadProject(req, projectId))
    ? { allowed: true }
    : { allowed: false, reason: 'forbidden' };
}
