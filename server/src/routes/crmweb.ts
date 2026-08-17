import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../auth.js';
import { callBridge, relayBridge, type BridgeResult } from '../lib/decideBridge.js';
import { loadSnapshot, saveSnapshot } from '../lib/bridgeSnapshot.js';

// Sprint 63.P13 - CRM целиком в кабинете: /pm (направления, проекты, задачи,
// петля «Сделать»), канбан всех карточек, воронки сделок.
//
// Источник правды в telegram-agent (crm_web + founder_crm/crm_deals/founder_tasks);
// мост /crmweb/* отдает те же view и мутации, что токен-ссылка владельца. Здесь -
// только гейт, валидация и таксономия ошибок, общая с /decide и /crm.

export const crmwebRoutes = Router();

// Вся CRM владельца с PII контактов и сделок - только SUPER_ADMIN, как /decide.
crmwebRoutes.use(requireSuperAdmin());

const int = z.number().int().positive();
const slug = z.string().trim().regex(/^[a-z0-9_-]{1,64}$/i);

/**
 * GET-passthrough: тело моста отдаем как есть, ошибки - через relayBridge.
 *
 * Sprint 64.P2: успешное тело сохраняется снимком (ключ = путь моста), а при
 * недоступном маке снимок отдается с `stale: true` и `fetched_at` вместо 503 -
 * то же поведение, что у /decide. Экраны в stale глушат мутации. `snapshot:
 * false` выключает это для живых процессов (опрос прогона): застывший статус
 * прогона выглядел бы как работающий агент, которого на спящем маке нет.
 */
function relayGet(bridgePath: (req: Request) => string | null, tag: string, snapshot = true) {
  return async (req: Request, res: Response) => {
    const t0 = Date.now();
    const path = bridgePath(req);
    if (path === null) {
      return res.status(400).json({ error: 'validation_failed' });
    }
    const result = await callBridge(path);
    res.setHeader('Cache-Control', 'no-store');
    if (snapshot && result.kind === 'unreachable') {
      const snap = await loadSnapshot(path);
      if (snap && typeof snap.value === 'object' && snap.value !== null) {
        console.log(`[crmweb] GET ${tag} stale snapshot from ${snap.fetched_at} ms=${Date.now() - t0}`);
        return res.json({ ...(snap.value as Record<string, unknown>), stale: true, fetched_at: snap.fetched_at });
      }
      // Снимка нет - прежний честный 503 через relayBridge ниже.
    }
    relayBridge(result, res, (body) => {
      if (snapshot && body && typeof body === 'object') void saveSnapshot(path, body);
      console.log(`[crmweb] GET ${tag} status=200 ms=${Date.now() - t0}`);
      return res.json(body);
    }, 'crmweb');
  };
}

crmwebRoutes.get('/cards', relayGet(() => '/crmweb/cards', 'cards'));
crmwebRoutes.get('/meta', relayGet(() => '/crmweb/meta', 'meta'));
crmwebRoutes.get('/pm', relayGet(() => '/crmweb/pm', 'pm'));

crmwebRoutes.get('/deals', relayGet((req) => {
  const raw = String(req.query.pipeline ?? '');
  if (raw && !slug.safeParse(raw).success) return null;
  return raw ? `/crmweb/deals?pipeline=${encodeURIComponent(raw)}` : '/crmweb/deals';
}, 'deals'));

crmwebRoutes.get('/deal', relayGet((req) => {
  const id = Number(req.query.id);
  if (!int.safeParse(id).success) return null;
  return `/crmweb/deal?id=${id}`;
}, 'deal'));

crmwebRoutes.get('/pm/direction', relayGet((req) => {
  const code = String(req.query.code ?? '');
  if (!slug.safeParse(code).success) return null;
  return `/crmweb/pm/direction?code=${encodeURIComponent(code)}`;
}, 'pm/direction'));

