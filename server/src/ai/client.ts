import { env } from '../env.js';
import { mockBrief } from './mock.js';
import { prisma } from '../db.js';

export type AIProvider = 'anthropic' | 'openai' | 'mock';
export type AIModelRoute = 'main' | 'fast' | 'realtime';

export interface AIJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
  strict?: boolean;
}

export interface AICallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  asJSON?: boolean;
  feature?: string;
  modelRoute?: AIModelRoute;
  maxInputChars?: number;
  timeoutMs?: number;
  jsonSchema?: AIJsonSchema;
  projectId?: string | null;
  actorId?: string | null;
  requestType?: string;
}

export interface AIUsage {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  success: boolean;
  errorCode: string | null;
  timeoutHit?: boolean;
}

export interface AIResult {
  text: string;
  provider: AIProvider;
  model: string;
  fellBackToMock: boolean;
  usage?: AIUsage;
}

interface PreparedCall extends AICallOptions {
  feature: string;
  modelRoute: AIModelRoute;
  maxTokens: number;
  timeoutMs: number;
  user: string;
  projectId: string | null;
  actorId: string | null;
  requestType: string;
}

interface FeatureGuard {
  modelRoute: AIModelRoute;
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

const DEFAULT_GUARD: FeatureGuard = {
  modelRoute: 'main',
  maxInputChars: 60_000,
  maxOutputTokens: 2_000,
  timeoutMs: 30_000,
};

const FEATURE_GUARDS: Record<string, FeatureGuard> = {
  'brief.generate': {
    modelRoute: 'main',
    maxInputChars: 90_000,
    maxOutputTokens: 4_096,
    timeoutMs: 45_000,
  },
  'brief.regenerate': {
    modelRoute: 'main',
    maxInputChars: 60_000,
    maxOutputTokens: 4_096,
    timeoutMs: 45_000,
  },
  'sales_assistant.analyze': {
    modelRoute: 'main',
    maxInputChars: 24_000,
    // Sprint 13 emotional layer: AssistantCard 26 полей в русском JSON.
    // 700 tokens (Sprint 11) клипает ответ, и парсинг падал → fallback на mock.
    maxOutputTokens: 3_000,
    // Hotfix 2026-05-15 — расширили window с 20 до 25 секунд: gpt-4o иногда
    // отдаёт большую JSON-карточку медленнее. Frontend ставит свой 25-секундный
    // AbortController; backend-timeout должен совпадать, чтобы пользователь
    // видел понятную ошибку, а не «висел» дольше.
    timeoutMs: 25_000,
  },
  // Hotfix 2026-05-15 — отдельный guard для двухэтапной генерации (Sprint 34В).
  // Раньше analyze-fast попадал в DEFAULT_GUARD (30 секунд) — это полностью
  // ломало преимущество «быстрого тактического ответа за 1-3 секунды». Теперь
  // жёсткие 8 секунд: либо fast уложился и UI оживает, либо abort и пользователь
  // видит «Не удалось быстро получить подсказку» вместо вечного спиннера.
  'sales_assistant.analyze_fast': {
    modelRoute: 'fast',
    maxInputChars: 16_000,
    maxOutputTokens: 600,
    timeoutMs: 8_000,
  },
  classification: {
    modelRoute: 'fast',
    maxInputChars: 12_000,
    maxOutputTokens: 500,
    timeoutMs: 10_000,
  },
  summary: {
    modelRoute: 'fast',
    maxInputChars: 20_000,
    maxOutputTokens: 900,
    timeoutMs: 12_000,
  },
  metadata: {
    modelRoute: 'fast',
    maxInputChars: 12_000,
    maxOutputTokens: 500,
    timeoutMs: 10_000,
  },
};

let warnedLegacyChatAdapter = false;

export class AIGuardrailError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, statusCode: number) {
    super(code);
    this.name = 'AIGuardrailError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isAIGuardrailError(err: unknown): err is AIGuardrailError {
  return err instanceof AIGuardrailError || (err instanceof Error && err.name === 'AIGuardrailError');
}

