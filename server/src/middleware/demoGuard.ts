import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';

// In a public demo every visitor shares a single dev user. Destructive actions
// from one anonymous browser would wipe state for everyone else, so we lock
// them down with a tiny middleware. Toggles via DEMO_MODE=true.
//
// What we lock:
//   - any DELETE on /api/*
//   - PATCH/POST on /api/templates (shared library, edits leak across visitors)
// Everything else (creating projects, uploading files, generating, reviewing)
// still works — that's the whole point of letting visitors play.

export function demoGuard(req: Request, res: Response, next: NextFunction) {
  if (!env.DEMO_MODE) return next();

  const path = req.path;
  const method = req.method;

  if (method === 'DELETE' && path.startsWith('/')) {
    return res.status(403).json({
      error: 'demo_mode_locked',
      message: 'Демо-режим: удаление отключено, чтобы другие гости видели свои данные.',
    });
  }

  if (path.startsWith('/templates') && (method === 'PATCH' || method === 'POST')) {
    return res.status(403).json({
      error: 'demo_mode_locked',
      message: 'Демо-режим: библиотека шаблонов общая, редактирование заблокировано.',
    });
  }

  return next();
}
