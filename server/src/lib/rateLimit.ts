import type { Request, Response, NextFunction } from 'express';

// Sprint 50 P0.2 — in-memory token-bucket rate limiter.
//
// Why in-memory (and not Redis / express-rate-limit):
//   - we run a single Render web instance — no need for distributed state;
//   - adding a dependency for a few hundred lines of logic is overkill;
//   - the failure mode of a fresh container = full bucket = same as a real
//     legitimate restart of one user's session, which is fine.
//
// Per route-group policy. Keyed by actorId when authed, by IP when not.
// Burst capacity = `capacity`. Refill rate = `refillPerSec` tokens/second
// regenerated linearly between requests. A request that would drop the
// bucket below zero is rejected with 429.

export interface RateLimitPolicy {
  capacity: number;        // max tokens (burst size)
  refillPerSec: number;    // tokens regenerated per second
  cost?: number;           // per-request cost (default 1)
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

// Defensive cap: a runaway client can't grow the map beyond this.
// Buckets that haven't been touched in 30 min are evicted on next sweep.
const MAX_BUCKETS = 50_000;
const EVICT_AFTER_MS = 30 * 60_000;
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.updatedAt > EVICT_AFTER_MS) buckets.delete(k);
  }
  // Hard cap as a backstop. We don't sort by recency here; if we hit the
  // hard cap we evict half at random to keep operation O(n). Fresh requests
  // refill empty buckets in milliseconds anyway.
  if (buckets.size > MAX_BUCKETS) {
    let dropped = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++dropped >= buckets.size / 2) break;
    }
  }
}

function consume(key: string, policy: RateLimitPolicy): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);
  const cost = policy.cost ?? 1;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: policy.capacity, updatedAt: now };
    buckets.set(key, bucket);
  } else {
    const elapsed = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(policy.capacity, bucket.tokens + elapsed * policy.refillPerSec);
    bucket.updatedAt = now;
  }
  if (bucket.tokens < cost) {
    // Time until we have enough tokens for one request of this cost.
    const need = cost - bucket.tokens;
    const retryAfterMs = Math.ceil((need / policy.refillPerSec) * 1000);
    return { ok: false, retryAfterMs };
  }
  bucket.tokens -= cost;
  return { ok: true, retryAfterMs: 0 };
}

function actorKey(req: Request, group: string): string {
  const actor = (req as { user?: { id?: string } }).user;
  if (actor?.id) return `${group}:user:${actor.id}`;
  // For unauth paths fall back to the client IP. Trust the first
  // X-Forwarded-For entry only — Render terminates TLS in front of us,
  // so req.ip after `app.set('trust proxy', true)` is already trustworthy,
  // but we keep this resilient without that flag.
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0]?.trim();
  const ip = xff || req.ip || 'unknown';
  return `${group}:ip:${ip}`;
}

// Route-group policy presets. Tune by traffic shape, not by guess.
// "auth" — login / signup; cheap on us, expensive on attackers. Tight burst.
// "ai_inference" — sales-assistant analyze + conversation-analysis. The AI
//   cost guardrails (env.AI_MAX_*) already provide cost cap; rate limit
//   just keeps a single actor from monopolising the queue.
// "realtime_token" — /api/realtime/transcription-session. Each call mints
//   an OpenAI ephemeral token (cost angle). Tighter than ai_inference.
// "file_upload" — /api/conversation-analysis (multipart) + project file
//   uploads. Files are 60 MB max so we limit by count more than rate.
export const PRESETS = {
  auth: { capacity: 10, refillPerSec: 0.2 },              // ~12/min
  ai_inference: { capacity: 30, refillPerSec: 0.5 },       // ~30/min sustained, 30 burst
  realtime_token: { capacity: 10, refillPerSec: 0.2 },     // ~12/min, tight burst
  file_upload: { capacity: 6, refillPerSec: 0.1 },         // ~6/min sustained
} as const;

export type RateLimitGroup = keyof typeof PRESETS;

export function withRateLimit(group: RateLimitGroup, override?: Partial<RateLimitPolicy>) {
  const base = PRESETS[group];
  const policy: RateLimitPolicy = { ...base, ...override };
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = actorKey(req, group);
    const r = consume(key, policy);
    if (!r.ok) {
      res.setHeader('Retry-After', Math.ceil(r.retryAfterMs / 1000).toString());
      // Don't reveal internal bucket math or the actor key — just the
      // approximate retry hint, which is the only useful diagnostic for
      // a legitimate caller.
      res.status(429).json({
        error: 'rate_limited',
        retryAfterMs: r.retryAfterMs,
        group,
      });
      return;
    }
    next();
  };
}

// Test helper. Not exported from the barrel — used only by smoke scripts.
export function _resetRateLimitBuckets(): void {
  buckets.clear();
}
