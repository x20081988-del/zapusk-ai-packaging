import { Router } from 'express';
import { requireSuperAdmin } from '../auth.js';
import { callBridge, relayBridge } from '../lib/decideBridge.js';

// Sprint 63.P3 - отчеты, которые раньше приходили владельцу в телеграм-бота.
//
// Один маршрут на все отчеты, а не по маршруту на каждый: их дюжина, и заводить
// дюжину путей значило бы дюжину раз повторить гейт роли, таймаут и таксономию
// ошибок. Белый список живет на стороне источника (decide_bridge.REPORTS) - здесь
// имя просто пробрасывается, а неизвестное возвращается как 404 от моста.
//
// Форма ответа: { ok, name, text, facts? }. text есть всегда, facts - там, где у
// генератора есть структура. Экран рисует facts, если они пришли, иначе показывает
// text. Так новый отчет попадает на экран без переписывания генератора.

export const reportsRoutes = Router();

// Те же данные, что и очередь решений: балансы, здоровье джоб, аудиты.
// Это личные операционные сводки владельца, делиться ими не с кем.
reportsRoutes.use(requireSuperAdmin());

// Имя отчета приходит из URL и уходит в путь запроса к мосту. Ограничиваем алфавит,
// чтобы из него нельзя было собрать другой путь: только строчные буквы, цифры,
// дефис и подчеркивание.
const NAME_RE = /^[a-z0-9_-]{1,40}$/;

reportsRoutes.get('/:name', async (req, res) => {
  const name = String(req.params.name ?? '');
  if (!NAME_RE.test(name)) {
    return res.status(400).json({ error: 'bad_report_name' });
  }
  const t0 = Date.now();
  const result = await callBridge(`/report/${name}`);
  res.setHeader('Cache-Control', 'no-store');
  relayBridge(result, res, (body) => {
    const payload = body as
      | { text?: unknown; facts?: unknown; age_sec?: unknown; stale?: unknown }
      | null;
    if (typeof payload?.text !== 'string') {
      console.warn(`[reports] bridge 200 без text: ${name}`);
      return res.status(502).json({ error: 'source', detail: 'источник вернул отчет без текста' });
    }
    console.log(`[reports] GET ${name} status=200 ms=${Date.now() - t0} age=${payload.age_sec ?? '?'}`);
    // Возраст и признак протухания пробрасываем как есть: отчет строится десятки
    // секунд и живет в кэше моста, поэтому экран обязан показать, КОГДА измеряли.
    // Отдать цифру без метки времени значит выдать снимок за живой поток.
    return res.json({
      ok: true,
      name,
      text: payload.text,
      facts: payload.facts ?? null,
      age_sec: typeof payload.age_sec === 'number' ? payload.age_sec : null,
      stale: payload.stale === true,
    });
  }, 'reports');
});
