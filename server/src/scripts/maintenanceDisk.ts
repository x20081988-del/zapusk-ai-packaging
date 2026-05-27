// Sprint 62.P4 — disk maintenance script.
//
// Usage:
//   npm run maintenance:disk            # safe default: rotate snapshots, keep last 3
//   npm run maintenance:disk -- --keep 1   # keep only newest 1 snapshot
//   npm run maintenance:disk -- --uploads-stale 30   # ALSO delete uploads orphans older than 30d
//
// What it does by default:
//   • Reads /var/data disk usage BEFORE.
//   • Rotates snapshots: keeps newest N (default 3), deletes older ones.
//   • Reads /var/data disk usage AFTER.
//   • Prints a summary.
//
// What it does NOT do (without explicit opt-in):
//   • Touch /var/data/prod.db (database itself).
//   • Touch /var/data/uploads (founder/customer files). Use --uploads-stale
//     to delete files older than N days — but this needs an explicit flag.
//
// Safe to run on prod via `node dist/scripts/maintenanceDisk.js` from
// Render Shell. Read-only when no candidates exist (no snapshots to rotate).

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildDiskReport,
  fmtBytes,
  inspectDisk,
  resolveDataDir,
  resolveSnapshotsDir,
  resolveUploadsDir,
} from '../lib/diskInspector.js';

