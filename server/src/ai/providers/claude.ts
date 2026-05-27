// Sprint 17: standalone Claude (Anthropic) client. В отличие от aiClient,
// который завязан на глобальный env.AI_PROVIDER, этот клиент используется
// per-template в Packaging Pipeline для шаблонов с provider='claude'
// (financial, calculator_spec) независимо от того, какой основной AI настроен
// на инстансе.
//
// Что важно:
// • timeout (45s — финмодели большие, Markdown ответ может быть длинным)
// • safe logging (НЕ логируем ANTHROPIC_API_KEY ни в каком виде)
// • короткие errorCode без секретов наружу
// • retry ТОЛЬКО на transient errors (429 rate-limit, 5xx, network).
//   401/403 не повторяем — это конфигурационная проблема.
// • usage logging, если SDK вернул токены.
//
// Non-goals: нет async queue, нет webhook'ов — это синхронный вызов.

import { env } from '../../env.js';

export interface ClaudeTextResult {
  text: string;
  model: string;
  provider: 'anthropic' | 'mock';
  fellBackToMock: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ClaudeCallOptions {
  /** System prompt — характер и tone-of-voice. */
  system?: string;
  /** Resolved user prompt (template body with placeholders заполнены). */
  user: string;
  /** Какую модель использовать. Если не указано — env.ANTHROPIC_MODEL_MAIN. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Имя feature для usage log'а (e.g. 'packaging.financial'). */
  feature: string;
  /** Soft timeout. По умолчанию 45 сек. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 4_000;

/** Признак сконфигурирован ли Claude в этом инстансе. */
export function isClaudeConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 10);
}

export async function claudeGenerateText(opts: ClaudeCallOptions): Promise<ClaudeTextResult> {
  if (!isClaudeConfigured()) {
    return mockResult('anthropic_key_missing', 'ANTHROPIC_API_KEY не настроен — показан детерминированный fallback.');
  }

  const model = opts.model ?? env.ANTHROPIC_MODEL_MAIN;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();

  // Sprint 62.P5 — pre-call structured log so we can diagnose 400/422 etc
  // when they fire. No secrets — only feature/model/lengths/maxTokens.
  const systemLen = opts.system ? opts.system.length : 0;
  const userLen = opts.user ? opts.user.length : 0;
  console.log(
    `[claude:request] feature=${opts.feature} model=${model} ` +
    `systemLen=${systemLen} userLen=${userLen} maxTokens=${maxTokens} ` +
    `temperature=${opts.temperature ?? 0.4}`,
  );

  // Sprint 62.P5 — refuse early if user content is empty/blank. Anthropic
  // returns 400 invalid_request_error for empty messages content; better to
  // short-circuit with an explicit code than log a confusing «bad_request».
  if (!opts.user || !opts.user.trim()) {
    const msg = 'Empty user content — refusing call (would 400 on Anthropic).';
    console.warn(`[claude] ${opts.feature} empty_user_content: ${msg}`);
    return mockResult('empty_user_content', msg);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const res = await withRetryAndTimeout(
      (signal) => client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          temperature: opts.temperature ?? 0.4,
          system: opts.system,
          messages: [{ role: 'user', content: opts.user }],
        },
        { signal } as never,
      ),
      timeoutMs,
    );

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();

    const inputTokens = numberOrNull(res.usage?.input_tokens);
    const outputTokens = numberOrNull(res.usage?.output_tokens);
    logUsage({
      provider: 'anthropic',
      feature: opts.feature,
      model,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      success: true,
    });

    return {
      text,
      model,
      provider: 'anthropic',
      fellBackToMock: false,
      errorCode: null,
      errorMessage: null,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    const { code, message, transient } = classifyError(err);
    // Sprint 62.P5 — extended diagnostic context. SDK message is included
    // (truncated) so we can see why Anthropic actually rejected the call.
    // Anthropic API errors don't include the API key in their response body,
    // and we never log the request body itself — only metadata.
    const sdkErr = err as { status?: number; error?: { type?: string; message?: string; request_id?: string }; request_id?: string };
    const requestId = sdkErr.request_id ?? sdkErr.error?.request_id ?? null;
    const status = sdkErr.status ?? null;
    const sdkType = sdkErr.error?.type ?? null;
    const sdkMessage = (sdkErr.error?.message ?? '').slice(0, 240);
    console.warn(
      `[claude] ${opts.feature} ${code} ${transient ? '(transient) ' : ''}` +
      `model=${model} status=${status ?? '-'} sdkType=${sdkType ?? '-'} ` +
      `requestId=${requestId ?? '-'} systemLen=${systemLen} userLen=${userLen} ` +
      `maxTokens=${maxTokens}: ${message}` +
      (sdkMessage ? ` | sdk: "${sdkMessage}"` : ''),
    );
    logUsage({
      provider: 'anthropic',
      feature: opts.feature,
      model,
      latencyMs: Date.now() - started,
      inputTokens: null,
      outputTokens: null,
      success: false,
      errorCode: code,
    });
    return mockResult(code, message);
  }
}

