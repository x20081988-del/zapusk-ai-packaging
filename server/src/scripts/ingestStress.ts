// Sprint 61.P1 — Real-world ingestion stress test.
//
// Цель: убедиться, что multi-sheet финансовая модель и большие документы
// проходят через ingestProjectFileToKnowledge без потерь и timeout'ов.
//
// Что измеряем:
//   1. XLSX с 12 листами, ~250 строк → попадает в KB как N chunks. Не теряет
//      sheet names. Содержит конкретные числа (например, "чистая прибыль
//      2027: 92").
//   2. Время извлечения текста (parse durationMs).
//   3. Время чанкирования (ingest durationMs).
//   4. Поиск числа из конкретного листа возвращает соответствующий chunk.
//
// Запуск: `npm run stress:ingest`

import * as XLSX from 'xlsx';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { storage } from '../services/storage.js';
import { ingestProjectFileToKnowledge } from '../services/projectKnowledgeIngest.js';
import { initKnowledgeFts } from '../services/knowledgeFts.js';
import { retrieveKnowledgeForTranscript } from '../services/knowledgeService.js';
import { BENCH_USER_ID, BENCH_PROJECT_ID, cleanup, isolateOthers, restoreOthers, type IsolationState } from './retrievalBenchmarkFixtures.js';

interface SheetSpec {
  name: string;
  rows: Array<Record<string, string | number>>;
}

// 12-sheet синтетическая финмодель. Каждый лист — отдельная таблица.
function buildFinmodel(): SheetSpec[] {
  const years = [2025, 2026, 2027, 2028, 2029];
  return [
    {
      name: 'P&L Summary',
      rows: [
        { 'Показатель': 'Выручка', '2025': 280, '2026': 380, '2027': 520, '2028': 680, '2029': 850 },
        { 'Показатель': 'EBITDA', '2025': 95, '2026': 145, '2027': 210, '2028': 295, '2029': 380 },
        { 'Показатель': 'Чистая прибыль', '2025': 38, '2026': 65, '2027': 92, '2028': 128, '2029': 168 },
        { 'Показатель': 'EBITDA margin %', '2025': 33.9, '2026': 38.2, '2027': 40.4, '2028': 43.4, '2029': 44.7 },
      ],
    },
    {
      name: 'Revenue by source',
      rows: [
        { 'Источник': 'Арендные платежи', '2025': 230, '2026': 310, '2027': 420, '2028': 540, '2029': 670 },
        { 'Источник': 'Сервисные сборы', '2025': 40, '2026': 55, '2027': 75, '2028': 100, '2029': 130 },
        { 'Источник': 'Коммерческие услуги', '2025': 10, '2026': 15, '2027': 25, '2028': 40, '2029': 50 },
      ],
    },
    {
      name: 'Cost structure',
      rows: [
        { 'Статья': 'Эксплуатация', '2025': 65, '2026': 85, '2027': 110, '2028': 140, '2029': 175 },
        { 'Статья': 'Управление', '2025': 35, '2026': 45, '2027': 60, '2028': 75, '2029': 90 },
        { 'Статья': 'Налоги', '2025': 30, '2026': 45, '2027': 70, '2028': 95, '2029': 125 },
        { 'Статья': 'Амортизация', '2025': 25, '2026': 35, '2027': 45, '2028': 55, '2029': 65 },
      ],
    },
    {
      name: 'Capex',
      rows: [
        { 'Объект': 'Очередь 3 - стройка', '2025': 180, '2026': 120, '2027': 0, '2028': 0, '2029': 0 },
        { 'Объект': 'Очередь 3 - инженерия', '2025': 60, '2026': 80, '2027': 30, '2028': 0, '2029': 0 },
        { 'Объект': 'ЛЭП подключение Россети', '2025': 45, '2026': 25, '2027': 0, '2028': 0, '2029': 0 },
      ],
    },
    {
      name: 'Unit Economics',
      rows: [
        { 'Метрика': 'Средний контракт месяцев', value: 36 },
        { 'Метрика': 'Средняя площадь арендатора кв м', value: 850 },
        { 'Метрика': 'Средняя ставка RUB/кв м/мес', value: 1200 },
        { 'Метрика': 'CAC RUB на нового арендатора', value: 180000 },
        { 'Метрика': 'Сервисная маржа %', value: 38 },
      ],
    },
    {
      name: 'Tenant pipeline',
      rows: years.flatMap((y) => [
        { 'Год': y, 'Активные арендаторы': 18 + (y - 2025) * 4, 'Vacancy %': 6 - (y - 2025) },
      ]),
    },
    {
      name: 'Sensitivity',
      rows: [
        { 'Сценарий': 'Base', 'IRR %': 25, 'Net profit 2027': 92 },
        { 'Сценарий': 'Optimistic', 'IRR %': 31, 'Net profit 2027': 118 },
        { 'Сценарий': 'Pessimistic', 'IRR %': 18, 'Net profit 2027': 64 },
      ],
    },
    {
      name: 'Use of funds',
      rows: [
        { 'Направление': 'Строительство очередь 3', 'Доля %': 60, 'Сумма RUB млн': 72 },
        { 'Направление': 'Подключение коммуникаций', 'Доля %': 25, 'Сумма RUB млн': 30 },
        { 'Направление': 'Оборотный капитал', 'Доля %': 15, 'Сумма RUB млн': 18 },
      ],
    },
    {
      name: 'Debt schedule',
      rows: years.map((y, i) => ({ 'Год': y, 'Остаток долга': 80 - i * 10, 'Процентные платежи': 8 - i })),
    },
    {
      name: 'Cash flow',
      rows: years.map((y, i) => ({
        'Год': y,
        'Operating CF': 60 + i * 25,
        'Investing CF': -(80 - i * 15),
        'Financing CF': -10,
        'Net change': -30 + i * 35,
      })),
    },
    {
      name: 'Valuation',
      rows: [
        { 'Параметр': 'Pre-money valuation RUB млн', value: 1000 },
        { 'Параметр': 'Post-money valuation RUB млн', value: 1120 },
        { 'Параметр': 'Доля инвестора %', value: 12 },
        { 'Параметр': 'IRR 5 лет', value: 25 },
        { 'Параметр': 'Окупаемость лет', value: 4.5 },
      ],
    },
    {
      name: 'Risk register',
      rows: [
        { 'Риск': 'Концентрация на 2 якорных арендаторах', 'Вероятность': 'Средняя', 'Влияние': 'Высокое', 'Митигация': 'Waiting-list 4 кандидата + break-fee 6 мес' },
        { 'Риск': 'Задержка ЛЭП Россети', 'Вероятность': 'Низкая', 'Влияние': 'Среднее', 'Митигация': 'Договор подписан, документация согласована' },
        { 'Риск': 'Падение спроса на склады', 'Вероятность': 'Низкая', 'Влияние': 'Высокое', 'Митигация': 'Диверсификация в light manufacturing' },
      ],
    },
  ];
}