export const aiClient = {
  generate(opts: AICallOptions): Promise<AIResult> {
    return completeAI({ ...opts, asJSON: false });
  },

  generateJson(opts: AICallOptions): Promise<AIResult> {
    return completeAI({ ...opts, asJSON: true });
  },

  classify(opts: AICallOptions): Promise<AIResult> {
    return completeAI({
      ...opts,
      asJSON: opts.asJSON ?? true,
      feature: opts.feature ?? 'classification',
      modelRoute: 'fast',
      maxTokens: opts.maxTokens ?? FEATURE_GUARDS.classification.maxOutputTokens,
    });
  },

  async *stream(_opts: AICallOptions): AsyncGenerator<string> {
    throw new Error('ai_stream_not_implemented');
  },
};

// Backward-compatible entry point. Existing services can keep calling aiComplete
// while new code uses aiClient.generate()/generateJson()/classify().
export async function aiComplete(opts: AICallOptions): Promise<AIResult> {
  return completeAI(opts);
}

async function completeAI(opts: AICallOptions): Promise<AIResult> {
  const prepared = prepareCall(opts);
  const provider = env.AI_PROVIDER;
  const model = modelFor(provider, prepared.modelRoute);

  await enforceGuardrails(prepared, provider, model);

  if (provider === 'mock') {
    return mockResult(prepared, false);
  }

  const degraded = getProviderDegraded(provider);
  if (degraded.degraded) {
    console.warn(`[ai] provider=${provider} degraded reason=${degraded.reason}; using mock fallback`);
    return mockResult(prepared, true, {
      provider,
      model,
      success: false,
      errorCode: degraded.reason ?? 'provider_degraded',
      fallbackUsed: true,
    });
  }

  const missingKey =
    (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) ||
    (provider === 'openai' && !env.OPENAI_API_KEY);

  if (missingKey) {
    console.warn(`[ai] provider=${provider} feature=${prepared.feature} missing_api_key; using mock fallback`);
    return mockResult(prepared, true, {
      provider,
      model,
      success: false,
      errorCode: 'missing_api_key',
      fallbackUsed: true,
    });
  }

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(prepared);
    }
    if (provider === 'openai') {
      return await callOpenAI(prepared);
    }
  } catch (err) {
    const code = safeErrorCode(err);
    const timeoutHit = isTimeoutError(err);
    recordBreakerResult(provider, false, timeoutHit, code);
    console.warn(`[ai] provider=${provider} feature=${prepared.feature} model=${model} failed code=${code}; using mock fallback`);
    const usage = {
      provider,
      feature: prepared.feature,
      model,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      success: false,
      errorCode: code,
      timeoutHit,
    };
    logUsage(usage);
    return mockResult(prepared, true, {
      provider,
      model,
      success: false,
      errorCode: code,
      timeoutHit,
      fallbackUsed: true,
    });
  }

  return mockResult(prepared, provider !== 'mock');
}

function prepareCall(opts: AICallOptions): PreparedCall {
  const feature = opts.feature ?? 'generic';
  const guard = FEATURE_GUARDS[feature] ?? {
    ...DEFAULT_GUARD,
    modelRoute: opts.modelRoute ?? routeForFeature(feature),
  };
  const maxInputChars = Math.min(opts.maxInputChars ?? guard.maxInputChars, guard.maxInputChars);
  const user = opts.user.length > maxInputChars
    ? `${opts.user.slice(0, maxInputChars)}\n\n[INPUT TRUNCATED BY AI GUARDRAIL]`
    : opts.user;

  if (user.length !== opts.user.length) {
    console.warn(`[ai] feature=${feature} input_truncated maxInputChars=${maxInputChars}`);
  }

  return {
    ...opts,
    feature,
    modelRoute: opts.modelRoute ?? guard.modelRoute,
    maxTokens: Math.min(opts.maxTokens ?? guard.maxOutputTokens, guard.maxOutputTokens),
    timeoutMs: Math.min(opts.timeoutMs ?? guard.timeoutMs, guard.timeoutMs, env.AI_MAX_TIMEOUT_MS),
    user,
    projectId: opts.projectId ?? null,
    actorId: opts.actorId ?? null,
    requestType: opts.requestType ?? (opts.asJSON ? 'json' : 'text'),
  };
}

function routeForFeature(feature: string): AIModelRoute {
  if (/classif|metadata|summary|summar/i.test(feature)) return 'fast';
  return 'main';
}

