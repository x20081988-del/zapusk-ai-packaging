// Sprint 62.P4 — disk inspection helper.
//
// Centralises the "look at /var/data" logic used by:
//   • GET /api/admin/system/disk        — operator-facing inspector
//   • scripts/maintenanceDisk.ts        — npm run maintenance:disk
//   • src/index.ts boot warning         — log if free < 25%
//   • scripts/preDeploySnapshot.ts      — disk-aware retention (Sprint 62.P4)
//
// No side effects: this module only READS the filesystem. Mutations
// (snapshot cleanup) live in maintenanceDisk.ts.

import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import path from 'node:path';

export const LOW_DISK_THRESHOLD_PERCENT = 25;

export interface DiskUsage {
  /** Absolute path of the volume mount root being inspected. */
  mountPath: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  /** 0..100. Rounded. */
  usedPercent: number;
  freePercent: number;
  /** true when freePercent < LOW_DISK_THRESHOLD_PERCENT. */
  low: boolean;
}

export interface SnapshotsSummary {
  dirPath: string;
  exists: boolean;
  count: number;
  /** Sum of all snapshot file sizes in bytes. */
  totalBytes: number;
  /** Names (basename) of the snapshots, newest first. */
  files: Array<{ name: string; sizeBytes: number; mtimeMs: number }>;
}

export interface DirSummary {
  path: string;
  exists: boolean;
  /** Sum of file sizes (top-level only — does not recurse). */
  totalBytes: number;
  fileCount: number;
}

export interface DiskReport {
  ok: boolean;
  ts: number;
  disk: DiskUsage | null;
  dbPath: string;
  dbSizeBytes: number | null;
  snapshots: SnapshotsSummary;
  uploads: DirSummary | null;
  warnings: string[];
}

/** Resolve absolute prod.db path from DATABASE_URL (or local default). */
export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./prod.db';
  const raw = url.replace(/^file:/, '');
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** Resolve the volume root (parent of prod.db). */
export function resolveDataDir(): string {
  return path.dirname(resolveDbPath());
}

/** Resolve absolute snapshots dir (sibling of prod.db). */
export function resolveSnapshotsDir(): string {
  return path.join(resolveDataDir(), 'snapshots');
}

/** Resolve uploads dir (UPLOADS_DIR env, defaulting to ./uploads). */
export function resolveUploadsDir(): string {
  const raw = process.env.UPLOADS_DIR ?? './uploads';
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** statfsSync wrapper that won't throw on missing dir. */
export function inspectDisk(mountPath: string): DiskUsage | null {
  try {
    const s = statfsSync(mountPath);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    const freePercent = totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 100) : 0;
    return {
      mountPath,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
      freePercent,
      low: freePercent < LOW_DISK_THRESHOLD_PERCENT,
    };
  } catch {
    return null;
  }
}

export function inspectSnapshots(dirPath: string): SnapshotsSummary {
  const summary: SnapshotsSummary = {
    dirPath,
    exists: existsSync(dirPath),
    count: 0,
    totalBytes: 0,
    files: [],
  };
  if (!summary.exists) return summary;
  try {
    const entries = readdirSync(dirPath);
    const dbFiles = entries.filter((n) => n.startsWith('prod-') && n.endsWith('.db'));
    for (const name of dbFiles) {
      try {
        const st = statSync(path.join(dirPath, name));
        summary.files.push({ name, sizeBytes: st.size, mtimeMs: st.mtimeMs });
        summary.totalBytes += st.size;
      } catch {
        /* file disappeared between readdir and stat — ignore */
      }
    }
    // newest first
    summary.files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    summary.count = summary.files.length;
  } catch {
    /* readdir failed — leave defaults */
  }
  return summary;
}

export function inspectDir(dirPath: string): DirSummary {
  const summary: DirSummary = {
    path: dirPath,
    exists: existsSync(dirPath),
    totalBytes: 0,
    fileCount: 0,
  };
  if (!summary.exists) return summary;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      try {
        const st = statSync(path.join(dirPath, ent.name));
        summary.totalBytes += st.size;
        summary.fileCount += 1;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return summary;
}

/** Full report for the admin endpoint. */
export function buildDiskReport(): DiskReport {
  const dbPath = resolveDbPath();
  const dataDir = resolveDataDir();
  const snapshotsDir = resolveSnapshotsDir();
  const uploadsDir = resolveUploadsDir();

  const disk = inspectDisk(dataDir);
  const dbSizeBytes = existsSync(dbPath)
    ? (() => {
        try { return statSync(dbPath).size; } catch { return null; }
      })()
    : null;
  const snapshots = inspectSnapshots(snapshotsDir);
  // Only inspect uploads when its dir lives on the same volume; otherwise it's
  // a local dev path and not useful in the report.
  const uploads = uploadsDir.startsWith(dataDir) || uploadsDir === uploadsDir
    ? inspectDir(uploadsDir)
    : null;

  const warnings: string[] = [];
  if (disk && disk.low) {
    warnings.push(
      `Free disk space ${disk.freePercent}% < ${LOW_DISK_THRESHOLD_PERCENT}% threshold on ${disk.mountPath}. ` +
      `Run \`npm run maintenance:disk\` or rm /var/data/snapshots/*.db via Render Shell.`,
    );
  }
  if (snapshots.count > 5) {
    warnings.push(`Snapshots count ${snapshots.count} > 5 — retention may not be running.`);
  }

  return {
    ok: true,
    ts: Date.now(),
    disk,
    dbPath,
    dbSizeBytes,
    snapshots,
    uploads,
    warnings,
  };
}

/** Compact formatter for log lines. */
export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined || !Number.isFinite(b)) return 'n/a';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