function buildXlsxBuffer(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

async function ensureBenchProject(): Promise<void> {
  await prisma.user.upsert({
    where: { id: BENCH_USER_ID },
    update: {},
    create: { id: BENCH_USER_ID, email: 'bench@local', name: 'BENCH', role: 'FOUNDER' },
  });
  await prisma.project.upsert({
    where: { id: BENCH_PROJECT_ID },
    update: {},
    create: {
      id: BENCH_PROJECT_ID,
      userId: BENCH_USER_ID,
      name: 'BENCH Atlas Industrial Park',
      industry: 'real_estate',
      stage: 'scaling',
      raiseAmount: 120_000_000,
      currency: 'RUB',
      minCheck: 5_000_000,
      equityOffered: 12,
    },
  });
}

let failed = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main(): Promise<void> {
  await initKnowledgeFts();
  await cleanup();
  await ensureBenchProject();
  // Isolate other KB so retrieval test isn't polluted by demo seeds.
  const isolation: IsolationState = await isolateOthers();
  console.log(`[stress] isolated ${isolation.hiddenSourceIds.length} non-bench sources`);

  // ─── Test A: 12-sheet finmodel ─────────────────────────────────────────
  console.log('\n— A. 12-sheet XLSX ingestion —');
  const sheets = buildFinmodel();
  const buf = buildXlsxBuffer(sheets);
  console.log(`  XLSX built: ${buf.length} bytes, ${sheets.length} sheets`);

  // Save to storage AS upload route does
  const diskName = `${randomUUID()}.xlsx`;
  const rel = path.join(BENCH_PROJECT_ID, diskName);
  await storage.saveBuffer(rel, buf);
  const fileRow = await prisma.uploadedFile.create({
    data: {
      projectId: BENCH_PROJECT_ID,
      filename: diskName,
      originalName: 'BENCH_finmodel_12sheets.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buf.length,
      category: 'financial',
      path: rel,
    },
  });
  ok('UploadedFile row created', !!fileRow.id);

  const t0 = Date.now();
  const result = await ingestProjectFileToKnowledge(fileRow.id, BENCH_PROJECT_ID);
  const durationMs = Date.now() - t0;
  console.log(`  ingest result: status=${result.status} chunks=${result.chunkCount ?? 0} durationMs=${durationMs}ms`);
  ok('ingest succeeded', result.status === 'ingested' || result.status === 'duplicate');
  ok('chunk count > 0', (result.chunkCount ?? 0) > 0, `got ${result.chunkCount}`);

  if (result.sourceId) {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { sourceId: result.sourceId },
      orderBy: { chunkIndex: 'asc' },
    });
    const totalChars = chunks.reduce((s, c) => s + c.text.length, 0);
    console.log(`  totalChars in chunks: ${totalChars}`);
    console.log(`  chunk sizes: ${chunks.map((c) => c.text.length).join(', ')}`);
    console.log(`  sectionLabels: ${chunks.map((c) => c.sectionLabel ?? '-').slice(0, 6).join(' | ')}…`);
    ok('totalChars > 1500 (meaningful content extracted)', totalChars > 1500);

    // Sheet names should survive parsing. extractXlsx prepends "## Sheet: <name>".
    const allText = chunks.map((c) => c.text).join('\n');
    ok('Sheet name "Valuation" survives parsing', allText.includes('Valuation'));
    ok('Sheet name "Use of funds" survives parsing', allText.toLowerCase().includes('use of funds'));
    ok('Sheet name "Risk register" survives parsing', allText.includes('Risk register'));
    ok('Specific number "92" (net profit 2027) survives', /\b92\b/.test(allText));
    ok('Specific number "1000" (valuation pre-money) survives', /\b1000\b/.test(allText));
    ok('Specific term "ЛЭП Россети" survives', allText.includes('ЛЭП') && allText.includes('Россети'));

    // Sprint 62 P4 — chunks have sectionLabel.
    const labeledChunks = chunks.filter((c) => Boolean(c.sectionLabel));
    ok('all chunks have sectionLabel (P4 sheet-aware path)', labeledChunks.length === chunks.length,
      `${labeledChunks.length}/${chunks.length}`);
    ok('sectionLabel matches Sheet pattern', labeledChunks.every((c) => /^Sheet:/.test(c.sectionLabel!)));

    // Sprint 62 P5 — numeric facts persisted.
    const facts = await prisma.projectNumericFact.findMany({
      where: { sourceFileId: fileRow.id },
    });
    console.log(`  numeric facts persisted: ${facts.length}`);
    ok('numeric facts persisted (≥5 expected)', facts.length >= 5, `got ${facts.length}`);
    ok('at least one net_profit fact', facts.some((f) => f.metricSlug === 'net_profit'));
    ok('at least one fact has period 2027', facts.some((f) => f.period === '2027'));
    ok('valuation fact has value > 0', facts.some((f) => f.metricSlug === 'valuation' && f.value > 0));
    ok('all facts link to source file', facts.every((f) => f.sourceFileId === fileRow.id));
    ok('all facts link to project', facts.every((f) => f.projectId === BENCH_PROJECT_ID));
  }

  // ─── Test B: idempotency on re-ingest ──────────────────────────────────
  console.log('\n— B. Idempotency — re-ingest same file —');
  const result2 = await ingestProjectFileToKnowledge(fileRow.id, BENCH_PROJECT_ID);
  ok('second ingest detects duplicate', result2.status === 'duplicate');
  ok('same sourceId returned', result2.sourceId === result.sourceId);

  // ─── Test C: retrieval finds specific 2027 number ──────────────────────
  console.log('\n— C. Retrieval finds specific data from finmodel —');
  const r = await retrieveKnowledgeForTranscript(
    'какая чистая прибыль в 2027 году по финмодели',
    {
      projectId: BENCH_PROJECT_ID,
      role: 'ADMIN',
      topN: 5,
      feature: 'sales_assistant.analyze',
      mode: 'full',
      financeBoost: true,
    },
  );
  console.log(`  retrieved sources: ${r.sources.map((s) => s.title.slice(0, 30) + ` score=${s.score.toFixed(3)}`).join(' | ')}`);
  ok('finmodel in top-3', r.sources.slice(0, 3).some((s) => s.title.includes('BENCH_finmodel_12sheets')));
  const topSnippet = r.sources[0]?.snippetText ?? '';
  ok('top snippet contains relevant data', /прибыль|чист|2027|92/.test(topSnippet),
    `snippet head: "${topSnippet.slice(0, 100)}"`);

  // ─── Test D: empty XLSX (failure mode) ────────────────────────────────
  console.log('\n— D. Empty XLSX (failure mode) —');
  const emptyWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(emptyWb, XLSX.utils.json_to_sheet([]), 'Empty');
  const emptyBuf = XLSX.write(emptyWb, { bookType: 'xlsx', type: 'buffer' });
  const emptyDiskName = `${randomUUID()}.xlsx`;
  const emptyRel = path.join(BENCH_PROJECT_ID, emptyDiskName);
  await storage.saveBuffer(emptyRel, emptyBuf);
  const emptyRow = await prisma.uploadedFile.create({
    data: {
      projectId: BENCH_PROJECT_ID,
      filename: emptyDiskName,
      originalName: 'BENCH_empty.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: emptyBuf.length,
      category: 'financial',
      path: emptyRel,
    },
  });
  const emptyResult = await ingestProjectFileToKnowledge(emptyRow.id, BENCH_PROJECT_ID);
  ok('empty xlsx gracefully skipped', emptyResult.status === 'skipped_short' || emptyResult.status === 'ingest_failed',
    `got status=${emptyResult.status}`);
  ok('empty xlsx does not throw', true);

  // ─── Test E: corrupt buffer (failure mode) ────────────────────────────
  console.log('\n— E. Corrupt XLSX (failure mode) —');
  const corruptDiskName = `${randomUUID()}.xlsx`;
  const corruptRel = path.join(BENCH_PROJECT_ID, corruptDiskName);
  await storage.saveBuffer(corruptRel, Buffer.from('this is not a real xlsx file just random bytes'));
  const corruptRow = await prisma.uploadedFile.create({
    data: {
      projectId: BENCH_PROJECT_ID,
      filename: corruptDiskName,
      originalName: 'BENCH_corrupt.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 48,
      category: 'financial',
      path: corruptRel,
    },
  });
  // Note: XLSX library is permissive — text-like garbage may be salvaged
  // into an empty/single-cell workbook. We assert the process doesn't
  // crash and ingestion either skips or produces a result without throwing.
  const corruptResult = await ingestProjectFileToKnowledge(corruptRow.id, BENCH_PROJECT_ID);
  ok('corrupt xlsx does not crash process',
    ['ingested', 'duplicate', 'skipped_short', 'skipped_format', 'parse_failed', 'ingest_failed'].includes(corruptResult.status),
    `got status=${corruptResult.status} reason=${corruptResult.reason ?? '-'}`);

  // ─── Test F: project_mismatch (security) ───────────────────────────────
  console.log('\n— F. project_mismatch (cross-tenant) —');
  const mismatchResult = await ingestProjectFileToKnowledge(fileRow.id, 'wrong-project-id');
  ok('project_mismatch detected', mismatchResult.status === 'project_mismatch');

  // ─── Test G: missing file ──────────────────────────────────────────────
  console.log('\n— G. Missing UploadedFile row —');
  const missingResult = await ingestProjectFileToKnowledge('nonexistent-file-id', BENCH_PROJECT_ID);
  ok('file_not_found detected', missingResult.status === 'file_not_found');

  await restoreOthers(isolation);
  await cleanup();
  await prisma.$disconnect();

  console.log('\n══════════════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('  ✅ All ingestion stress checks passed.');
    process.exit(0);
  }
  console.error(`  ❌ ${failed} check(s) failed.`);
  process.exit(1);
}

main().catch(async (err) => {
  console.error('[stress] fatal:', err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(2);
});
