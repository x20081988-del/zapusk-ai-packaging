import { promises as fs, statSync, statfsSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Sprint 31 — pre-deploy DB snapshot. Запускается ПЕРЕД `prisma migrate deploy`.
// Цель: если migration окажется destructive (drop column с данными, неверный
// value mapping, partial migrate) — мы держим точку отката.
//
// Sprint 62.P4 — disk-aware retention. Раньше retention был ПОСЛЕ copy: если
// copy упал ENOSPC, старые снапшоты не чистились → диск оставался забитым →
// все последующие deploy'и падали в crash loop (DB writes тоже ENOSPC,
// seed.user.upsert тоже ENOSPC). Теперь retention идёт ПЕРЕД copy + free-disk
// pre-flight check + жёстче retention (3 вместо 7 чтобы 1 GB persistent disk
// не забивался при 250 MB DB).
//
// Snapshot file path: /var/data/snapshots/prod-YYYY-MM-DDTHH-MM-SS.db
// Retention: keep последние 3 snapshots, cleanup BEFORE making new one.
// Free-disk gate: если после retention свободного места < 2x DB size, skip
// snapshot с warning (deploy продолжается, лучше без backup чем без service).
// Local dev / отсутствующий disk: silent skip, не падаем.

const SNAPSHOTS_KEEP = 3;
const FREE_SPACE_SAFETY_MULTIPLIER = 2; // Need 2× DB size free to make snapshot

function resolveDbPath(): string {
  // DATABASE_URL формата "file:./prod.db" или "file:/var/data/prod.db"
  const url = process.env.DATABASE_URL ?? 'file:./prod.db';
  const raw = url.replace(/^file:/, '');
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

async function rotateSnapshots(snapshotsDir: string, keep: number): Promise<number> {
  if (!existsSync(snapshotsDir)) return 0;
  let removed = 0;
  try {
    const entries = await fs.readdir(snapshotsDir);
    const snapshots = entries
      .filter((name) => name.startsWith('prod-') && name.endsWith('.db'))
      .sort()
      .reverse(); // newest first
    const toDelete = snapshots.slice(keep);
    for (const name of toDelete) {
      try {
        await fs.unlink(path.join(snapshotsDir, name));
        console.log(`[snapshot] retention: removed old ${name}`);
        removed += 1;
      } catch (err) {
        console.warn(`[snapshot] retention: failed to remove ${name}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[snapshot] retention: keeping ${Math.min(snapshots.length - removed, keep)} of ${snapshots.length} snapshot(s)`);
  } catch (err) {
    console.warn(`[snapshot] retention scan failed:`, err instanceof Error ? err.message : err);
  }
  return removed;
}

function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

  // Sprint 62.P4 — ROTATE FIRST. Frees disk space before we try to copy.
  // If a previous deploy left orphan snapshots, this cleans them up.
  await rotateSnapshots(snapshotsDir, SNAPSHOTS_KEEP);

  // Sprint 62.P4 — free-disk pre-flight. SQLite hot-copy requires at least
  // the DB size in free space, and we want a safety margin so the seed +
  // app writes that follow don't ENOSPC right after.
  const dbSize = statSync(dbPath).size;
  const free = freeBytes(snapshotsDir);
  if (free !== null) {
    const needed = dbSize * FREE_SPACE_SAFETY_MULTIPLIER;
    console.log(`[snapshot] disk: db=${fmtMB(dbSize)} free=${fmtMB(free)} needed≥${fmtMB(needed)} (snapshot + safety)`);
    if (free < needed) {
      console.error(
        `[snapshot] SKIP — not enough free space for snapshot (have ${fmtMB(free)}, need ${fmtMB(needed)}). ` +
        `Old snapshots already rotated; if this persists, increase Render disk or run ` +
        `\`rm /var/data/snapshots/*.db\` via Render Shell.`,
      );
      return;
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(snapshotsDir, `prod-${ts}.db`);

  try {
    await fs.copyFile(dbPath, outPath);
    const stat = statSync(outPath);
    console.log(`[snapshot] OK · ${outPath} (${fmtMB(stat.size)})`);
  } catch (err) {
    // Snapshot failure не должна валить deploy — лучше деплой без snapshot, чем
    // не деплой вообще. Логируем громко.
    console.error(`[snapshot] FAILED to copy ${dbPath} → ${outPath}:`, err instanceof Error ? err.message : err);
    // Sprint 62.P4 — if copyFile partial-wrote a corrupt file before ENOSPC,
    // remove it so the next deploy doesn't trip on a half-written .db.
    try { await fs.unlink(outPath); } catch { /* ignore — file may not exist */ }
    return;
  }
}

main().catch((err) => {
  // Любая ошибка — warn, не fail. Deploy должен идти.
  console.error('[snapshot] unexpected error (continuing deploy):', err instanceof Error ? err.message : err);
  process.exit(0);
});
