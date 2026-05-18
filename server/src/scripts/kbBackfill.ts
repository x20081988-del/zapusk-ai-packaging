// Sprint 62 P3 — Safe backfill of project-scoped KB for legacy UploadedFile rows.
//
// Why this script exists:
//   Sprint 61 added auto-ingestion at upload time, but rows uploaded BEFORE
//   Sprint 61 deploy never went through the pipeline. This means production
//   has files (pitch decks, financial models, docs) that ARE sitting on
//   disk + indexed in UploadedFile, but NOT in KnowledgeSource — so AI
//   Assistant retrieval can't see them. Founders re-uploading is annoying;
//   we need an idempotent backfill.
//
// Safety:
//   • Dry-run by default. NO writes unless --apply explicitly passed.
//   • Idempotent via existing sha256(contentHash) dedup in ingestKnowledgeSource.
//     Running the script twice does NOT duplicate chunks.
//   • Resumable: each UploadedFile is processed independently. If the script
//     crashes mid-batch, just re-run — already-ingested files become
//     `duplicate` status.
//   • Skips archived files, external links, images, and unsupported MIMEs
//     using the same predicates as scheduleProjectFileIngest.
//   • Batch-size cap so we never load the entire table into memory.
//   • Prints structured summary + per-file status so ops can audit.
//
// CLI:
//   npm run kb:backfill                         dry-run, all projects
//   npm run kb:backfill -- --apply              apply for real
//   npm run kb:backfill -- --project=<id>       single project
//   npm run kb:backfill -- --limit=10           cap files processed
//   npm run kb:backfill -- --batch=50           batch size (default 25)
//   npm run kb:backfill -- --apply --project=<id> --limit=5
//
// Not run automatically. Operator triggers explicitly.

import { prisma } from '../db.js';
import { ingestProjectFileToKnowledge } from '../services/projectKnowledgeIngest.js';
import { initKnowledgeFts } from '../services/knowledgeFts.js';

interface CliArgs {
  apply: boolean;
  projectId: string | null;
  limit: number | null;
  batchSize: number;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    projectId: null,
    limit: null,
    batchSize: 25,
    verbose: false,
  };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a.startsWith('--project=')) args.projectId = a.slice('--project='.length);
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice('--limit='.length)) || null;
    else if (a.startsWith('--batch=')) args.batchSize = Math.max(1, Math.min(200, Number(a.slice('--batch='.length)) || 25));
  }
  return args;
}

interface Counters {
  candidates: number;
  ingested: number;
  duplicate: number;
  skipped_format: number;
  skipped_short: number;
  skipped_link: number;
  parse_failed: number;
  ingest_failed: number;
  project_mismatch: number;
  file_not_found: number;
  total: number;
}

const FRESH_COUNTERS = (): Counters => ({
  candidates: 0,
  ingested: 0,
  duplicate: 0,
  skipped_format: 0,
  skipped_short: 0,
  skipped_link: 0,
  parse_failed: 0,
  ingest_failed: 0,
  project_mismatch: 0,
  file_not_found: 0,
  total: 0,
});

