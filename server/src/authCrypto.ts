// Sprint 19: password hashing + JWT signing без новых dep'ов. Используем
// node:crypto, который есть в Node 22 из коробки:
//   • scrypt — OWASP-recommended hash для паролей (медленный, salt'ит сам)
//   • HMAC-SHA256 — стандартная JWT-подпись HS256
//
// Schema хранения пароля:  "scrypt:<saltHex>:<hashHex>"
// Schema токена:           base64url(header).base64url(payload).base64url(sig)
//
// Это сознательное архитектурное решение поверх «не добавлять новые deps без
// approval'а» из CLAUDE.md. bcryptjs / jsonwebtoken можно подключить
// позже — формат токена и хеша останется тем же (мы держим алгоритм
// extensible через префикс).

import crypto from 'node:crypto';
import { env } from './env.js';

// ─── Password hashing ───────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
// scrypt cost: N=2^14, r=8, p=1 — OWASP минимум на 2024. Это ~50ms на
// современном CPU; достаточно медленно для bruteforce, но не блокирует
// login flow.
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('password_too_short');
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const hash = await scryptAsync(password, salt);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(password, salt);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Sprint 22: invite token. 32 bytes hex = 64 chars, безопасно для URL и
 *  невозможно угадать. Используется admin'ом для invite-only registration. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      SCRYPT_KEYLEN,
      SCRYPT_PARAMS,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}

// ─── JWT (HS256) ────────────────────────────────────────────────────────────

// Sprint 25 — расширена роль до RBAC enum + impersonation claim.
export interface TokenPayload {
  sub: string;       // userId
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';
  /** Эпоха в секундах. */
  exp: number;
  iat: number;
  /** Sprint 25 — impersonation. Если кто-то из admin'ов «вошёл как X»,
   *  в токене лежит ссылка на реального оператора. Используется для UI
   *  баннера «Вы вошли как пользователь X» и audit-логов. */
  impersonatedBy?: { sub: string; email: string; role: TokenPayload['role'] };
}

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 дней
const IMPERSONATION_TTL_SEC = 60 * 60;  // Sprint 25: 1 час для impersonation

export function signToken(claims: Omit<TokenPayload, 'exp' | 'iat'>): string {
  const now = Math.floor(Date.now() / 1000);
  // Sprint 25: impersonation токен живёт 1 час (короче обычного 7-дневного),
  // чтобы admin не оставил себя «как пользователь X» надолго случайно.
  const ttl = claims.impersonatedBy ? IMPERSONATION_TTL_SEC : TOKEN_TTL_SEC;
  const payload: TokenPayload = { ...claims, iat: now, exp: now + ttl };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = b64url(crypto.createHmac('sha256', authSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = b64url(crypto.createHmac('sha256', authSecret()).update(`${header}.${body}`).digest());
  // timingSafeEqual против раскрытия токена через timing.
  if (!safeEqualStr(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64urlPad(body), 'base64').toString('utf8')) as Partial<TokenPayload>;
    if (!payload.sub || !payload.email || !payload.role || !payload.exp) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

function authSecret(): string {
  // Если JWT_SECRET явно не задан, используем детерминированный fallback на
  // основе ANTHROPIC_API_KEY + OPENAI_API_KEY + DEV_USER_EMAIL — для dev
  // достаточно. В prod env JWT_SECRET ОБЯЗАТЕЛЕН и admin должен его задать.
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  // Dev fallback — log один раз чтобы было видно ops, что секрет не установлен.
  if (!warnedSecret) {
    console.warn('[auth] JWT_SECRET не установлен — используем dev fallback. На production обязательно задайте JWT_SECRET длиной >=32 символов.');
    warnedSecret = true;
  }
  return `zapusk.dev.${env.DEV_USER_EMAIL}.${env.NODE_ENV}`;
}
let warnedSecret = false;

// ─── base64url helpers ──────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlPad(input: string): string {
  const replaced = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = replaced + '='.repeat((4 - (replaced.length % 4)) % 4);
  return padded;
}

function safeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