async function callAnthropic(opts: PreparedCall): Promise<AIResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const started = Date.now();
  const res = await withRetry((signal) => client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  }, { signal } as never), opts.timeoutMs);

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n');
  const usage = usageEvent({
    provider: 'anthropic',
    feature: opts.feature,
    model: env.ANTHROPIC_MODEL,
    latencyMs: Date.now() - started,
    inputTokens: numberOrNull(res.usage?.input_tokens),
    outputTokens: numberOrNull(res.usage?.output_tokens),
    totalTokens: sumTokens(res.usage?.input_tokens, res.usage?.output_tokens),
    success: true,
    errorCode: null,
  });
  logUsage(usage);
  recordBreakerResult('anthropic', true, false, null);
  recordAiRequestLedger(opts, usage, text.length).catch(() => {});
  return { text, provider: 'anthropic', model: env.ANTHROPIC_MODEL, fellBackToMock: false, usage };
}

async function callOpenAI(opts: PreparedCall): Promise<AIResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = modelFor('openai', opts.modelRoute);
  const openAIClient = client as unknown as { responses?: { create?: unknown } };

  if (typeof openAIClient.responses?.create === 'function') {
    return callOpenAIResponses(client, model, opts);
  }
  return callOpenAIChatCompletionsLegacy(client, model, opts);
}

