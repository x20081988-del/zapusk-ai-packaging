// Sprint 17: Lovable provider client.
//
// Lovable генерирует landing / one-pager / web-версии pitch deck'а.
// Контракт API публично не задокументирован — реализуем best-effort POST
// на {base_url}/projects, ожидаем {id, url, preview_url, status} в ответе.
// Если ответ не такой — берём то, что есть, и кладём raw JSON в resultJson
// для аудита.
//
// Без LOVABLE_API_KEY клиент возвращает детерминированный mock preview URL,
// чтобы UX flow не блокировался на интеграции.
//
// Non-goals: нет webhook'а на статус сборки, нет polling'а. Если Lovable
// возвращает status='processing' — мы это сохраняем как есть и UI покажет
// «Идёт сборка». Будущий sprint добавит polling/webhook.

import { env } from '../env.js';

export interface LovableCreateInput {
  /** Resolved prompt для Lovable (наполнение страницы). */
  prompt: string;
  /** Метаданные для аудита и идентификации проекта в Lovable. */
  metadata: {
    projectId: string;
    templateKey: string;
    outputType: string;
    /** Человеческое имя — Lovable использует в заголовке проекта. */
    projectName?: string;
  };
  /** Timeout, ms. По умолчанию 30 сек. */
  timeoutMs?: number;
}

export interface LovableCreateResult {
  /** Внешний id у Lovable (для будущего polling'а / повторной выборки). */
  providerJobId: string | null;
  /** URL preview'а — куда инвестор смотрит сгенерированный landing. */
  previewUrl: string | null;
  /** URL project'а в Lovable IDE — куда команда заходит редактировать. */
  projectUrl: string | null;
  /** Статус сборки от Lovable. У нас два сценария: 'succeeded' (live URL
   *  есть) или 'running' (Lovable ещё генерирует). */
  status: 'succeeded' | 'running' | 'failed' | 'mock';
  /** Raw JSON ответа провайдера — для аудита и debug'а. */
  raw: unknown | null;
  /** Короткий errorCode без секретов, если status='failed'. */
  errorCode: string | null;
  errorMessage: string | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function isLovableConfigured(): boolean {
  return Boolean(env.LOVABLE_API_KEY && env.LOVABLE_API_KEY.length > 6 && env.LOVABLE_API_BASE_URL);
}

export async function createLovableApp(input: LovableCreateInput): Promise<LovableCreateResult> {
  if (!isLovableConfigured()) {
    return mockResult('lovable_key_missing', 'LOVABLE_API_KEY не настроен — показан mock preview.', input);
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${env.LOVABLE_API_BASE_URL.replace(/\/$/, '')}/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        name: input.metadata.projectName ?? input.metadata.templateKey,
        // Lovable принимает произвольные metadata — мы кладём референс на
        // наш projectId, чтобы можно было связать обратно.
        metadata: {
          source: 'zapusk-ai',
          zapusk_project_id: input.metadata.projectId,
          template_key: input.metadata.templateKey,
          output_type: input.metadata.outputType,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await safeText(res);
      const code = res.status === 429 ? 'rate_limited'
        : res.status === 401 ? 'unauthorized'
        : res.status === 403 ? 'forbidden'
        : res.status >= 500 ? `server_${res.status}`
        : `bad_request_${res.status}`;
      // ВАЖНО: НЕ логируем full body — там может быть echo нашего prompt'а
      // с проектной финмоделью. Только status и первые 240 символов.
      console.warn(`[lovable] ${code}: ${text.slice(0, 240)}`);
      return {
        providerJobId: null,
        previewUrl: null,
        projectUrl: null,
        status: 'failed',
        raw: null,
        errorCode: code,
        errorMessage: humanizeError(code),
      };
    }

    const json = (await res.json()) as Record<string, unknown>;
    // Lovable response shape (best-effort, не задокументирован):
    //   { id, url, preview_url, status }
    // Возможные альтернативы — project_url / projectUrl / live_url. Берём
    // первое непустое поле, чтобы выживать на drift'е API.
    const providerJobId = stringOrNull(json.id) ?? stringOrNull(json.project_id);
    const previewUrl = stringOrNull(json.preview_url) ?? stringOrNull(json.previewUrl) ?? stringOrNull(json.live_url);
    const projectUrl = stringOrNull(json.url) ?? stringOrNull(json.project_url) ?? stringOrNull(json.projectUrl) ?? stringOrNull(json.dashboard_url);
    const rawStatus = stringOrNull(json.status) ?? '';
    const status: LovableCreateResult['status'] = previewUrl
      ? 'succeeded'
      : /processing|running|queued|building/i.test(rawStatus)
        ? 'running'
        : 'succeeded'; // если Lovable вернул 2xx без preview — считаем готовым (как минимум есть projectUrl)

    return {
      providerJobId,
      previewUrl,
      projectUrl,
      status,
      raw: json,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const code = e.name === 'AbortError' ? 'timeout'
      : /ECONN|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(e.message ?? '') ? 'network'
      : 'unknown';
    console.warn(`[lovable] ${code}: ${e.message ?? 'unknown'}`);
    return {
      providerJobId: null,
      previewUrl: null,
      projectUrl: null,
      status: 'failed',
      raw: null,
      errorCode: code,
      errorMessage: humanizeError(code),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Mock используется в трёх сценариях:
//   1. Нет LOVABLE_API_KEY — демо-режим
//   2. (Future) запрос отменён пользователем
// Возвращаем URL'ы, которые UI рендерит как ссылку на лендинг — даже без
// реального Lovable. zapusk.tech/demo сейчас содержит подготовленный
// шаблонный landing, на него и ведём как mock preview.
function mockResult(code: string, message: string, input: LovableCreateInput): LovableCreateResult {
  const safeKey = encodeURIComponent(input.metadata.templateKey);
  const projectSlug = encodeURIComponent(input.metadata.projectId.slice(0, 8));
  return {
    providerJobId: `mock-${projectSlug}-${safeKey}`,
    previewUrl: `https://zapusk.tech/demo/${safeKey}?project=${projectSlug}`,
    projectUrl: `https://zapusk.tech/demo/${safeKey}?project=${projectSlug}&mode=editor`,
    status: 'mock',
    raw: null,
    errorCode: code,
    errorMessage: message,
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function humanizeError(code: string): string {
  switch (code) {
    case 'rate_limited': return 'Lovable: слишком много запросов. Повторите через минуту.';
    case 'unauthorized': return 'Lovable: ключ не принят сервером.';
    case 'forbidden': return 'Lovable: доступ запрещён для текущего ключа.';
    case 'timeout': return 'Lovable: превышено время ожидания ответа.';
    case 'network': return 'Lovable: сеть недоступна.';
    default: return code.startsWith('server_') ? 'Lovable временно недоступен.' : 'Не удалось создать проект в Lovable.';
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