/** Same as generateText, but pre-pends a brief JSON instruction so Claude
 *  returns structured Markdown / JSON. Не gives schema validation, parsing
 *  делает caller. */
export async function claudeGenerateJson(opts: ClaudeCallOptions): Promise<ClaudeTextResult> {
  const wrapped = {
    ...opts,
    user: `${opts.user}\n\nВерни строго JSON без markdown-обёрток. Никаких комментариев вне JSON.`,
    temperature: opts.temperature ?? 0.2,
  };
  return claudeGenerateText(wrapped);
}

function mockResult(errorCode: string, errorMessage: string): ClaudeTextResult {
  return {
    text: '',
    model: 'mock',
    provider: 'mock',
    fellBackToMock: true,
    errorCode,
    errorMessage,
    inputTokens: null,
    outputTokens: null,
  };
}

interface ClassifiedError { code: string; message: string; transient: boolean }

function classifyError(err: unknown): ClassifiedError {
  // SDK error shape: { status, error: { type, message } }
  const e = err as { status?: number; error?: { type?: string; message?: string }; name?: string; message?: string };
  const status = typeof e.status === 'number' ? e.status : null;
  const sdkType = e.error?.type ?? null;
  const sdkMessage = e.error?.message ?? '';

  // Transient: rate-limit, server errors, network/timeout.
  if (status === 429) return { code: 'rate_limited', message: 'Слишком много запросов. Повторите позже.', transient: true };
  if (status && status >= 500 && status < 600) return { code: `server_${status}`, message: 'Провайдер временно недоступен.', transient: true };

  // Configuration / no retry.
  if (status === 401) return { code: 'unauthorized', message: 'Ключ Anthropic не принят сервером.', transient: false };
  if (status === 403) return { code: 'forbidden', message: 'Доступ к Anthropic запрещён для текущего ключа.', transient: false };
  // Sprint 18: 404 — обычно «model_not_found». Различаем, чтобы ops быстро понимали
  // что лечить (env var vs модель).
  if (status === 404 || sdkType === 'not_found_error' || /model.*not.*found/i.test(sdkMessage)) {
    return { code: 'model_not_found', message: 'Указанная модель Anthropic не существует. Проверьте ANTHROPIC_MODEL_MAIN.', transient: false };
  }
  if (status === 400) {
    // Иногда invalid_request_error содержит «model X does not exist» внутри message.
    if (/model/i.test(sdkMessage) && /not.*exist|invalid/i.test(sdkMessage)) {
      return { code: 'model_not_found', message: 'Модель Anthropic не существует. Проверьте ANTHROPIC_MODEL_MAIN.', transient: false };
    }
    return { code: `bad_request${sdkType ? `_${sdkType}` : ''}`, message: 'Некорректный запрос к Anthropic.', transient: false };
  }

  // Network / abort.
  if (e.name === 'AbortError') return { code: 'timeout', message: 'Превышено время ожидания ответа Anthropic.', transient: true };
  const fetchLikeMessage = e.message ?? '';
  if (/ECONN|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(fetchLikeMessage)) {
    return { code: 'network', message: 'Сеть до Anthropic недоступна.', transient: true };
  }

  // Sprint 18: если SDK type или сырой message известны — кладём в errorCode, иначе общий 'unknown'.
  if (sdkType) {
    return { code: `sdk_${sdkType}`, message: sdkMessage || 'Неизвестная ошибка Anthropic.', transient: false };
  }
  return { code: 'unknown', message: 'Неизвестная ошибка Anthropic.', transient: false };
}

async function withRetryAndTimeout<T>(
  call: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  // One soft retry on transient errors only. Простая логика — не очередь.
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < 2) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await call(controller.signal);
    } catch (err) {
      lastErr = err;
      const { transient } = classifyError(err);
      if (!transient || attempt >= 1) throw err;
      // Soft backoff (200ms) before retry.
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      clearTimeout(timer);
    }
    attempt += 1;
  }
  throw lastErr;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Structured one-line console log. Никаких ключей, только latency + tokens +
// success/errorCode. Если в будущем подключим централизованный usage логгер
// — этот вызов заменится на него.
interface UsageLog {
  provider: 'anthropic';
  feature: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  success: boolean;
  errorCode?: string | null;
}
function logUsage(event: UsageLog): void {
  if (!env.AI_LOG_USAGE) return;
  const safe = {
    ts: new Date().toISOString(),
    provider: event.provider,
    feature: event.feature,
    model: event.model,
    latencyMs: event.latencyMs,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    success: event.success,
    errorCode: event.errorCode ?? null,
  };
  console.log('[ai.usage]', JSON.stringify(safe));
}