async function callOpenAIResponses(client: unknown, model: string, opts: PreparedCall): Promise<AIResult> {
  const started = Date.now();
  const res = await withRetry((signal) => (client as {
    responses: {
      create: (body: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
    };
  }).responses.create({
    model,
    instructions: opts.system,
    input: opts.user,
    max_output_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.4,
    text: opts.asJSON ? { format: openAITextFormat(opts) } : undefined,
    store: false,
    metadata: { feature: opts.feature, route: opts.modelRoute },
  }, { signal }), opts.timeoutMs);

  const response = res as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  const usage = usageEvent({
    provider: 'openai',
    feature: opts.feature,
    model,
    latencyMs: Date.now() - started,
    inputTokens: numberOrNull(response.usage?.input_tokens),
    outputTokens: numberOrNull(response.usage?.output_tokens),
    totalTokens: numberOrNull(response.usage?.total_tokens),
    success: true,
    errorCode: null,
  });
  logUsage(usage);
  const text = extractResponsesText(response);
  recordBreakerResult('openai', true, false, null);
  recordAiRequestLedger(opts, usage, text.length).catch(() => {});
  return {
    text,
    provider: 'openai',
    model,
    fellBackToMock: false,
    usage,
  };
}

async function callOpenAIChatCompletionsLegacy(client: unknown, model: string, opts: PreparedCall): Promise<AIResult> {
  if (!warnedLegacyChatAdapter) {
    console.warn('[ai] OpenAI Responses API is unavailable in this SDK runtime; using isolated chat completions adapter');
    warnedLegacyChatAdapter = true;
  }

  const started = Date.now();
  const res = await withRetry((signal) => (client as {
    chat: {
      completions: {
        create: (body: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
      };
    };
  }).chat.completions.create({
    model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.4,
    response_format: opts.asJSON ? openAIChatResponseFormat(opts) : undefined,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  }, { signal }), opts.timeoutMs);

  const response = res as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const usage = usageEvent({
    provider: 'openai',
    feature: opts.feature,
    model,
    latencyMs: Date.now() - started,
    inputTokens: numberOrNull(response.usage?.prompt_tokens),
    outputTokens: numberOrNull(response.usage?.completion_tokens),
    totalTokens: numberOrNull(response.usage?.total_tokens),
    success: true,
    errorCode: null,
  });
  logUsage(usage);
  const text = response.choices?.[0]?.message?.content ?? '';
  recordBreakerResult('openai', true, false, null);
  recordAiRequestLedger(opts, usage, text.length).catch(() => {});
  return {
    text,
    provider: 'openai',
    model,
    fellBackToMock: false,
    usage,
  };
}

function openAITextFormat(opts: PreparedCall): Record<string, unknown> {
  if (opts.jsonSchema) {
    return {
      type: 'json_schema',
      name: opts.jsonSchema.name,
      description: opts.jsonSchema.description,
      schema: opts.jsonSchema.schema,
      strict: opts.jsonSchema.strict ?? true,
    };
  }
  return { type: 'json_object' };
}

function openAIChatResponseFormat(opts: PreparedCall): Record<string, unknown> {
  if (opts.jsonSchema) {
    return {
      type: 'json_schema',
      json_schema: {
        name: opts.jsonSchema.name,
        description: opts.jsonSchema.description,
        schema: opts.jsonSchema.schema,
        strict: opts.jsonSchema.strict ?? true,
      },
    };
  }
  return { type: 'json_object' };
}

function modelFor(provider: AIProvider, route: AIModelRoute): string {
  if (provider === 'openai') {
    if (route === 'fast') return env.OPENAI_MODEL_FAST;
    if (route === 'realtime') return env.OPENAI_MODEL_REALTIME;
    return env.OPENAI_MODEL_MAIN;
  }
  if (provider === 'anthropic') return env.ANTHROPIC_MODEL;
  return 'mock-v1';
}

async function withRetry<T>(call: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const maxAttempts = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await call(controller.signal);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) break;
      await delay(200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function isRetryable(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 401 || status === 403 || status === 429) return false;
  if (status && [408, 409, 500, 502, 503, 504].includes(status)) return true;
  const code = String((err as { code?: unknown } | null)?.code ?? '').toUpperCase();
  return ['ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH'].includes(code);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockResult(
  opts: PreparedCall,
  fellBackToMock: boolean,
  ledgerOverride: Partial<AIUsage & { provider: AIProvider; model: string; fallbackUsed: boolean }> = {},
): AIResult {
  const text = opts.asJSON ? JSON.stringify(mockBrief(opts.user), null, 2) : mockText(opts);
  const result = {
    text,
    provider: 'mock' as const,
    model: 'mock-v1',
    fellBackToMock,
    usage: usageEvent({
      provider: 'mock',
      feature: opts.feature,
      model: 'mock-v1',
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      success: true,
      errorCode: null,
    }),
  };
  logUsage(result.usage);
  recordAiRequestLedger(opts, {
    ...result.usage,
    provider: ledgerOverride.provider ?? 'mock',
    model: ledgerOverride.model ?? 'mock-v1',
    success: ledgerOverride.success ?? result.usage.success,
    errorCode: ledgerOverride.errorCode ?? result.usage.errorCode,
    timeoutHit: ledgerOverride.timeoutHit ?? false,
  }, text.length, ledgerOverride.fallbackUsed ?? fellBackToMock).catch(() => {});
  return result;
}

function usageEvent(input: Omit<AIUsage & {
  provider: AIProvider;
  feature: string;
  model: string;
}, 'estimatedCostUsd'>): AIUsage & { provider: AIProvider; feature: string; model: string } {
  return { ...input, estimatedCostUsd: estimateCostUsd(input.provider, input.model, input.inputTokens, input.outputTokens) };
}

function logUsage(event: AIUsage & { provider: AIProvider; feature: string; model: string }) {
  if (!env.AI_LOG_USAGE) return;
  console.log('[ai:usage]', JSON.stringify({
    provider: event.provider,
    feature: event.feature,
    model: event.model,
    latencyMs: event.latencyMs,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    totalTokens: event.totalTokens,
    estimatedCostUsd: event.estimatedCostUsd,
    success: event.success,
    errorCode: event.errorCode,
  }));
}

function extractResponsesText(response: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n');
}

function mockText(opts: AICallOptions): string {
  return `# Mock AI response\n\n_Provider: mock — set ANTHROPIC_API_KEY or OPENAI_API_KEY to use real model._\n\n## System prompt (excerpt)\n${opts.system.slice(0, 200)}…\n\n## User input (excerpt)\n${opts.user.slice(0, 200)}…`;
}

function safeErrorCode(err: unknown): string {
  const status = errorStatus(err);
  if (status) return `http_${status}`;
  const code = (err as { code?: unknown; type?: unknown; name?: unknown } | null)?.code
    ?? (err as { type?: unknown } | null)?.type
    ?? (err as { name?: unknown } | null)?.name
    ?? 'unknown_error';
  return String(code).slice(0, 80);
}

function errorStatus(err: unknown): number | null {
  const raw = (err as { status?: unknown; statusCode?: unknown } | null)?.status
    ?? (err as { statusCode?: unknown } | null)?.statusCode;
  const status = Number(raw);
  return Number.isFinite(status) ? status : null;
}

async function enforceGuardrails(prepared: PreparedCall, provider: AIProvider, model: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    if (prepared.actorId && env.AI_MAX_REQUESTS_PER_USER_PER_DAY > 0) {
      const count = await prisma.aiRequestLedger.count({
        where: { actorId: prepared.actorId, createdAt: { gte: since } },
      });
      if (count >= env.AI_MAX_REQUESTS_PER_USER_PER_DAY) {
        await recordGuardrailHit(prepared, provider, model, 'user_daily_requests_exceeded');
        throw new AIGuardrailError('user_daily_requests_exceeded', 429);
      }
    }

    if (prepared.projectId && env.AI_MAX_REQUESTS_PER_PROJECT_PER_DAY > 0) {
      const count = await prisma.aiRequestLedger.count({
        where: { projectId: prepared.projectId, createdAt: { gte: since } },
      });
      if (count >= env.AI_MAX_REQUESTS_PER_PROJECT_PER_DAY) {
        await recordGuardrailHit(prepared, provider, model, 'project_daily_requests_exceeded');
        throw new AIGuardrailError('project_daily_requests_exceeded', 429);
      }
    }

    if (env.AI_MAX_COST_USD_PER_DAY > 0) {
      const cost = await prisma.aiRequestLedger.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { estimatedCostUsd: true },
      });
      if ((cost._sum.estimatedCostUsd ?? 0) >= env.AI_MAX_COST_USD_PER_DAY) {
        await recordGuardrailHit(prepared, provider, model, 'daily_cost_limit_exceeded');
        throw new AIGuardrailError('daily_cost_limit_exceeded', 503);
      }
    }
  } catch (err) {
    if (isAIGuardrailError(err)) throw err;
    await recordGuardrailHit(prepared, provider, model, 'guardrail_check_failed').catch(() => {});
    throw new AIGuardrailError('guardrail_check_failed', 503);
  }
}

