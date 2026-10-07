import crypto from 'node:crypto';
import { Router } from 'express';
import { requireSuperAdmin } from '../auth.js';
import { env } from '../env.js';
import { loadSnapshot, saveSnapshot } from '../lib/bridgeSnapshot.js';

// Sprint 70 - главная основателя (владелец 07.10.2026: «заходил и все видел на одном
// экране»). Решение владельца: «мак сам шлет сводку». telegram-agent/founder_home.py
// раз в 5 минут кладет готовый JSON в POST /api/home/push, сайт хранит последнюю
// версию снимком и отдает ее с возрастом. Туннель до мака этому экрану не нужен, и
// экран не пустеет, когда мак спит: видно, на какое время цифры.
//
// Ключ записи = HMAC(DECIDE_BRIDGE_TOKEN, PUSH_SALT). Токен уже есть и на маке, и в
// Render, нового секрета заводить не нужно, а утечка ключа записи не раскрывает
// ключ моста. Выборку и подписи считает мак, здесь только гейт и хранение.

const SNAP_KEY = 'founder-home';
const PUSH_SALT = 'founder-home-push-v1';
const MAX_BYTES = 512 * 1024;
const SECTIONS = ['telegram', 'tasks', 'reporting', 'services', 'revenue', 'products', 'depts'];

function pushKey(): string | null {
  if (!env.DECIDE_BRIDGE_TOKEN) return null;
  return crypto.createHmac('sha256', env.DECIDE_BRIDGE_TOKEN.trim()).update(PUSH_SALT).digest('hex');
}

function sameKey(got: string, expected: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Прием стоит ДО authedAndActive: пишет мак, а не пользователь кабинета.
export const homePushRoutes = Router();

homePushRoutes.post('/push', async (req, res) => {
  const expected = pushKey();
  if (!expected) return res.status(503).json({ error: 'push_not_configured' });
  const got = req.get('x-home-push-key') ?? '';
  if (!got || !sameKey(got, expected)) return res.status(401).json({ error: 'unauthorized' });

  const body: unknown = req.body;
  if (!isObject(body) || body.v !== 1 || typeof body.generated_at !== 'string'
      || !SECTIONS.every((k) => isObject(body[k]))) {
    return res.status(400).json({ error: 'validation_failed' });
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) {
    return res.status(413).json({ error: 'too_large' });
  }
  if (!(await saveSnapshot(SNAP_KEY, body))) {
    return res.status(500).json({ error: 'store_failed' });
  }
  return res.json({ ok: true });
});

// Чтение - личные цифры владельца с именами контактов: только SUPER_ADMIN.
export const homeRoutes = Router();
homeRoutes.use(requireSuperAdmin());

homeRoutes.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const snap = await loadSnapshot(SNAP_KEY);
  if (!snap || !isObject(snap.value)) {
    return res.status(503).json({ error: 'not_received' });
  }
  const age = Math.max(0, Math.round((Date.now() - Date.parse(snap.fetched_at)) / 1000));
  return res.json({ ...snap.value, received_at: snap.fetched_at, age_sec: age });
});
