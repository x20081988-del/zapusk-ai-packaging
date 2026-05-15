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

// Sprint 37 P2 — retention/cleanup roadmap (architecture only, не реализовано).
//
// Что планируется в Sprint 38+:
//
// 1. **Archived uploads cleanup** — UploadedFile.archivedAt > now - 30d
//    физически удаляется со storage (storage.remove(file.path)) + строка в DB
//    помечается deletedAt. Hardcleanup идёт батчем 100/раз, чтобы не блокировать
//    основной поток. Все физические удаления пишут audit `file.hard_delete`.
//
// 2. **Old generated docs/prompts** — версии старше N (например, версии
//    кроме последних 10) с archivedAt > 90d можно физически чистить — append-only
//    история перестаёт быть полезной за этим горизонтом. Сохраняем metadata
//    в audit, тело удаляем.
//
// 3. **Audit log retention** — самих audit-строк со временем накапливается
//    много (особенно read-sensitive после Sprint 37). Политика: 365 дней для
//    регуляторного аудита, потом архивируем в холодное хранилище / удаляем.
//
// 4. **Implementation** — cron-задача на Render (или systemd timer для self-host)
//    раз в сутки: scripts/cleanup.ts → проходится по соблюдённым retention windows.
//    Сначала dry-run-режим с логом «что бы удалил», потом включаем по факту.
//
// Реализация не входит в Sprint 37 — данных пока мало, storage свободен.
// Этот комментарий — точка входа для следующего раунда инфраструктурных
// улучшений.
