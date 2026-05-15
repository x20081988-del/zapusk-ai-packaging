import { env } from '../env.js';
import { mockBrief } from './mock.js';

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
}

export interface AIUsage {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  success: boolean;
  errorCode: string | null;
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

  if (provider === 'mock') {
    return mockResult(prepared, false);
  }

  const model = modelFor(provider, prepared.modelRoute);
  const missingKey =
    (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) ||
    (provider === 'openai' && !env.OPENAI_API_KEY);

  if (missingKey) {
    console.warn(`[ai] provider=${provider} feature=${prepared.feature} missing_api_key; using mock fallback`);
    logUsage({
      provider,
      feature: prepared.feature,
      model,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      success: false,
      errorCode: 'missing_api_key',
    });
    return mockResult(prepared, true);
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
    console.warn(`[ai] provider=${provider} feature=${prepared.feature} model=${model} failed code=${code}; using mock fallback`);
    logUsage({
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
    });
    return mockResult(prepared, true);
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
    timeoutMs: Math.min(opts.timeoutMs ?? guard.timeoutMs, guard.timeoutMs),
    user,
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
  return {
    text: extractResponsesText(response),
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
  return {
    text: response.choices?.[0]?.message?.content ?? '',
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

function mockResult(opts: PreparedCall, fellBackToMock: boolean): AIResult {
  const result = {
    text: opts.asJSON ? JSON.stringify(mockBrief(opts.user), null, 2) : mockText(opts),
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
  return result;
}

function usageEvent(input: Omit<AIUsage & {
  provider: AIProvider;
  feature: string;
  model: string;
}, 'estimatedCostUsd'>): AIUsage & { provider: AIProvider; feature: string; model: string } {
  return { ...input, estimatedCostUsd: null };
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
