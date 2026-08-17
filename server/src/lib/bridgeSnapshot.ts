import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

// Sprint 64 - последние снимки данных с мака (очередь решений, CRM).
//
// Решение владельца 17.08.2026: «показывать последний снимок», когда мак
// недоступен. До этого данные моста не кешировались нигде принципиально -
// показать вчерашнее как сегодняшнее значит выдумать данные. Снимок это
// правило не отменяет, а обходит честно: отдается ТОЛЬКО когда мак недоступен,
// ТОЛЬКО с явной пометкой stale и временем снятия, и экраны в этом режиме
// глушат действия - мутация по снимку все равно не доехала бы до источника.
//
// Хранение - файлы на постоянном диске Render (UPLOADS_DIR/bridge-snapshots),
// не Prisma: данные остаются чужими, с мака, заводить под них таблицы значило
// бы породить вторую правду. Раздача /uploads наружу закрыта (Sprint 36), PII
// доступна только через те же requireSuperAdmin-маршруты, что и живые данные.
//
// Ключ - произвольная строка (обычно путь моста), санитизируется в имя файла.
// Один ключ = один файл; ключей конечное число (экраны + сделки по id).

const SNAPSHOT_DIR = 'bridge-snapshots';

interface Snapshot {
  value: unknown;
  fetched_at: string;
}

function fileFor(key: string): string {
  const safe = key.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'root';
  return path.join(env.UPLOADS_DIR, SNAPSHOT_DIR, `${safe}.json`);
}

/** Сохранить свежее значение. Сбой записи не должен ломать живой ответ - лог и дальше. */
export async function saveSnapshot(key: string, value: unknown): Promise<void> {
  const snap: Snapshot = { value, fetched_at: new Date().toISOString() };
  const target = fileFor(key);
  const tmp = `${target}.tmp`;
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(snap), 'utf8');
    await fs.rename(tmp, target);
  } catch (e) {
    console.warn(`[snapshot] save ${key} failed: ${e instanceof Error ? e.message : e}`);
  }
}

/** Прочитать снимок. Нет файла или битый JSON - это просто «снимка нет», не ошибка. */
export async function loadSnapshot(key: string): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(fileFor(key), 'utf8');
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== 'object' || parsed.value === undefined || typeof parsed.fetched_at !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
