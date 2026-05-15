import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.js';

// Sprint 22 — Access middleware поверх authMiddleware.
//
// Архитектура invite-only требует, чтобы каждый запрос проверял не только
// «авторизован ли пользователь», но и «активен ли его workspace». Воронка:
//   lead              → нет доступа (только signup-flow)
//   demo              → readonly: видит UI, но writes блокируются
//   approved          → readonly: контракт ещё не подписан
//   awaiting_payment  → readonly: ждём оплату
//   active            → полный доступ
//   paused / archived → нет доступа (login уже их блокирует, но defensive)
//
// Middleware'а два:
//   • requireActiveWorkspace — пускает active + demo + approved + awaiting_payment
//     (всех, кто легитимно зашёл в UI). Блокирует lead/paused/archived.
//   • requireWriteAccess — пускает ТОЛЬКО active. Demo и awaiting_payment видят
//     UI, но мутации (POST/PATCH/DELETE) возвращают 403 readonly_workspace.
//
// На /api/auth/* эти middleware НЕ применяются — login/signup/demo доступны
// до workspace-проверки.

const READ_ALLOWED = new Set(['active', 'demo', 'approved', 'awaiting_payment']);
const WRITE_ALLOWED = new Set(['active']);

// Sprint 34A — допуск AI-inference endpoints для demo workspace.
// Эти POST-ы не пишут в БД клиента, это compute-only:
//   • /sales-assistant/analyze — анализ transcript'а, возвращает карточку
//     SPIN, никаких prisma.create/update.
// Демо-юзер должен видеть AI-копилот в действии — это и есть demo value.
// Реальные write-операции (brief generate, file upload, packaging job)
// остаются заблокированы для demo через стандартный readonly guard.
const DEMO_INFERENCE_ALLOW = new Set<string>([
  '/sales-assistant/analyze',
  '/sales-assistant/analyze-fast', // Sprint 34В — fast tactical endpoint, тоже compute-only
]);

interface AuthedRequest extends Request {
  user?: { id: string; email: string; role?: string; workspaceStatus?: string };
}

export function requireActiveWorkspace(req: AuthedRequest, res: Response, next: NextFunction) {
  // Если req.user не выставлен — это значит, что authMiddleware ещё не сработал
  // (например, public route или ошибка). Пропускаем — нижестоящие middleware
  // вернут 401 при необходимости.
  if (!req.user) return next();

  const status = req.user.workspaceStatus ?? 'lead';
  const method = req.method;
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  // Sprint 22: единый guard — readonly для demo/approved/awaiting_payment
  // (можно читать UI, нельзя мутировать), полный allow для active, полный
  // блок для lead/paused/archived.
  if (status === 'active') return next();

  if (READ_ALLOWED.has(status)) {
    // Write attempt от demo/approved/awaiting_payment → 403 readonly,
    // КРОМЕ inference-endpoints из DEMO_INFERENCE_ALLOW (Sprint 34A).
    if (isWrite && !DEMO_INFERENCE_ALLOW.has(req.path)) {
      return res.status(403).json({
        error: 'workspace_readonly',
        workspaceStatus: status,
        message: workspaceMessage(status, true),
      });
    }
    return next();
  }

  // lead / paused / archived — никаких прав.
  return res.status(403).json({
    error: 'workspace_not_active',
    workspaceStatus: status,
    message: workspaceMessage(status),
  });
}

export function requireWriteAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  // Только write-методы. GET всегда пропускаем (read-only при demo).
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const status = req.user?.workspaceStatus ?? 'lead';
  if (WRITE_ALLOWED.has(status)) return next();
  return res.status(403).json({
    error: 'workspace_readonly',
    workspaceStatus: status,
    message: workspaceMessage(status, true),
  });
}

// Sprint 22: combined gate для глобального применения на /api в index.ts.
// Сначала прогоняет authMiddleware (Bearer / header), потом проверяет
// workspaceStatus. Если auth не прошёл — middleware из auth.ts вернёт 401
// сам. Если прошёл — мы решаем по workspaceStatus.
export function authedAndActive(req: AuthedRequest, res: Response, next: NextFunction): void {
  authMiddleware(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (res.headersSent) return; // auth ответил 401 — выходим
    requireActiveWorkspace(req, res, next);
  });
}

function workspaceMessage(status: string, write = false): string {
  if (status === 'lead') return 'Доступ ещё не открыт. Дождитесь приглашения после demo и approval.';
  if (status === 'demo') return write ? 'Демо-режим: чтение разрешено, изменения недоступны. Свяжитесь с менеджером ZAPUSK AI.' : 'Демо-режим.';
  if (status === 'approved') return write ? 'Workspace одобрен, но ещё не активирован — ждём оплату.' : 'Workspace одобрен.';
  if (status === 'awaiting_payment') return write ? 'Ожидаем оплату. Свяжитесь с менеджером, чтобы активировать workspace.' : 'Ожидаем оплату.';
  if (status === 'paused') return 'Workspace приостановлен. Свяжитесь с менеджером ZAPUSK AI.';
  if (status === 'archived') return 'Workspace архивирован.';
  return 'Доступ ограничен.';
}