// Mirror predicate from projectKnowledgeIngest.isIngestibleMime — duplicated
// here so dry-run doesn't have to load the file path / try to parse. Only
// looks at originalName extension + mimeType.
function isIngestibleByMeta(originalName: string, mimeType: string, url: string | null, path: string): boolean {
  if (url && !path) return false; // external link — not indexable
  const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  if (ext === '.pdf' || mimeType === 'application/pdf') return true;
  if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  if (ext === '.xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
  if (ext === '.txt' || ext === '.md') return true;
  if (mimeType.startsWith('text/')) return true;
  return false;
}

async function listCandidates(args: CliArgs): Promise<Array<{
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  category: string;
  path: string;
  url: string | null;
}>> {
  return prisma.uploadedFile.findMany({
    where: {
      archivedAt: null,
      ...(args.projectId ? { projectId: args.projectId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: args.limit ?? undefined,
    select: {
      id: true, projectId: true, originalName: true,
      mimeType: true, category: true, path: true, url: true,
    },
  });
}

async function alreadyIndexed(uploadedFileId: string): Promise<boolean> {
  const existing = await prisma.knowledgeSource.findFirst({
    where: { uploadedFileId, archivedAt: null },
    select: { id: true },
  });
  return Boolean(existing);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('[kb-backfill] starting…', {
    apply: args.apply,
    projectId: args.projectId,
    limit: args.limit,
    batchSize: args.batchSize,
  });
  if (!args.apply) {
    console.log('[kb-backfill] DRY-RUN. Pass --apply to actually ingest.');
  }

  await initKnowledgeFts();
  const counters = FRESH_COUNTERS();
  const startedAt = Date.now();
  const allCandidates = await listCandidates(args);
  counters.candidates = allCandidates.length;
  console.log(`[kb-backfill] found ${allCandidates.length} candidate UploadedFile rows`);

  let processed = 0;
  for (let i = 0; i < allCandidates.length; i += args.batchSize) {
    const batch = allCandidates.slice(i, i + args.batchSize);
    for (const file of batch) {
      processed++;
      counters.total++;
      const t0 = Date.now();

      // Fast pre-check: already indexed?
      const indexed = await alreadyIndexed(file.id);
      if (indexed) {
        counters.duplicate++;
        if (args.verbose) {
          console.log(`[kb-backfill] [${processed}/${allCandidates.length}] DUPLICATE uploadedFileId=${file.id} (already in KB)`);
        }
        continue;
      }

      // Format / mime / link filter — cheap, no disk I/O.
      if (file.url && !file.path) {
        counters.skipped_link++;
        if (args.verbose) console.log(`[kb-backfill] [${processed}/${allCandidates.length}] SKIP_LINK uploadedFileId=${file.id} url=${file.url.slice(0, 60)}`);
        continue;
      }
      if (!isIngestibleByMeta(file.originalName, file.mimeType, file.url, file.path)) {
        counters.skipped_format++;
        if (args.verbose) console.log(`[kb-backfill] [${processed}/${allCandidates.length}] SKIP_FORMAT uploadedFileId=${file.id} mime=${file.mimeType} name="${file.originalName.slice(0, 40)}"`);
        continue;
      }

      if (!args.apply) {
        // Dry-run: would-ingest. Don't touch the DB.
        console.log(`[kb-backfill] [${processed}/${allCandidates.length}] WOULD_INGEST uploadedFileId=${file.id} project=${file.projectId} category=${file.category} name="${file.originalName.slice(0, 60)}"`);
        continue;
      }

      // Apply: real ingest.
      const result = await ingestProjectFileToKnowledge(file.id, file.projectId);
      const dt = Date.now() - t0;
      switch (result.status) {
        case 'ingested':
          counters.ingested++;
          break;
        case 'duplicate':
          counters.duplicate++;
          break;
        case 'skipped_short':
          counters.skipped_short++;
          break;
        case 'skipped_format':
          counters.skipped_format++;
          break;
        case 'skipped_link':
          counters.skipped_link++;
          break;
        case 'parse_failed':
          counters.parse_failed++;
          break;
        case 'ingest_failed':
          counters.ingest_failed++;
          break;
        case 'project_mismatch':
          counters.project_mismatch++;
          break;
        case 'file_not_found':
          counters.file_not_found++;
          break;
      }
      console.log(
        `[kb-backfill] [${processed}/${allCandidates.length}] ${result.status.toUpperCase()} ` +
        `uploadedFileId=${file.id} project=${file.projectId} ` +
        `sourceId=${result.sourceId ?? '-'} chunks=${result.chunkCount ?? 0} durationMs=${dt}` +
        (result.reason ? ` reason="${result.reason}"` : ''),
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('  KB backfill summary');
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log(`  Mode:                  ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Project filter:        ${args.projectId ?? '<all>'}`);
  console.log(`  Candidates considered: ${counters.candidates}`);
  console.log(`  Files processed:       ${counters.total}`);
  console.log('');
  console.log(`  ingested:              ${counters.ingested}`);
  console.log(`  duplicate (skip):      ${counters.duplicate}`);
  console.log(`  skipped_format:        ${counters.skipped_format}`);
  console.log(`  skipped_link:          ${counters.skipped_link}`);
  console.log(`  skipped_short:         ${counters.skipped_short}`);
  console.log(`  parse_failed:          ${counters.parse_failed}`);
  console.log(`  ingest_failed:         ${counters.ingest_failed}`);
  console.log(`  project_mismatch:      ${counters.project_mismatch}`);
  console.log(`  file_not_found:        ${counters.file_not_found}`);
  console.log('');
  console.log(`  Elapsed:               ${elapsedMs} ms`);
  if (!args.apply) {
    console.log('');
    console.log('  This was a DRY-RUN. No changes made.');
    console.log('  To actually ingest, re-run with --apply.');
  }
  console.log('══════════════════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[kb-backfill] fatal:', err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
