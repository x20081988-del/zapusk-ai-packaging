import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth.js';
import { callBridge, relayBridge } from '../lib/decideBridge.js';

// Sprint 63.P1 - очередь решений владельца в вебе.
//
// Источник правды по решениям живет в ~/telegram-agent (Python, SQLite), а не здесь.
// Кокпит - веб-лицо: он ходит в decide_bridge по HTTP и ничего не дублирует в Prisma.
// Причина такого разделения простая: CRM, задачи, агенты и launchd-джобы владельца
// уже работают в telegram-agent, и переписывать их на Node означало бы завести вторую
// правду о том, какие решения ждут ответа.
//
// Секрет моста живет только на сервере. Браузер про него не знает и знать не должен:
// фронт авторизуется обычным JWT, а мост наружу держит Express.
//
// Транспорт и таксономия ошибок общие с routes/reports.ts - см. lib/decideBridge.ts.

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

decideRoutes.get('/', async (_req, res) => {
  const t0 = Date.now();
  const result = await callBridge('/decide');
  // Пакет не кешируется нигде: ни здесь, ни в Prisma, ни в браузере. Показывать
  // вчерашнюю очередь как сегодняшнюю - это и есть «выдуманные карточки».
  res.setHeader('Cache-Control', 'no-store');
  relayBridge(result, res, (body) => {
    const pack = (body as { pack?: unknown } | null)?.pack;
    if (!pack || typeof pack !== 'object') {
      console.warn('[decide] bridge 200 без pack');
      return res.status(502).json({ error: 'source', detail: 'источник вернул ответ без пакета' });
    }
    console.log(`[decide] GET status=200 ms=${Date.now() - t0}`);
    return res.json({ ok: true, pack });
  }, 'decide');
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
  relayBridge(result, res, (body) => {
    const payload = body as { ok?: unknown; detail?: string } | null;
    const detail = payload?.detail ?? 'принято';
    // Второй пояс к 409 от моста: даже если источник когда-нибудь отдаст отказ
    // кодом 200, «ok: false» тут не станет успехом. Успех подтверждается явно.
    if (payload?.ok === false) {
      console.warn(`[decide] source refused kind=${parsed.data.kind} action=${parsed.data.action}`);
      return res.status(409).json({ error: 'source_refused', detail });
    }
    console.log(
      `[decide] POST status=200 ms=${Date.now() - t0} kind=${parsed.data.kind} action=${parsed.data.action}`,
    );
    return res.json({ ok: true, detail });
  }, 'decide');
});