interface Args {
  keep: number;
  uploadsStaleDays: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { keep: 3, uploadsStaleDays: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--keep') {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v >= 0 && v <= 100) args.keep = v;
      i += 1;
    } else if (a === '--uploads-stale') {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v >= 1) args.uploadsStaleDays = v;
      i += 1;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

async function rotateSnapshots(dir: string, keep: number, dryRun: boolean): Promise<{ removed: number; freedBytes: number }> {
  if (!existsSync(dir)) {
    console.log(`[maintenance:disk] snapshots dir ${dir} does not exist — nothing to rotate`);
    return { removed: 0, freedBytes: 0 };
  }
  const entries = await fs.readdir(dir);
  const snapshots = entries.filter((n) => n.startsWith('prod-') && n.endsWith('.db'));
  // Sort by mtime, newest first
  const stat = await Promise.all(
    snapshots.map(async (name) => {
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        return { name, full, mtimeMs: st.mtimeMs, sizeBytes: st.size };
      } catch {
        return null;
      }
    }),
  );
  const sorted = stat
    .filter((x): x is { name: string; full: string; mtimeMs: number; sizeBytes: number } => x !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toDelete = sorted.slice(keep);
  console.log(`[maintenance:disk] snapshots: ${sorted.length} found, keeping newest ${Math.min(sorted.length, keep)}, removing ${toDelete.length}`);
  let removed = 0;
  let freedBytes = 0;
  for (const s of toDelete) {
    if (dryRun) {
      console.log(`  [dry-run] would remove ${s.name} (${fmtBytes(s.sizeBytes)})`);
      removed += 1;
      freedBytes += s.sizeBytes;
      continue;
    }
    try {
      await fs.unlink(s.full);
      console.log(`  removed ${s.name} (${fmtBytes(s.sizeBytes)})`);
      removed += 1;
      freedBytes += s.sizeBytes;
    } catch (err) {
      console.warn(`  failed to remove ${s.name}:`, err instanceof Error ? err.message : err);
    }
  }
  return { removed, freedBytes };
}

async function pruneStaleUploads(dir: string, staleDays: number, dryRun: boolean): Promise<{ removed: number; freedBytes: number }> {
  if (!existsSync(dir)) {
    console.log(`[maintenance:disk] uploads dir ${dir} does not exist — skipping`);
    return { removed: 0, freedBytes: 0 };
  }
  const cutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  console.log(`[maintenance:disk] uploads: scanning ${dir} for files older than ${staleDays} days (mtime < ${new Date(cutoffMs).toISOString()})`);
  let removed = 0;
  let freedBytes = 0;
  // Recursively walk one level (per-project subdirs). Don't recurse arbitrarily —
  // keep it bounded.
  const projDirs = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of projDirs) {
    if (!ent.isDirectory()) continue;
    const subDir = path.join(dir, ent.name);
    let inner: import('node:fs').Dirent[];
    try {
      inner = await fs.readdir(subDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of inner) {
      if (!f.isFile()) continue;
      const full = path.join(subDir, f.name);
      try {
        const st = await fs.stat(full);
        if (st.mtimeMs > cutoffMs) continue;
        if (dryRun) {
          console.log(`  [dry-run] would remove ${full} (${fmtBytes(st.size)}, mtime=${new Date(st.mtimeMs).toISOString()})`);
          removed += 1;
          freedBytes += st.size;
          continue;
        }
        await fs.unlink(full);
        console.log(`  removed ${full} (${fmtBytes(st.size)})`);
        removed += 1;
        freedBytes += st.size;
      } catch (err) {
        console.warn(`  failed: ${full} ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return { removed, freedBytes };
}

function printDisk(label: string, dataDir: string): void {
  const d = inspectDisk(dataDir);
  if (!d) {
    console.log(`[maintenance:disk] ${label}: mount ${dataDir} not statable`);
    return;
  }
  console.log(
    `[maintenance:disk] ${label}: mount=${d.mountPath} ` +
    `used=${fmtBytes(d.usedBytes)} (${d.usedPercent}%) ` +
    `free=${fmtBytes(d.freeBytes)} (${d.freePercent}%) ` +
    `total=${fmtBytes(d.totalBytes)}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('═══ disk maintenance ═══════════════════════════════════════════════');
  console.log(`args: keep=${args.keep} uploadsStaleDays=${args.uploadsStaleDays ?? '(skip — opt-in via --uploads-stale)'} dryRun=${args.dryRun}`);
  console.log();

  const dataDir = resolveDataDir();
  const snapshotsDir = resolveSnapshotsDir();
  const uploadsDir = resolveUploadsDir();

  const before = buildDiskReport();
  console.log('--- BEFORE ---');
  printDisk('disk', dataDir);
  console.log(`  prod.db: ${fmtBytes(before.dbSizeBytes)}`);
  console.log(`  snapshots: ${before.snapshots.count} files (${fmtBytes(before.snapshots.totalBytes)}) at ${snapshotsDir}`);
  if (before.uploads) {
    console.log(`  uploads: ${before.uploads.fileCount} files (${fmtBytes(before.uploads.totalBytes)}) at ${uploadsDir}`);
  }
  console.log();

  console.log('--- ACTIONS ---');
  const rot = await rotateSnapshots(snapshotsDir, args.keep, args.dryRun);
  let upl = { removed: 0, freedBytes: 0 };
  if (args.uploadsStaleDays !== null) {
    upl = await pruneStaleUploads(uploadsDir, args.uploadsStaleDays, args.dryRun);
  } else {
    console.log('[maintenance:disk] uploads: skipped (pass --uploads-stale <days> to opt in)');
  }
  console.log();

  console.log('--- AFTER ---');
  printDisk('disk', dataDir);
  const after = buildDiskReport();
  console.log(`  snapshots: ${after.snapshots.count} files (${fmtBytes(after.snapshots.totalBytes)})`);
  if (after.uploads) {
    console.log(`  uploads: ${after.uploads.fileCount} files (${fmtBytes(after.uploads.totalBytes)})`);
  }
  console.log();

  console.log('--- SUMMARY ---');
  console.log(`  snapshots removed: ${rot.removed} files · ${fmtBytes(rot.freedBytes)} freed`);
  if (args.uploadsStaleDays !== null) {
    console.log(`  uploads removed: ${upl.removed} files · ${fmtBytes(upl.freedBytes)} freed`);
  }
  if (args.dryRun) {
    console.log('  ⚠ DRY RUN — no files were actually deleted. Re-run without --dry-run to apply.');
  }
}

main().catch((err) => {
  console.error('[maintenance:disk] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
