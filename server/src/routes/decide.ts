import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth.js';
import { env } from '../env.js';

// Sprint 63.P1 - очередь решений владельца в вебе.
//
// Источник правды по решениям живет в ~/telegram-agent (Python, SQLite), а не здесь.
// Кокпит - веб-лицо: он ходит в decide_bridge по HTTP и ничего не дублирует в Prisma.
// Причина такого разделения простая: CRM, задачи, агенты и launchd-джобы владельца
// уже работают в telegram-agent, и переписывать их на Node означало бы завести вторую
// правду о том, какие решения ждут ответа.
//
// Секрет бриджа живет только на сервере. Браузер про него не знает и знать не должен:
// фронт авторизуется обычным JWT, а мост наружу держит Express.

export const decideRoutes = Router();

// Экран решений - личная очередь владельца с PII контактов в карточках. Не ADMIN,
// не MANAGER: у владельца отдельный боевой логин, и делиться этим экраном не с кем.
decideRoutes.use(requireSuperAdmin());

const actionSchema = z.object({
  kind: z.string().trim().min(1).max(40),
  id: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(40),
  // Тот же потолок, что у источника (crm_web.apply_decide), чтобы фронт не мог
  // отправить комментарий, который источник молча обрежет.
  comment: z.string().max(4000).optional(),
});

/** Ответ бриджа, разобранный до состояния «можно отдавать клиенту». */
type BridgeResult =
  | { kind: 'ok'; status: number; body: unknown }
  | { kind: 'unreachable'; reason: string }
  | { kind: 'unconfigured' };

function bridgeConfigured(): boolean {
  return Boolean(env.DECIDE_BRIDGE_URL && env.DECIDE_BRIDGE_TOKEN);
}

async function callBridge(path: string, init: RequestInit = {}): Promise<BridgeResult> {
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
      // Бридж всегда отвечает JSON. Не-JSON означает, что мы разговариваем не с ним
      // (перехватывающий прокси, портал авторизации) - это недоступность источника,
      // а не пустая очередь.
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
 * Разложить ответ бриджа в HTTP-ответ кокпита.
 *
 * Здесь живет вся суть маршрута: три состояния обязаны быть различимы по КОДУ, а не
 * по тексту. Пустая очередь - это 200 с нулем карточек. Недоступный источник - 503.
 * Спутать их нельзя: экран, который на «мак спит» рисует «решений нет», врет владельцу
 * ровно в тот момент, когда решения копятся.
 */
function relay(result: BridgeResult, res: import('express').Response, onOk: (body: any) => void) {
  if (result.kind === 'unconfigured') {
    console.warn('[decide] bridge not configured: DECIDE_BRIDGE_URL/TOKEN пусты');
    return res.status(503).json({ error: 'source_not_configured' });
  }
  if (result.kind === 'unreachable') {
    console.warn(`[decide] bridge unreachable: ${result.reason}`);
    return res.status(503).json({ error: 'source_unreachable' });
  }
  const { status, body } = result;
  const detail = (body as { detail?: string; error?: string } | null)?.detail;
  if (status === 401 || status === 403) {
    // Секрет разъехался между кокпитом и бриджом. Это ошибка настройки, и лечится
    // она не «разбудить мак», а обновлением DECIDE_BRIDGE_TOKEN - поэтому отдельный код.
    console.error('[decide] bridge rejected our token - проверь DECIDE_BRIDGE_TOKEN');
    return res.status(502).json({ error: 'source_auth' });
  }
  if (status === 429) return res.status(429).json({ error: 'source_rate_limited' });
  if (status === 409) {
    // Источник принял запрос и ОТКАЗАЛ: задача уже закрыта, карточка устарела,
    // решение неприменимо. Владельцу нужна причина и рабочие кнопки, а не зеленая
    // галочка: отказ, показанный как успех, это молча потерянное решение.
    return res.status(409).json({ error: 'source_refused', detail: detail ?? 'источник отклонил решение' });
  }
  if (status === 400) {
    const err = (body as { error?: string } | null)?.error ?? 'bad_request';
    return res.status(400).json({ error: err, detail: detail ?? 'источник отклонил решение' });
  }
  if (status >= 500) {
    console.warn(`[decide] bridge 5xx: ${status}`);
    return res.status(502).json({ error: 'source', detail: detail ?? 'источник не смог' });
  }
  if (status !== 200) {
    return res.status(502).json({ error: 'source', detail: `неожиданный код ${status}` });
  }
  return onOk(body);
}

decideRoutes.get('/', async (_req, res) => {
  const t0 = Date.now();
  const result = await callBridge('/decide');
  // Пакет не кешируется нигде: ни здесь, ни в Prisma, ни в браузере. Показывать
  // вчерашнюю очередь как сегодняшнюю - это и есть «выдуманные карточки».
  res.setHeader('Cache-Control', 'no-store');
  relay(result, res, (body) => {
    const pack = (body as { pack?: unknown } | null)?.pack;
    if (!pack || typeof pack !== 'object') {
      console.warn('[decide] bridge 200 без pack');
      return res.status(502).json({ error: 'source', detail: 'источник вернул ответ без пакета' });
    }
    console.log(`[decide] GET status=200 ms=${Date.now() - t0}`);
    return res.json({ ok: true, pack });
  });
});

decideRoutes.post('/action', async (req, res) => {
  const t0 = Date.now();
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  }
  const result = await callBridge('/decide', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  });
  res.setHeader('Cache-Control', 'no-store');
  relay(result, res, (body) => {
    const payload = body as { ok?: unknown; detail?: string } | null;
    const detail = payload?.detail ?? 'принято';
    // Второй пояс к 409 от бриджа: даже если источник когда-нибудь отдаст отказ
    // кодом 200, «ok: false» тут не станет успехом. Успех подтверждается явно.
    if (payload?.ok === false) {
      console.warn(`[decide] source refused kind=${parsed.data.kind} action=${parsed.data.action}`);
      return res.status(409).json({ error: 'source_refused', detail });
    }
    console.log(
      `[decide] POST status=200 ms=${Date.now() - t0} kind=${parsed.data.kind} action=${parsed.data.action}`,
    );
    return res.json({ ok: true, detail });
  });
});
