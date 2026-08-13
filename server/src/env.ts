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

  // Sprint 63.P1 — мост к очереди решений владельца (decide_bridge в telegram-agent).
  // URL публичный, секрета в нём нет — его можно держать в render.yaml. TOKEN задаётся
  // ТОЛЬКО в дашборде Render / локальном server/.env и в репозиторий не попадает.
  // Пустые значения — рабочее состояние: маршрут /api/decide тогда честно отвечает
  // 503 source_not_configured вместо того, чтобы притворяться пустой очередью.
  DECIDE_BRIDGE_URL: process.env.DECIDE_BRIDGE_URL ?? '',
  DECIDE_BRIDGE_TOKEN: process.env.DECIDE_BRIDGE_TOKEN ?? '',
  // Мак может спать, и висеть на нём бесконечно бессмысленно: владельцу нужен
  // быстрый честный ответ «источник недоступен», а не крутилка на полминуты.
  //
  // 15 секунд, а не 8 (правка 13.08.2026, замерено). Пакет решений строится ЖИВЬЁМ,
  // кеша у него нет и не будет: показать вчерашнюю очередь как сегодняшнюю - ровно
  // то враньё, против которого весь экран. Обычный ответ 100-800 мс, но первый вызов
  // после рестарта моста упирается в холодные импорты и открытие SQLite и занял
  // 13 секунд. С потолком 8 секунд экран после каждой перезагрузки мака встречал бы
  // владельца ложным «источник недоступен».
  DECIDE_BRIDGE_TIMEOUT_MS: Number(process.env.DECIDE_BRIDGE_TIMEOUT_MS ?? 15000),

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
  // Sprint 50 hotfix — back to `gpt-4o-transcribe` for live transcription.
  // `gpt-realtime-whisper` (Sprint 49 hotfix 1) chopped Russian aggressively
  // and DIDN'T support `prompt` or `turn_detection`, so:
  //   • the Russian terminology dictionary couldn't reach the model;
  //   • the model used its internal VAD that segments at every short pause;
  //   • "platform Запуск" → "платформа, запуска" because no prompt context.
  // gpt-4o-transcribe supports both prompt and server_vad with tunable
  // silence_duration_ms (we keep 700ms — natural pause length). Same model
  // is used for upload transcription via /v1/audio/transcriptions, so the
  // two surfaces stay consistent.
  OPENAI_MODEL_REALTIME_TRANSCRIBE: process.env.OPENAI_MODEL_REALTIME_TRANSCRIBE ?? 'gpt-4o-transcribe',
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

  // Sprint 61.P1 — Rollback safety. Three independent kill-switches.
  // Default: all enabled (production behavior post-Sprint-61).
  //
  //   PROJECT_CONTEXT_LAYER_ENABLED=false → revert to 6-line project context.
  //     Used by salesAssistantService.ts before calling
  //     formatProjectContextForAssistant.
  //   PROJECT_KB_AUTO_INGEST_ENABLED=false → file uploads do NOT auto-create
  //     KnowledgeSource. Existing KB-sources continue to work in retrieval.
  //   PROJECT_FINANCE_BOOST_ENABLED=false → financeBoost arg always false.
  //     Retrieval reverts to projectBoost-only.
  //
  // Why three independent toggles, not one: рег-тесты + benchmark show each
  // layer has different value-prop. If one regresses in prod, we can disable
  // just that one without losing the others.
  PROJECT_CONTEXT_LAYER_ENABLED: process.env.PROJECT_CONTEXT_LAYER_ENABLED !== 'false',
  PROJECT_KB_AUTO_INGEST_ENABLED: process.env.PROJECT_KB_AUTO_INGEST_ENABLED !== 'false',
  PROJECT_FINANCE_BOOST_ENABLED: process.env.PROJECT_FINANCE_BOOST_ENABLED !== 'false',

  // Sprint 62.P1 — safe demo-speed feature flag. Default OFF (no behavioral
  // change). When DEMO_FAST_AI_MODE=true, sales_assistant.prepare runs on
  // the FAST model route (gpt-4o-mini) instead of MAIN (gpt-4.1). This
  // trades plan quality for ~3-5x speed on the meeting-prep step, which
  // is the "AI is thinking too long" complaint during live demos.
  //
  // Intentionally NOT changing analyze/analyze-fast: analyze-fast is
  // already on FAST, analyze is the deep post-call read where quality wins.
  // Only prepare is affected because it's the one users wait for in real
  // time during a live demo.
  DEMO_FAST_AI_MODE: truthy(process.env.DEMO_FAST_AI_MODE),
};

export const isProd = env.NODE_ENV === 'production';

// Sprint 49 hotfix 11 — single source of truth for "is the AI provider real
// in this environment". Consumed by /health, /api/admin/security-scan and the
// optional fail-fast startup check. Keep this pure so it's safe to call from
// anywhere without side effects.
export type AiProviderStatusWarning =
  | 'production_ai_provider_is_mock'
  | 'production_ai_provider_is_mock_explicit_override'
  | 'production_ai_provider_key_missing'
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
  // Sprint 49 hotfix 16 — provider=openai with empty OPENAI_API_KEY (or
  // provider=anthropic with empty ANTHROPIC_API_KEY) is the SAME functional
  // failure as provider=mock: the AI client silently returns mock output
  // every call. Treat both as "no real provider" for the realProviderEnabled
  // flag and surface a distinct warning so an operator can tell which one
  // is wrong without digging into env.
  const keyConfigured =
    (provider === 'openai' && Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10))
    || (provider === 'anthropic' && Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 10));
  const realProviderEnabled = provider !== 'mock' && keyConfigured;

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

  // Production + (mock OR provider-without-key). Severity depends on which.
  if (provider !== 'mock' && !keyConfigured) {
    // Provider set to real but key empty — most likely a Render env mistake.
    // Critical regardless of ALLOW_MOCK_AI_IN_PRODUCTION since the operator
    // clearly intended real AI.
    return {
      provider,
      realProviderEnabled: false,
      warning: 'production_ai_provider_key_missing',
      warningSeverity: 'critical',
      allowMockInProduction: env.ALLOW_MOCK_AI_IN_PRODUCTION,
      enforceRealProvider: env.ENFORCE_REAL_AI_PROVIDER,
    };
  }

  // Provider explicitly mock — same logic as before.
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
  // Sprint 49 hotfix 16 — enforce covers both critical cases now: explicit
  // mock without override, OR provider set but key missing. Both leave prod
  // serving silent mock responses; both deserve a hard stop under enforce.
  if (
    env.ENFORCE_REAL_AI_PROVIDER
    && (status.warning === 'production_ai_provider_is_mock'
        || status.warning === 'production_ai_provider_key_missing')
  ) {
    const reason = status.warning === 'production_ai_provider_key_missing'
      ? `AI_PROVIDER=${status.provider} but the corresponding API key is empty in env`
      : 'AI_PROVIDER=mock in production without ALLOW_MOCK_AI_IN_PRODUCTION';
    const msg =
      `[startup] CRITICAL: ${reason}. ` +
      'ENFORCE_REAL_AI_PROVIDER=true is set — refusing to start. ' +
      'Fix env and redeploy, OR unset ENFORCE_REAL_AI_PROVIDER to start anyway.';
    console.error(msg);
    process.exit(1);
  }
  if (status.warning) {
    console.warn(`[startup] AI provider warning: ${status.warning} (severity=${status.warningSeverity}). ` +
      `realProviderEnabled=${status.realProviderEnabled} allowMockInProduction=${status.allowMockInProduction}`);
  }
}