crmwebRoutes.get('/pm/project', relayGet((req) => {
  const code = String(req.query.code ?? '');
  if (!slug.safeParse(code).success) return null;
  return `/crmweb/pm/project?code=${encodeURIComponent(code)}`;
}, 'pm/project'));

crmwebRoutes.get('/run', relayGet((req) => {
  const id = Number(req.query.id);
  if (!int.safeParse(id).success) return null;
  return `/crmweb/run?id=${id}`;
}, 'run', false));

// --- Мутации -----------------------------------------------------------------
// Валидация зеркалит контракты источника (apply_action/apply_deal_action/
// apply_pm_action/apply_act/apply_answer): фронт не должен уметь отправить то,
// что источник молча обрежет.

const cardActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('decline'), id: int }),
  z.object({ action: z.literal('reactivate'), id: int }),
  z.object({ action: z.literal('snooze'), id: int }),
  z.object({ action: z.literal('complete_step'), id: int }),
  z.object({ action: z.literal('set_stage'), id: int, stage: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal('set_next_step'), id: int,
    text: z.string().trim().min(1).max(500),
    owner: z.enum(['owner', 'agent', 'contact']).default('owner'),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
]);

const dealActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_stage'), id: int, stage: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal('set_status'), id: int, status: z.enum(['active', 'won', 'lost', 'paused']) }),
  z.object({
    action: z.literal('set_next_step'), id: int,
    text: z.string().trim().min(1).max(500),
    owner: z.enum(['owner', 'agent', 'contact']).default('owner'),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({ action: z.literal('add_note'), id: int, text: z.string().trim().min(1).max(2000) }),
]);

const pmActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('close_task'), task_id: int, resolution: z.string().trim().max(400).optional() }),
  z.object({ action: z.literal('drop_task'), task_id: int, resolution: z.string().trim().max(400).optional() }),
  z.object({ action: z.literal('toggle_sub'), id: int, done: z.boolean() }),
]);

const actSchema = z.object({ task_id: int });
const answerSchema = z.object({ run_id: int, text: z.string().trim().min(1).max(2000) });

function relayPost(schema: z.ZodTypeAny, bridgePath: string, tag: string) {
  return async (req: Request, res: Response) => {
    const t0 = Date.now();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation_failed', issues: parsed.error.flatten().fieldErrors });
    }
    const result: BridgeResult = await callBridge(bridgePath, {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    res.setHeader('Cache-Control', 'no-store');
    // Дневной потолок прогонов от /act: relayBridge превратил бы 429 в общее
    // source_rate_limited и съел причину - а «потолок прогонов» и «мост просит
    // притормозить» лечатся по-разному, владелец должен видеть какое из двух.
    if (result.kind === 'ok' && result.status === 429 && (result.body as { error?: string } | null)?.error === 'cap') {
      const detail = (result.body as { detail?: string }).detail ?? 'дневной потолок прогонов';
      return res.status(429).json({ error: 'cap', detail });
    }
    relayBridge(result, res, (body) => {
      const payload = body as { ok?: unknown } | null;
      // Успех подтверждается только явным ok:true - контракт всех apply_* источника.
      if (payload?.ok !== true) {
        console.warn(`[crmweb] source did not confirm ${tag}`);
        return res.status(502).json({ error: 'source', detail: 'источник не подтвердил действие' });
      }
      console.log(`[crmweb] POST ${tag} status=200 ms=${Date.now() - t0}`);
      return res.json(body);
    }, 'crmweb');
  };
}

crmwebRoutes.post('/action', relayPost(cardActionSchema, '/crmweb/action', 'action'));
crmwebRoutes.post('/deal-action', relayPost(dealActionSchema, '/crmweb/deal_action', 'deal-action'));
crmwebRoutes.post('/pm-action', relayPost(pmActionSchema, '/crmweb/pm_action', 'pm-action'));
crmwebRoutes.post('/act', relayPost(actSchema, '/crmweb/act', 'act'));
crmwebRoutes.post('/answer', relayPost(answerSchema, '/crmweb/answer', 'answer'));
