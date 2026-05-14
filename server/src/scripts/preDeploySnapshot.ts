import { promises as fs, statSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Sprint 31 — pre-deploy DB snapshot. Запускается ПЕРЕД `prisma migrate deploy`.
// Цель: если migration окажется destructive (drop column с данными, неверный
// value mapping, partial migrate) — мы держим точку отката.
//
// Snapshot file path: /var/data/snapshots/prod-YYYY-MM-DDTHH-MM-SS.db
// Retention: keep последние 7 snapshots (cleanup старых).
// Local dev / отсутствующий disk: silent skip с warning, не падаем.

const SNAPSHOTS_KEEP = 7;

function resolveDbPath(): string {
  // DATABASE_URL формата "file:./prod.db" или "file:/var/data/prod.db"
  const url = process.env.DATABASE_URL ?? 'file:./prod.db';
  const raw = url.replace(/^file:/, '');
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();

  // Pre-deploy snapshot имеет смысл только на проде, где DB живёт на disk.
  // Локальный dev без файла — нечего бэкапить.
  if (!existsSync(dbPath)) {
    console.warn(`[snapshot] DB file ${dbPath} not found — skipping pre-deploy snapshot.`);
    console.warn('[snapshot] This is OK for first deploy / fresh container before migrate.');
    return;
  }

  const snapshotsDir = path.join(path.dirname(dbPath), 'snapshots');
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(snapshotsDir, `prod-${ts}.db`);

  // copyFile — атомарный copy через kernel, безопаснее чем read+write через user-space.
  // SQLite допускает copy «hot» файла, но рекомендация — лучше file-level бэкап до миграции.
  try {
    await fs.copyFile(dbPath, outPath);
    const stat = statSync(outPath);
    console.log(`[snapshot] OK · ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    // Snapshot failure не должна валить deploy — лучше деплой без snapshot, чем
    // не деплой вообще. Логируем громко.
    console.error(`[snapshot] FAILED to copy ${dbPath} → ${outPath}:`, err instanceof Error ? err.message : err);
    return;
  }

  // Retention: оставляем последние SNAPSHOTS_KEEP, остальные удаляем.
  try {
    const entries = await fs.readdir(snapshotsDir);
    const snapshots = entries
      .filter((name) => name.startsWith('prod-') && name.endsWith('.db'))
      .sort()
      .reverse(); // newest first
    const toDelete = snapshots.slice(SNAPSHOTS_KEEP);
    for (const name of toDelete) {
      await fs.unlink(path.join(snapshotsDir, name));
      console.log(`[snapshot] retention: removed old ${name}`);
    }
    console.log(`[snapshot] retention: keeping ${Math.min(snapshots.length, SNAPSHOTS_KEEP)} snapshots`);
  } catch (err) {
    console.warn(`[snapshot] retention cleanup failed:`, err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  // Любая ошибка — warn, не fail. Deploy должен идти.
  console.error('[snapshot] unexpected error (continuing deploy):', err instanceof Error ? err.message : err);
  process.exit(0);
});