async function recordGuardrailHit(
  prepared: PreparedCall,
  provider: AIProvider,
  model: string,
  code: string,
): Promise<void> {
  await Promise.allSettled([
    prisma.aiRequestLedger.create({
      data: {
        feature: prepared.feature,
        provider,
        model,
        projectId: prepared.projectId,
        actorId: prepared.actorId,
        requestType: prepared.requestType,
        success: false,
        fallbackUsed: false,
        timeoutHit: false,
        latencyMs: 0,
        tokensIn: null,
        tokensOut: null,
        estimatedCostUsd: null,
        charInput: charInput(prepared),
        charOutput: null,
        errorCode: code,
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: prepared.actorId,
        actorEmail: null,
        actorRole: null,
        action: 'ai.guardrail.hit',
        targetType: 'AI',
        targetId: null,
        payload: JSON.stringify({
          feature: prepared.feature,
          provider,
          model,
          projectId: prepared.projectId,
          requestType: prepared.requestType,
          errorCode: code,
        }),
      },
    }),
  ]);
}

async function recordAiRequestLedger(
  opts: PreparedCall,
  usage: AIUsage & { provider: AIProvider; feature: string; model: string },
  charOutput: number | null,
  fallbackUsed = false,
): Promise<void> {
  try {
    await prisma.aiRequestLedger.create({
      data: {
        feature: opts.feature,
        provider: usage.provider,
        model: usage.model,
        projectId: opts.projectId,
        actorId: opts.actorId,
        requestType: opts.requestType,
        success: usage.success,
        fallbackUsed,
        timeoutHit: Boolean(usage.timeoutHit),
        latencyMs: Math.max(0, Math.round(usage.latencyMs)),
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        charInput: charInput(opts),
        charOutput,
        errorCode: usage.errorCode,
      },
    });
  } catch (err) {
    console.warn('[ai:ledger] write failed', err instanceof Error ? err.message : err);
  }
}

function charInput(opts: PreparedCall): number {
  return (opts.system?.length ?? 0) + (opts.user?.length ?? 0);
}

