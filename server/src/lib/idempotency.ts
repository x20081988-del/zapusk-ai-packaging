import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { getUser } from '../auth.js';

// Sprint 50 P0.1 — idempotency middleware.
//
// Contract for clients:
//   - send header X-Idempotency-Key on every mutating request you want
//     replay-safe (double-click "Завершить встречу", retried fetch, etc.);
//   - the value should be a UUID-shaped opaque string ≥ 16 chars;
//   - the same (key, actor, route, body) replays the cached response;
//   - the same (key, actor, route) with a different body returns 409.
//
// Contract for server code:
//   - mount `withIdempotency()` on the routes you want protected. The
//     middleware short-circuits with the saved response when a hit lands.
//   - if no header is supplied the middleware passes through — back-compat.
//   - we only cache responses with status >= 200 and < 500 (no point
//     replaying transient infra failures).

const TTL_HOURS = 24;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const MAX_RESPONSE_BYTES = 64 * 1024; // skip caching giant payloads

export function withIdempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.header('X-Idempotency-Key') ?? req.header('x-idempotency-key');
    if (!rawKey) return next();
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
      res.status(400).json({ error: 'idempotency_key_invalid_length' });
      return;
    }
    const actor = (req as { user?: { id?: string } }).user;
    const actorId = actor?.id;
    if (!actorId) return next(); // unauthed paths can't dedupe per-actor

    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const requestHash = hashBody(req.body);

    const existing = await prisma.idempotencyKey.findUnique({
      where: { key_actorId_route: { key, actorId, route } },
    }).catch((err) => {
      // Idempotency must never block the legit path: if the lookup fails
      // (e.g. table missing during a botched migration) we let the request
      // through without dedupe and log a warning.
      console.warn('[idempotency] lookup failed; passthrough:', err instanceof Error ? err.message : err);
      return null;
    });

    if (existing) {
      if (existing.expiresAt < new Date()) {
        // Stale row — let this request proceed and overwrite below.
      } else if (existing.requestHash !== requestHash) {
        res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'Key reused with a different request body. Use a fresh key for new mutations.',
        });
        return;
      } else {
        // Cache hit — replay.
        let parsed: unknown = null;
        try { parsed = JSON.parse(existing.responseJson); } catch { parsed = null; }
        res.status(existing.statusCode).json(parsed);
        return;
      }
    }

    // No fresh hit — capture the response after the route handler runs.
    captureResponse(req, res, () => {
      const status = res.statusCode;
      if (status < 200 || status >= 500) return; // don't cache 5xx
      const body = (res as { _idempotencyBody?: unknown })._idempotencyBody;
      if (body === undefined) return;
      const json = safeStringify(body);
      if (!json || Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES) return;
      prisma.idempotencyKey.upsert({
        where: { key_actorId_route: { key, actorId, route } },
        create: {
          key, actorId, route,
          requestHash,
          responseJson: json,
          statusCode: status,
          expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
        },
        update: {
          requestHash,
          responseJson: json,
          statusCode: status,
          expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
        },
      }).catch((err) => {
        // Write failure is non-fatal: the user already got their response,
        // we just lose the future replay.
        console.warn('[idempotency] write failed:', err instanceof Error ? err.message : err);
      });
    });

    next();
  };
}

// Hook res.json so we capture the payload without changing route code.
// We DON'T patch res.send / res.end — only res.json is contractually used
// by the routes we protect, and patching everything would risk double-caching.
function captureResponse(req: Request, res: Response, onSend: () => void): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    (res as { _idempotencyBody?: unknown })._idempotencyBody = body;
    const result = originalJson(body);
    // Fire the cache write asynchronously so it never blocks the response.
    setImmediate(onSend);
    return result;
  };
}

function hashBody(body: unknown): string {
  const json = safeStringify(body) ?? '';
  return createHash('sha256').update(json).digest('hex');
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value, sortedReplacer());
  } catch {
    return null;
  }
}

// Stable-stringify: sort object keys so `{a:1,b:2}` and `{b:2,a:1}` produce
// the same hash. JSON.stringify with a replacer that returns an ordered
// object works on Node's V8 because property-insertion order is preserved.
function sortedReplacer() {
  return function replacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const ordered: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) ordered[k] = obj[k];
      return ordered;
    }
    return value;
  };
}

// Expose for routes that want to opt in programmatically. We also re-export
// getUser purely so the import set stays tidy at call sites.
export { getUser };
