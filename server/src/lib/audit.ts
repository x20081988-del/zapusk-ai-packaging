import type { Request } from 'express';
import { prisma } from '../db.js';

// Sprint 30 — audit log helper. Любая destructive operation (delete / archive /
// status change / impersonate / invite revoke / backup download) пишет одну
// строку в AuditEvent. Бессрочное хранение — forensic data важнее места.
//
// Pattern: после успешной mutation вызвать `recordAudit(req, action, ...)`.
// Помечает actorId / actorEmail / actorRole из JWT user.

type ReqWithUser = Request & {
  user?: { id: string; email: string; role?: string };
};

export interface AuditPayload {
  action: string;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function recordAudit(req: Request, evt: AuditPayload): Promise<void> {
  const r = req as ReqWithUser;
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: r.user?.id ?? null,
        actorEmail: r.user?.email ?? null,
        actorRole: r.user?.role ?? null,
        action: evt.action,
        targetType: evt.targetType,
        targetId: evt.targetId ?? null,
        payload: evt.payload ? JSON.stringify(evt.payload) : null,
      },
    });
  } catch (err) {
    // Audit write failure не должна валить mutation. Логируем в console,
    // но не пробрасываем — пользовательский запрос уже выполнен.
    console.error('[audit] failed to record event', evt.action, err);
  }
}

// Sprint 30 — soft-delete helper. archivedAt = null → живой, archivedAt = Date
// → в корзине. По умолчанию 30 дней grace period перед физическим cleanup
// (cleanup пока вручную / scheduled task — out of scope для Sprint 30).
export const ARCHIVE_RETENTION_DAYS = 30;
