import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth.js';
import { callBridge, relayBridge } from '../lib/decideBridge.js';

// Sprint 63.P12 - CRM владельца (founder_crm) в личном кабинете.
//
// Тот же принцип, что у /api/decide: источник правды живет в ~/telegram-agent
// (Python, SQLite), кокпит - веб-лицо и ходит в мост по HTTP. В Prisma ничего
// не дублируется, кеша нет: доска строится источником из локальной базы за
// миллисекунды, а вчерашняя CRM, показанная как сегодняшняя, - вранье.
//
// Мост отдает ровно доску founder_crm (карточки 4 стримов со следующим шагом),
// НЕ crm_web целиком - без переписки, контактной базы и проектов.

export const crmRoutes = Router();

// CRM - личные сделки владельца с PII контактов. Только SUPER_ADMIN, как /decide.
crmRoutes.use(requireSuperAdmin());

const boardQuerySchema = z.object({
  status: z.enum(['active', 'won', 'lost', 'paused', 'all']).default('active'),
  stream: z.string().trim().max(40).optional(),
});

crmRoutes.get('/', async (req, res) => {
  const t0 = Date.now();
  const parsed = boardQuerySchema.safeParse({
    status: String(req.query.status ?? 'active'),
    stream: req.query.stream ? String(req.query.stream) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  }
  const q = new URLSearchParams({ status: parsed.data.status });
  if (parsed.data.stream) q.set('stream', parsed.data.stream);
  const result = await callBridge(`/crm?${q.toString()}`);
  res.setHeader('Cache-Control', 'no-store');
  relayBridge(result, res, (body) => {
    const board = (body as { board?: unknown } | null)?.board;
    if (!board || typeof board !== 'object') {
      console.warn('[crm] bridge 200 без board');
      return res.status(502).json({ error: 'source', detail: 'источник вернул ответ без доски' });
    }
    console.log(`[crm] GET status=200 ms=${Date.now() - t0}`);
    return res.json({ ok: true, board });
  }, 'crm');
});

// Действия зеркалят CRM_ACTIONS моста. Валидация здесь дублируется сознательно:
// фронт не должен уметь отправить то, что источник молча обрежет или отклонит.
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('next_step'),
    id: z.number().int().positive(),
    text: z.string().trim().min(1).max(500),
    owner: z.enum(['owner', 'agent', 'contact']).default('owner'),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    action: z.literal('stage'),
    id: z.number().int().positive(),
    stage: z.string().trim().min(1).max(120),
  }),
  z.object({ action: z.literal('touch'), id: z.number().int().positive() }),
  z.object({ action: z.literal('complete'), id: z.number().int().positive() }),
  z.object({
    action: z.literal('snooze'),
    id: z.number().int().positive(),
    days: z.number().int().min(1).max(30).default(3),
  }),
  z.object({
    action: z.literal('status'),
    id: z.number().int().positive(),
    status: z.enum(['active', 'won', 'lost', 'paused']),
  }),
]);

crmRoutes.post('/action', async (req, res) => {
  const t0 = Date.now();
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
  }
  const result = await callBridge('/crm', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  });
  res.setHeader('Cache-Control', 'no-store');
  relayBridge(result, res, (body) => {
    const payload = body as { ok?: unknown; detail?: string } | null;
    // Тот же контракт, что у /decide: успех подтверждается ТОЛЬКО явным ok:true.
    // Отказы мост отдает кодами (400/409), и relayBridge их уже развел выше.
    if (payload?.ok !== true) {
      console.warn(`[crm] source did not confirm action=${parsed.data.action}`);
      return res.status(502).json({ error: 'source', detail: 'источник не подтвердил действие' });
    }
    console.log(`[crm] POST action=${parsed.data.action} status=200 ms=${Date.now() - t0}`);
    return res.json({ ok: true, detail: payload.detail ?? 'принято' });
  }, 'crm');
});
