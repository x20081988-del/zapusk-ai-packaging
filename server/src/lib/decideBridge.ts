import type { Response } from 'express';
import { env } from '../env.js';

// Sprint 63.P3 - общий транспорт к decide_bridge на маке.
//
// Вынесено из routes/decide.ts, когда появился второй потребитель (routes/reports.ts).
// Держать две копии таймаута, разбора ответа и таксономии ошибок нельзя: они
// разъедутся, и один экран начнет врать про недоступность источника иначе, чем
// другой. Владельцу нужно, чтобы «мак спит» выглядело одинаково везде.

/** Ответ моста, разобранный до состояния «можно отдавать клиенту». */
export type BridgeResult =
  | { kind: 'ok'; status: number; body: unknown }
  | { kind: 'unreachable'; reason: string }
  | { kind: 'unconfigured' };

export function bridgeConfigured(): boolean {
  return Boolean(env.DECIDE_BRIDGE_URL && env.DECIDE_BRIDGE_TOKEN);
}

export async function callBridge(path: string, init: RequestInit = {}): Promise<BridgeResult> {
  if (!bridgeConfigured()) return { kind: 'unconfigured' };
  const url = `${env.DECIDE_BRIDGE_URL.replace(/\/+$/, '')}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        'X-Decide-Token': env.DECIDE_BRIDGE_TOKEN,
        ...((init.headers as Record<string, string>) ?? {}),
      },
      signal: AbortSignal.timeout(env.DECIDE_BRIDGE_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Мост всегда отвечает JSON. Не-JSON означает, что мы разговариваем не с ним
      // (перехватывающий прокси, портал авторизации) - это недоступность источника,
      // а не пустой ответ.
      return { kind: 'unreachable', reason: 'non_json_response' };
    }
    return { kind: 'ok', status: res.status, body };
  } catch (e) {
    // Мак спит, сеть отвалилась, туннель лег, таймаут. Для владельца это все один
    // случай: источник сейчас не отвечает.
    const reason = e instanceof Error ? e.name : 'unknown';
    return { kind: 'unreachable', reason };
  }
}

/**
 * Разложить ответ моста в HTTP-ответ кокпита.
 *
 * Здесь живет вся суть: состояния обязаны быть различимы по КОДУ, а не по тексту.
 * Пустой результат - это 200. Недоступный источник - 503. Спутать их нельзя: экран,
 * который на «мак спит» рисует «данных нет», врет владельцу ровно в тот момент,
 * когда данные есть, но недостижимы.
 */
export function relayBridge(
  result: BridgeResult,
  res: Response,
  onOk: (body: unknown) => void,
  tag = 'bridge',
) {
  if (result.kind === 'unconfigured') {
    console.warn(`[${tag}] not configured: DECIDE_BRIDGE_URL/TOKEN пусты`);
    return res.status(503).json({ error: 'source_not_configured' });
  }
  if (result.kind === 'unreachable') {
    console.warn(`[${tag}] unreachable: ${result.reason}`);
    return res.status(503).json({ error: 'source_unreachable' });
  }
  const { status, body } = result;
  const detail = (body as { detail?: string } | null)?.detail;
  if (status === 401 || status === 403) {
    // Секрет разъехался между кокпитом и мостом. Лечится не «разбудить мак», а
    // обновлением DECIDE_BRIDGE_TOKEN - поэтому отдельный код.
    console.error(`[${tag}] rejected our token - проверь DECIDE_BRIDGE_TOKEN`);
    return res.status(502).json({ error: 'source_auth' });
  }
  if (status === 404) {
    const err = (body as { error?: string } | null)?.error ?? 'not_found';
    return res.status(404).json({ error: err });
  }
  if (status === 429) return res.status(429).json({ error: 'source_rate_limited' });
  if (status === 409) {
    return res.status(409).json({ error: 'source_refused', detail: detail ?? 'источник отклонил запрос' });
  }
  if (status === 400) {
    const err = (body as { error?: string } | null)?.error ?? 'bad_request';
    return res.status(400).json({ error: err, detail: detail ?? 'источник отклонил запрос' });
  }
  if (status >= 500) {
    console.warn(`[${tag}] 5xx: ${status}`);
    return res.status(502).json({ error: 'source', detail: detail ?? 'источник не смог' });
  }
  if (status !== 200) {
    return res.status(502).json({ error: 'source', detail: `неожиданный код ${status}` });
  }
  return onOk(body);
}

/**
 * Забрать бинарь (картинку) из моста.
 *
 * Отдельно от callBridge: тот разбирает JSON, а тут нужны байты как есть. Тип
 * содержимого берем от моста, но пропускаем только картинки - мост по контракту
 * ничего другого отсюда не отдает, и полагаться на это вслепую не стоит.
 */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

export async function fetchBridgeBinary(
  path: string,
): Promise<{ ok: true; body: Buffer; contentType: string } | { ok: false; status?: number; error?: string }> {
  if (!bridgeConfigured()) return { ok: false, status: 503, error: 'source_not_configured' };
  try {
    const res = await fetch(`${env.DECIDE_BRIDGE_URL.replace(/\/+$/, '')}${path}`, {
      headers: { 'X-Decide-Token': env.DECIDE_BRIDGE_TOKEN },
      signal: AbortSignal.timeout(env.DECIDE_BRIDGE_TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, status: 404, error: 'not_found' };
    if (!res.ok) return { ok: false, status: 502, error: 'source' };
    const contentType = res.headers.get('content-type') ?? '';
    if (!IMAGE_TYPES.has(contentType.split(';')[0].trim())) {
      console.warn(`[decide] image: неожиданный тип ${contentType}`);
      return { ok: false, status: 502, error: 'source' };
    }
    return { ok: true, body: Buffer.from(await res.arrayBuffer()), contentType };
  } catch {
    return { ok: false, status: 503, error: 'source_unreachable' };
  }
}
