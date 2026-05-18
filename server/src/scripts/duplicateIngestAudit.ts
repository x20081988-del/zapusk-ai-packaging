// Sprint 62.VERIFICATION P1 — Duplicate ingest audit.
//
// Test matrix:
//   1. Upload same XLSX twice (different UploadedFile.id, identical bytes).
//   2. Upload same PDF twice (mock via text → 'pdf-like' but reuse rawText).
//      We use the rawText shortcut to avoid stubbing pdf-parse; the dedup
//      runs on normalized content hash so the effect is identical.
//   3. Upload same TXT twice.
//   4. Re-run backfill against the seeded data — must be no-op.
//
// For each: assert KnowledgeSource count, KnowledgeChunk count,
// ProjectNumericFact count do NOT grow on the 2nd upload.

import { prisma } from '../db.js';
import { ingestProjectFileToKnowledge } from '../services/projectKnowledgeIngest.js';
import { ingestKnowledgeSource } from '../services/knowledgeService.js';
import { initKnowledgeFts } from '../services/knowledgeFts.js';
import { storage } from '../services/storage.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { BENCH_PROJECT_ID, cleanup, seed } from './retrievalBenchmarkFixtures.js';

let failed = 0;
function ok(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t: string): void { console.log(`\n── ${t} ──`); }

function makeXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Показатель': 'Выручка', '2025': 100, '2026': 200, '2027': 300 },
    { 'Показатель': 'Чистая прибыль', '2025': 30, '2026': 60, '2027': 90 },
  ]), 'P&L');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Параметр': 'Pre-money млн', value: 500 },
    { 'Параметр': 'IRR %', value: 22 },
  ]), 'Valuation');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

async function uploadFile(name: string, mime: string, buf: Buffer): Promise<string> {
  const diskName = `${randomUUID()}${path.extname(name)}`;
  const rel = path.join(BENCH_PROJECT_ID, diskName);
  await storage.saveBuffer(rel, buf);
  const row = await prisma.uploadedFile.create({
    data: {
      projectId: BENCH_PROJECT_ID,
      filename: diskName,
      originalName: name,
      mimeType: mime,
      size: buf.length,
      category: name.endsWith('.xlsx') ? 'financial' : name.endsWith('.pdf') ? 'pitch' : 'description',
      path: rel,
    },
  });
  return row.id;
}

async function counts(): Promise<{ sources: number; chunks: number; facts: number; files: number }> {
  const [sources, chunks, facts, files] = await Promise.all([
    prisma.knowledgeSource.count({ where: { projectId: BENCH_PROJECT_ID } }),
    prisma.knowledgeChunk.count({ where: { projectId: BENCH_PROJECT_ID } }),
    prisma.projectNumericFact.count({ where: { projectId: BENCH_PROJECT_ID } }),
    prisma.uploadedFile.count({ where: { projectId: BENCH_PROJECT_ID, archivedAt: null } }),
  ]);
  return { sources, chunks, facts, files };
}

function fmt(c: Awaited<ReturnType<typeof counts>>): string {
  return `sources=${c.sources} chunks=${c.chunks} facts=${c.facts} files=${c.files}`;
}