function estimateCostUsd(
  provider: AIProvider,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const lower = model.toLowerCase();
  let inputPerMillion: number | null = null;
  let outputPerMillion: number | null = null;

  if (provider === 'openai') {
    if (lower.includes('mini')) {
      inputPerMillion = 0.15;
      outputPerMillion = 0.60;
    } else if (lower.includes('4.1') || lower.includes('4o')) {
      inputPerMillion = 2.50;
      outputPerMillion = 10.00;
    }
  } else if (provider === 'anthropic') {
    if (lower.includes('haiku')) {
      inputPerMillion = 0.80;
      outputPerMillion = 4.00;
    } else if (lower.includes('sonnet')) {
      inputPerMillion = 3.00;
      outputPerMillion = 15.00;
    } else if (lower.includes('opus')) {
      inputPerMillion = 15.00;
      outputPerMillion = 75.00;
    }
  }

  if (inputPerMillion == null || outputPerMillion == null) return null;
  const cost = ((inputTokens ?? 0) / 1_000_000) * inputPerMillion
    + ((outputTokens ?? 0) / 1_000_000) * outputPerMillion;
  return Number(cost.toFixed(6));
}

interface BreakerEvent {
  ts: number;
  success: boolean;
  timeout: boolean;
  code: string | null;
}

interface BreakerState {
  events: BreakerEvent[];
  degradedUntil: number;
  reason: string | null;
}

const BREAKER_WINDOW_MS = 5 * 60 * 1000;
const BREAKER_MIN_EVENTS = 8;
const BREAKER_ERROR_THRESHOLD = 0.5;
const BREAKER_TIMEOUT_THRESHOLD = 0.35;
const BREAKER_DEGRADE_MS = 60 * 1000;
const breakerState: Record<AIProvider, BreakerState> = {
  openai: { events: [], degradedUntil: 0, reason: null },
  anthropic: { events: [], degradedUntil: 0, reason: null },
  mock: { events: [], degradedUntil: 0, reason: null },
};

function recordBreakerResult(provider: AIProvider, success: boolean, timeout: boolean, code: string | null): void {
  if (provider === 'mock') return;
  const state = breakerState[provider];
  const now = Date.now();
  state.events = [...state.events.filter((e) => now - e.ts <= BREAKER_WINDOW_MS), { ts: now, success, timeout, code }];
  if (state.events.length < BREAKER_MIN_EVENTS) return;

  const failures = state.events.filter((e) => !e.success).length;
  const timeouts = state.events.filter((e) => e.timeout).length;
  const errorRate = failures / state.events.length;
  const timeoutRate = timeouts / state.events.length;

  if (errorRate >= BREAKER_ERROR_THRESHOLD || timeoutRate >= BREAKER_TIMEOUT_THRESHOLD) {
    state.degradedUntil = now + BREAKER_DEGRADE_MS;
    state.reason = timeoutRate >= BREAKER_TIMEOUT_THRESHOLD ? 'provider_timeout_rate_high' : 'provider_error_rate_high';
    console.warn(`[ai:circuit-breaker] provider=${provider} degraded reason=${state.reason} errorRate=${errorRate.toFixed(2)} timeoutRate=${timeoutRate.toFixed(2)}`);
  }
}

function getProviderDegraded(provider: AIProvider): { degraded: boolean; reason: string | null; until: string | null } {
  const state = breakerState[provider];
  if (!state || provider === 'mock') return { degraded: false, reason: null, until: null };
  const degraded = Date.now() < state.degradedUntil;
  return {
    degraded,
    reason: degraded ? state.reason : null,
    until: degraded ? new Date(state.degradedUntil).toISOString() : null,
  };
}

export function getAiCircuitBreakerStatus() {
  const now = Date.now();
  return (['openai', 'anthropic', 'mock'] as AIProvider[]).map((provider) => {
    const state = breakerState[provider];
    const events = state.events.filter((e) => now - e.ts <= BREAKER_WINDOW_MS);
    const failures = events.filter((e) => !e.success).length;
    const timeouts = events.filter((e) => e.timeout).length;
    const degraded = now < state.degradedUntil;
    return {
      provider,
      degraded,
      reason: degraded ? state.reason : null,
      degradedUntil: degraded ? new Date(state.degradedUntil).toISOString() : null,
      sampleSize: events.length,
      errorRate: events.length ? failures / events.length : 0,
      timeoutRate: events.length ? timeouts / events.length : 0,
    };
  });
}

function isTimeoutError(err: unknown): boolean {
  const code = safeErrorCode(err).toLowerCase();
  return code.includes('abort') || code.includes('timeout') || code.includes('timed');
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumTokens(input: unknown, output: unknown): number | null {
  const inTokens = numberOrNull(input);
  const outTokens = numberOrNull(output);
  if (inTokens === null && outTokens === null) return null;
  return (inTokens ?? 0) + (outTokens ?? 0);
}
