import 'dotenv/config';

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';

// Sprint 35 P0.4 — production safety defaults.
//
// Раньше /api/auth/demo и x-user-email header auth включались всегда, и
// отключались только явным DISABLE_*=true. Это значит: deploy в production
// без правильных env-флагов оставлял quick-login роли и upsert-by-email
// открытыми. Любой кто узнал URL мог получить FOUNDER/ADMIN-токен одним
// POST'ом или подменить identity через header.
//
// Новая логика: в production оба пути ВЫКЛЮЧЕНЫ по умолчанию. Включить
// можно только явным ENABLE_*=true (для demo-инстанса). DISABLE_*=true
// сохраняется как back-compat для существующих deploy'ев.
function resolveDemoLoginAllowed(): boolean {
  if (process.env.ENABLE_DEMO_LOGIN === 'true') return true;
  if (process.env.DISABLE_DEMO_LOGIN === 'true') return false;
  return !IS_PROD; // dev/test → on, prod → off
}
function resolveHeaderAuthAllowed(): boolean {
  if (process.env.ENABLE_HEADER_AUTH === 'true') return true;
  if (process.env.DISABLE_HEADER_AUTH === 'true') return false;
  return !IS_PROD;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV,
  DEMO_LOGIN_ALLOWED: resolveDemoLoginAllowed(),
  HEADER_AUTH_ALLOWED: resolveHeaderAuthAllowed(),
  // In single-service production deploy (Render / Railway / Fly) Express
  // serves both the API and the compiled SPA. CORS_ORIGIN is then irrelevant
  // because requests are same-origin. Leave it for split deploys.
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  UPLOADS_DIR: process.env.UPLOADS_DIR ?? './uploads',
  // Where the compiled SPA lives. Relative to the running server/dist.
  WEB_DIST_DIR: process.env.WEB_DIST_DIR ?? '../../web/dist',

  // Public-demo lockdown. Set DEMO_MODE=true on a public URL to block destructive ops.
  DEMO_MODE: truthy(process.env.DEMO_MODE),

  DEV_USER_EMAIL: process.env.DEV_USER_EMAIL ?? 'founder@zapusk.tech',
  DEV_USER_NAME: process.env.DEV_USER_NAME ?? 'Zapusk Founder',

  // Sprint 19: JWT signing key. На production обязательно установить
  // JWT_SECRET >=32 chars в Render env. В dev есть детерминированный
  // fallback (см. authCrypto.authSecret()).
  JWT_SECRET: process.env.JWT_SECRET ?? '',

  // Sprint 25 — bootstrap accounts. Пароли НЕ хардкодятся в репо.
  // Если env-переменная пустая — seed создаёт disabled account (без
  // passwordHash) с warn в console; реальный логин невозможен пока
  // владелец не задаст пароль в Render env.
  BOOTSTRAP_OWNER_PASSWORD: process.env.BOOTSTRAP_OWNER_PASSWORD ?? '',
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
  BOOTSTRAP_MANAGER_PASSWORD: process.env.BOOTSTRAP_MANAGER_PASSWORD ?? '',
  BOOTSTRAP_DEMO_PASSWORD: process.env.BOOTSTRAP_DEMO_PASSWORD ?? '',
  // Кастомизируемые email'ы для bootstrap-аккаунтов (на случай white-label).
  BOOTSTRAP_OWNER_EMAIL: process.env.BOOTSTRAP_OWNER_EMAIL ?? 'grigory@zapusk.tech',
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@zapusk.tech',
  BOOTSTRAP_MANAGER_EMAIL: process.env.BOOTSTRAP_MANAGER_EMAIL ?? 'manager@zapusk.tech',
  BOOTSTRAP_DEMO_FOUNDER_EMAIL: process.env.BOOTSTRAP_DEMO_FOUNDER_EMAIL ?? 'demo-founder@zapusk.tech',
  BOOTSTRAP_DEMO_INVESTOR_EMAIL: process.env.BOOTSTRAP_DEMO_INVESTOR_EMAIL ?? 'demo-investor@zapusk.tech',

  AI_PROVIDER: (process.env.AI_PROVIDER ?? 'mock') as 'anthropic' | 'openai' | 'mock',
  AI_LOG_USAGE: truthy(process.env.AI_LOG_USAGE),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  // Sprint 17: разделили на MAIN / FAST по аналогии с OpenAI. ANTHROPIC_MODEL
  // оставлен как back-compat alias для существующих deployment'ов.
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-1',
  ANTHROPIC_MODEL_MAIN: process.env.ANTHROPIC_MODEL_MAIN ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-1',
  ANTHROPIC_MODEL_FAST: process.env.ANTHROPIC_MODEL_FAST ?? 'claude-sonnet-4-5',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  // OPENAI_MODEL is kept as a backward-compatible alias for older deploys.
  // Defaults must be real model names — placeholders like "gpt-5.5" return
  // 404 model_not_found from OpenAI and silently fall back to mock.
  OPENAI_MODEL_MAIN: process.env.OPENAI_MODEL_MAIN ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
  OPENAI_MODEL_FAST: process.env.OPENAI_MODEL_FAST ?? 'gpt-4o-mini',
  OPENAI_MODEL_REALTIME: process.env.OPENAI_MODEL_REALTIME ?? 'gpt-4o-realtime-preview',

  // Deepgram pre-recorded transcription. nova-2 supports Russian + diarization.
  // Without a key the conversation analyzer falls back to a deterministic mock
  // transcript so the cockpit still flows end-to-end on demo URLs.
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? '',
  DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL ?? 'nova-2',

  // Sprint 17: Lovable API для генерации landing / one-pager / pitch_deck (web).
  // Если ключа нет — PackagingPipeline возвращает mock preview URL.
  LOVABLE_API_KEY: process.env.LOVABLE_API_KEY ?? '',
  LOVABLE_API_BASE_URL: process.env.LOVABLE_API_BASE_URL ?? 'https://api.lovable.dev',
};

export const isProd = env.NODE_ENV === 'production';