async function main(): Promise<void> {
  await initKnowledgeFts();
  await cleanup();
  await seed(); // 4 project sources + 3 global; baseline establishment

  // Reset numeric facts (cleanup() doesn't touch them since they cascade
  // from project; seed() doesn't create any since bench sources use rawText).
  await prisma.projectNumericFact.deleteMany({ where: { projectId: BENCH_PROJECT_ID } });

  const baseline = await counts();
  console.log(`\n[baseline] ${fmt(baseline)}`);

  // ─── Test 1: XLSX double-upload ─────────────────────────────────────────
  section('1. XLSX double-upload (identical bytes)');
  {
    const buf = makeXlsxBuffer();
    const id1 = await uploadFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf);
    const r1 = await ingestProjectFileToKnowledge(id1, BENCH_PROJECT_ID);
    const after1 = await counts();
    console.log(`  after #1: ${fmt(after1)}  status=${r1.status} chunks=${r1.chunkCount}`);

    const id2 = await uploadFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf);
    const r2 = await ingestProjectFileToKnowledge(id2, BENCH_PROJECT_ID);
    const after2 = await counts();
    console.log(`  after #2: ${fmt(after2)}  status=${r2.status} chunks=${r2.chunkCount}`);

    ok('first upload status=ingested', r1.status === 'ingested', `got ${r1.status}`);
    ok('second upload status=duplicate', r2.status === 'duplicate', `got ${r2.status}`);
    ok('second upload reused same sourceId', r1.sourceId === r2.sourceId,
      `${r1.sourceId} vs ${r2.sourceId}`);
    ok('KnowledgeSource count unchanged', after2.sources === after1.sources);
    ok('KnowledgeChunk count unchanged', after2.chunks === after1.chunks);
    ok('ProjectNumericFact count unchanged on dup', after2.facts === after1.facts);
    ok('UploadedFile count grew by 1 (two upload rows)', after2.files === after1.files + 1);
  }

  // ─── Test 2: TXT double-ingest ──────────────────────────────────────────
  section('2. TXT double-upload (identical bytes)');
  {
    const txt = Buffer.from('Проект Atlas работает с 2024 года. Команда из трёх человек. CFO — Анна Соловьёва.', 'utf8');
    const before = await counts();
    const id1 = await uploadFile('about.txt', 'text/plain', txt);
    await ingestProjectFileToKnowledge(id1, BENCH_PROJECT_ID);
    const mid = await counts();
    const id2 = await uploadFile('about.txt', 'text/plain', txt);
    const r2 = await ingestProjectFileToKnowledge(id2, BENCH_PROJECT_ID);
    const after = await counts();
    ok('TXT #2 status=duplicate', r2.status === 'duplicate', `got ${r2.status}`);
    ok('TXT: KnowledgeSource count unchanged (#2)', after.sources === mid.sources);
    ok('TXT: KnowledgeChunk count unchanged (#2)', after.chunks === mid.chunks);
    void before; // referenced for symmetry
  }

  // ─── Test 3: simulated PDF via rawText path ─────────────────────────────
  //
  // We can't easily fixture-build a real PDF binary. Instead exercise the
  // contentHash dedup at the ingestKnowledgeSource layer directly with
  // identical rawText — this is the exact branch a PDF would take after
  // fileParser.extractPdf returns its text. Result must be identical to
  // re-upload-of-same-PDF behavior.
  section('3. rawText path — simulates same-PDF re-ingest');
  {
    const text = 'Презентация Atlas Industrial Park. ' +
      'Команда: 5 человек. Этап: scaling. Раунд: 120 млн RUB за 12%. ' +
      'Min check 5 млн RUB. Инвестор получает IRR 25% годовых.';
    const before = await counts();
    const r1 = await ingestKnowledgeSource({
      scope: 'project', projectId: BENCH_PROJECT_ID,
      title: 'pitch-deck (run 1)', sourceType: 'project_presentation',
      rawText: text, status: 'published', visibility: 'internal',
      environment: 'production',
    });
    const r2 = await ingestKnowledgeSource({
      scope: 'project', projectId: BENCH_PROJECT_ID,
      title: 'pitch-deck (run 2)', sourceType: 'project_presentation',
      rawText: text, status: 'published', visibility: 'internal',
      environment: 'production',
    });
    const after = await counts();
    ok('PDF-equivalent #1 stored', !r1.duplicate);
    ok('PDF-equivalent #2 returned duplicate', r2.duplicate);
    ok('PDF-equivalent #2 reused same sourceId', r1.sourceId === r2.sourceId);
    ok('PDF-equivalent: KnowledgeSource grew by exactly 1', after.sources === before.sources + 1);
  }

  // ─── Test 4: backfill double-run end-to-end safety ──────────────────────
  //
  // FINDING: backfill's alreadyIndexed() looks up by uploadedFileId. When
  // the SAME content is uploaded twice (different UploadedFile rows, same
  // bytes), the 2nd file row is NOT linked to a KnowledgeSource (because
  // ingest returned 'duplicate' on the 2nd upload, returning the existing
  // sourceId but never linking the new uploadedFileId).
  //
  // Backfill would therefore report «wouldIngest» for the orphaned files.
  // But the actual end-to-end behavior is SAFE: re-running ingest hits
  // contentHash dedup at ingestKnowledgeSource level and returns 'duplicate'
  // WITHOUT creating new chunks. So this is a reporting-only quirk, not a
  // data-integrity bug. We verify the END-TO-END outcome here.
  section('4. KB backfill re-run is safe (end-to-end, despite reporting quirk)');
  {
    const allFiles = await prisma.uploadedFile.findMany({
      where: { projectId: BENCH_PROJECT_ID, archivedAt: null },
      select: { id: true, originalName: true },
    });
    const indexedIds = await prisma.knowledgeSource.findMany({
      where: { uploadedFileId: { in: allFiles.map((f) => f.id) }, archivedAt: null },
      select: { uploadedFileId: true },
    });
    const indexedSet = new Set(indexedIds.map((s) => s.uploadedFileId));
    const orphanedFiles = allFiles.filter((f) => !indexedSet.has(f.id));
    console.log(`  files=${allFiles.length} linked-to-source=${indexedSet.size} orphaned-but-content-dup=${orphanedFiles.length}`);

    // Verify the end-to-end safety: actually re-run ingest on each orphaned
    // file. Result must be 'duplicate' for every one of them.
    const before = await counts();
    let recoveredAsDuplicate = 0;
    for (const f of orphanedFiles) {
      const r = await ingestProjectFileToKnowledge(f.id, BENCH_PROJECT_ID);
      if (r.status === 'duplicate') recoveredAsDuplicate++;
    }
    const after = await counts();
    ok('all orphaned UploadedFiles resolve to duplicate on re-ingest',
      recoveredAsDuplicate === orphanedFiles.length,
      `${recoveredAsDuplicate}/${orphanedFiles.length}`);
    ok('KnowledgeSource count unchanged after re-ingest of orphans',
      after.sources === before.sources);
    ok('KnowledgeChunk count unchanged after re-ingest of orphans',
      after.chunks === before.chunks);
    ok('ProjectNumericFact count unchanged after re-ingest of orphans',
      after.facts === before.facts);
  }

  // ─── Test 5: numeric facts dedup ────────────────────────────────────────
  section('5. ProjectNumericFact dedup — re-ingest does NOT clone facts');
  {
    // From test 1, we have an XLSX in KB. ingestProjectFileToKnowledge call
    // on the SAME contentHash returns duplicate WITHOUT calling the facts
    // persistence block (it's inside the non-duplicate branch). Verify the
    // fact count is stable.
    const factsBefore = await prisma.projectNumericFact.count({ where: { projectId: BENCH_PROJECT_ID } });
    const buf = makeXlsxBuffer();
    const id3 = await uploadFile('rerun.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf);
    const r3 = await ingestProjectFileToKnowledge(id3, BENCH_PROJECT_ID);
    const factsAfter = await prisma.projectNumericFact.count({ where: { projectId: BENCH_PROJECT_ID } });
    console.log(`  re-ingest status=${r3.status} factsBefore=${factsBefore} factsAfter=${factsAfter}`);
    ok('re-ingest hit duplicate branch', r3.status === 'duplicate');
    ok('ProjectNumericFact count UNCHANGED on duplicate re-ingest',
      factsAfter === factsBefore, `${factsBefore} → ${factsAfter}`);
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────
  await cleanup();
  await prisma.$disconnect();

  console.log('\n══════════════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('  ✅ All duplicate-ingest audit checks passed.');
    process.exit(0);
  }
  console.error(`  ❌ ${failed} check(s) failed.`);
  process.exit(1);
}

main().catch(async (err) => {
  console.error('[dedup-audit] fatal:', err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(2);
});
