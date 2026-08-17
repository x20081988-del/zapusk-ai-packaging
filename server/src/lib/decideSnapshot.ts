import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

// Sprint 64 - последний снимок очереди решений.
//
// Решение владельца 17.08.2026: «научи сайт показывать последний снимок очереди».
// До этого пакет не кешировался нигде принципиально - показать вчерашнюю очередь
// как сегодняшнюю значит выдумать карточки. Снимок это правило не отменяет, а
// обходит честно: он отдается ТОЛЬКО когда мак недоступен, ТОЛЬКО с явной пометкой
// stale и временем снятия, и экран в этом режиме глушит кнопки действий - решение
// по снимку все равно не доехало бы до источника.
//
// Хранение - файл на постоянном диске Render (UPLOADS_DIR), не Prisma: очередь
// остается чужими данными с мака, заводить под нее таблицу значило бы породить
// вторую правду. Раздача /uploads наружу закрыта (Sprint 36), PII из снимка
// доступна только через тот же requireSuperAdmin, что и живая очередь.

const SNAPSHOT_FILE = 'decide-pack-snapshot.json';

interface Snapshot {
  pack: unknown;
  fetched_at: string;
}

function snapshotPath(): string {
  return path.join(env.UPLOADS_DIR, SNAPSHOT_FILE);
}

/** Сохранить свежий пакет. Сбой записи не должен ломать живой ответ - лог и дальше. */
export async function saveSnapshot(pack: unknown): Promise<void> {
  const snap: Snapshot = { pack, fetched_at: new Date().toISOString() };
  const target = snapshotPath();
  const tmp = `${target}.tmp`;
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(snap), 'utf8');
    await fs.rename(tmp, target);
  } catch (e) {
    console.warn(`[decide] snapshot save failed: ${e instanceof Error ? e.message : e}`);
  }
}

/** Прочитать снимок. Нет файла или битый JSON - это просто «снимка нет», не ошибка. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(), 'utf8');
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.pack || typeof parsed.fetched_at !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
