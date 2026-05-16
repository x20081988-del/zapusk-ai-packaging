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
  // Sprint 49 hotfix 11 — production AI provider guard.
  //
  // The AI client falls back to mock output when the configured provider is
  // unreachable, so a production deploy that drifts to AI_PROVIDER=mock keeps
  // serving traffic — only with fake answers. The blueprint shipped
  // AI_PROVIDER=mock as the default for months because of an early-stage
  // demo-friendly choice; the dashboard override to `openai` was reversible
  // by any Blueprint sync. These flags make the regression loud:
  //
  // - ALLOW_MOCK_AI_IN_PRODUCTION=true is the only sanctioned way to run
  //   mock in production (e.g., a public demo URL). Without it, health
  //   surfaces `warning: production_ai_provider_is_mock` and the
  //   security-scan returns a CRITICAL.
  // - ENFORCE_REAL_AI_PROVIDER=true escalates: in production with
  //   provider=mock and no allow flag, the process refuses to start.
  //   OFF by default so that turning the flag on is an opt-in choice
  //   that doesn't accidentally take prod down.
  ALLOW_MOCK_AI_IN_PRODUCTION: truthy(process.env.ALLOW_MOCK_AI_IN_PRODUCTION),
  ENFORCE_REAL_AI_PROVIDER: truthy(process.env.ENFORCE_REAL_AI_PROVIDER),
  AI_LOG_USAGE: truthy(process.env.AI_LOG_USAGE),
  AI_MAX_REQUESTS_PER_USER_PER_DAY: Number(process.env.AI_MAX_REQUESTS_PER_USER_PER_DAY ?? 500),
  AI_MAX_REQUESTS_PER_PROJECT_PER_DAY: Number(process.env.AI_MAX_REQUESTS_PER_PROJECT_PER_DAY ?? 2_000),
  AI_MAX_COST_USD_PER_DAY: Number(process.env.AI_MAX_COST_USD_PER_DAY ?? 50),
  AI_MAX_TIMEOUT_MS: Number(process.env.AI_MAX_TIMEOUT_MS ?? 30_000),
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
  // Sprint 49 — OpenAI Realtime live transcription (WebRTC) и server-side
  // pre-recorded transcription для загруженных аудиофайлов. Realtime даёт
  // живые intermediate deltas в браузер, transcribe-модель используется для
  // request-based транскрипции файлов и не требует WebRTC канала.
  //
  // Sprint 49 hotfix — Realtime transcription_sessions endpoint принимает
  // конкретный список моделей; `gpt-realtime-whisper` — GA streaming
  // speech-to-text. Старое значение `gpt-4o-mini-transcribe` валидно для
  // request-based транскрипции, но Realtime сессия не открывалась с ним
  // в нашем тенанте → openai_session_failed. Дефолт переключён.
  OPENAI_MODEL_REALTIME_TRANSCRIBE: process.env.OPENAI_MODEL_REALTIME_TRANSCRIBE ?? 'gpt-realtime-whisper',
  OPENAI_MODEL_TRANSCRIBE: process.env.OPENAI_MODEL_TRANSCRIBE ?? 'gpt-4o-transcribe',

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

// Sprint 49 hotfix 11 — single source of truth for "is the AI provider real
// in this environment". Consumed by /health, /api/admin/security-scan and the
// optional fail-fast startup check. Keep this pure so it's safe to call from
// anywhere without side effects.
export type AiProviderStatusWarning =
  | 'production_ai_provider_is_mock'
  | 'production_ai_provider_is_mock_explicit_override'
  | null;

export interface AiProviderStatus {
  provider: 'openai' | 'anthropic' | 'mock';
  realProviderEnabled: boolean;
  warning: AiProviderStatusWarning;
  warningSeverity: 'critical' | 'warning' | 'info' | null;
  allowMockInProduction: boolean;
  enforceRealProvider: boolean;
}

export function aiProviderStatus(): AiProviderStatus {
  const provider = env.AI_PROVIDER;
  const realProviderEnabled = provider !== 'mock';
  if (!isProd || realProviderEnabled) {
    return {
      provider,
      realProviderEnabled,
      warning: null,
      warningSeverity: null,
      allowMockInProduction: env.ALLOW_MOCK_AI_IN_PRODUCTION,
      enforceRealProvider: env.ENFORCE_REAL_AI_PROVIDER,
    };
  }
  // Production + mock. Severity depends on the explicit override.
  if (env.ALLOW_MOCK_AI_IN_PRODUCTION) {
    return {
      provider,
      realProviderEnabled: false,
      warning: 'production_ai_provider_is_mock_explicit_override',
      warningSeverity: 'warning',
      allowMockInProduction: true,
      enforceRealProvider: env.ENFORCE_REAL_AI_PROVIDER,
    };
  }
  return {
    provider,
    realProviderEnabled: false,
    warning: 'production_ai_provider_is_mock',
    warningSeverity: 'critical',
    allowMockInProduction: false,
    enforceRealProvider: env.ENFORCE_REAL_AI_PROVIDER,
  };
}

// Optional fail-fast on boot. Called from index.ts before app.listen so the
// container crashes loudly when prod is misconfigured AND the operator opted
// into strict enforcement. OFF by default to avoid taking prod down when the
// flag is flipped during an unrelated incident.
export function assertAiProviderOnStartup(): void {
  const status = aiProviderStatus();
  if (status.warning === 'production_ai_provider_is_mock' && env.ENFORCE_REAL_AI_PROVIDER) {
    const msg =
      '[startup] CRITICAL: AI_PROVIDER=mock in production without ALLOW_MOCK_AI_IN_PRODUCTION. ' +
      'ENFORCE_REAL_AI_PROVIDER=true is set — refusing to start. ' +
      'Set AI_PROVIDER=openai (or =anthropic) in Render env, OR unset ENFORCE_REAL_AI_PROVIDER to start anyway.';
    console.error(msg);
    process.exit(1);
  }
  if (status.warning) {
    console.warn(`[startup] AI provider warning: ${status.warning} (severity=${status.warningSeverity}). ` +
      `realProviderEnabled=${status.realProviderEnabled} allowMockInProduction=${status.allowMockInProduction}`);
  }
}
