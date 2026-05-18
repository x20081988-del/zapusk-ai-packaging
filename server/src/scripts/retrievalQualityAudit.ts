// Sprint 62.VERIFICATION P2 — Retrieval quality on realistic project data.
//
// We seed 2 realistic projects (Luce Silva-like + Atlas-like) with file
// uploads going through the production ingestion path, then probe with
// finance/market/team/deal questions and verify:
//   • Retrieval returns project-scoped chunks first.
//   • sectionLabel surfaces for XLSX chunks.
//   • Numeric facts get populated and retrieved by query.
//   • Project KB DOES NOT cross-contaminate (project A chunks must NOT
//     leak into project B retrieval).

import { prisma } from '../db.js';
import { initKnowledgeFts } from '../services/knowledgeFts.js';
import { retrieveKnowledgeForTranscript } from '../services/knowledgeService.js';
import { retrieveProjectNumericFacts } from '../services/numericFactsRetrieval.js';
import { ingestProjectFileToKnowledge } from '../services/projectKnowledgeIngest.js';
import { detectFinancialQuestion } from '../services/projectContextFormatter.js';
import { storage } from '../services/storage.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';

let failed = 0;
function ok(label: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t: string): void { console.log(`\n── ${t} ──`); }

const USER_ID = 'p2-audit-user-fixed';
const PROJECT_A_ID = 'p2-audit-luce-silva';  // wedding-venue project
const PROJECT_B_ID = 'p2-audit-atlas';        // industrial-park project

// Luce Silva-style: hospitality, weddings, glass orangery.
const LUCE_PITCH_TEXT = [
  'Luce Silva — премиальная свадебная площадка в Подмосковье.',
  'Стеклянные оранжереи, кейтеринг премиум-сегмента, парковка на 80 машин.',
  'Команда: Анастасия Глебова (CEO, 7 лет в hospitality), Елена Захарова (event director, ex Soho Family).',
  'Стадия: early_revenue. 28 свадеб проведено в 2025.',
  'Уникальное предложение — full-service венчание под ключ за 14 дней.',
].join('\n\n');

function makeLuceFinmodel(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Показатель': 'Выручка', '2025': 95, '2026': 165, '2027': 240, '2028': 310 },
    { 'Показатель': 'EBITDA', '2025': 28, '2026': 55, '2027': 88, '2028': 124 },
    { 'Показатель': 'Чистая прибыль', '2025': 11, '2026': 32, '2027': 56, '2028': 82 },
  ]), 'P&L');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Параметр': 'Pre-money млн', value: 280 },
    { 'Параметр': 'IRR 5 лет', value: 32 },
    { 'Параметр': 'Окупаемость лет', value: 5 },
  ]), 'Valuation');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Метрика': 'Средний чек свадьбы млн', value: 2.4 },
    { 'Метрика': 'Свадеб в год', value: 70 },
    { 'Метрика': 'CAC RUB', value: 95000 },
  ]), 'Unit Economics');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

const ATLAS_PITCH_TEXT = [
  'Atlas Industrial Park — сеть промышленных парков под аренду логистике и легкому производству.',
  'Регионы ЦФО. 18 действующих арендаторов.',
  'Команда: Григорий Луцик (CEO, 12 лет в commercial RE), Анна Соловьёва (CFO, ex-DLFY).',
  'Стадия: scaling. Подписано 3 anchor-арендатора с длинными контрактами.',
].join('\n\n');

function makeAtlasFinmodel(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Показатель': 'Выручка', '2025': 280, '2026': 380, '2027': 520, '2028': 680 },
    { 'Показатель': 'EBITDA', '2025': 95, '2026': 145, '2027': 210, '2028': 295 },
    { 'Показатель': 'Чистая прибыль', '2025': 38, '2026': 65, '2027': 92, '2028': 128 },
  ]), 'P&L');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Параметр': 'Pre-money млн', value: 1000 },
    { 'Параметр': 'IRR 5 лет', value: 25 },
  ]), 'Valuation');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Метрика': 'CAC RUB', value: 180000 },
    { 'Метрика': 'Средний контракт мес', value: 36 },
  ]), 'Unit Economics');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

async function uploadAndIngest(projectId: string, name: string, mime: string, buf: Buffer, category: string): Promise<string> {
  const diskName = `${randomUUID()}${path.extname(name)}`;
  const rel = path.join(projectId, diskName);
  await storage.saveBuffer(rel, buf);
  const row = await prisma.uploadedFile.create({
    data: {
      projectId, filename: diskName, originalName: name,
      mimeType: mime, size: buf.length, category, path: rel,
    },
  });
  await ingestProjectFileToKnowledge(row.id, projectId);
  return row.id;
}

async function cleanup(): Promise<void> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { projectId: { in: [PROJECT_A_ID, PROJECT_B_ID] } },
    select: { id: true },
  });
  if (sources.length > 0) {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { in: sources.map((s) => s.id) } } });
    await prisma.knowledgeSource.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } });
  }
  await prisma.projectNumericFact.deleteMany({ where: { projectId: { in: [PROJECT_A_ID, PROJECT_B_ID] } } });
  await prisma.uploadedFile.deleteMany({ where: { projectId: { in: [PROJECT_A_ID, PROJECT_B_ID] } } });
  await prisma.project.deleteMany({ where: { id: { in: [PROJECT_A_ID, PROJECT_B_ID] } } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function seed(): Promise<void> {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: 'p2-audit@local', name: 'P2 Audit', role: 'FOUNDER' },
  });
  // Project A — Luce Silva-like.
  await prisma.project.create({
    data: {
      id: PROJECT_A_ID,
      userId: USER_ID,
      name: 'AUDIT_Luce_Silva',
      industry: 'wedding venue',
      stage: 'early_revenue',
      raiseAmount: 60_000_000,
      currency: 'RUB',
      minCheck: 2_000_000,
      equityOffered: 18,
    },
  });
  await uploadAndIngest(PROJECT_A_ID, 'luce_pitch.txt', 'text/plain', Buffer.from(LUCE_PITCH_TEXT, 'utf8'), 'pitch');
  await uploadAndIngest(PROJECT_A_ID, 'luce_finmodel.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    makeLuceFinmodel(), 'financial');

  // Project B — Atlas-like (industrial park).
  await prisma.project.create({
    data: {
      id: PROJECT_B_ID,
      userId: USER_ID,
      name: 'AUDIT_Atlas_Park',
      industry: 'real_estate',
      stage: 'scaling',
      raiseAmount: 120_000_000,
      currency: 'RUB',
      minCheck: 5_000_000,
      equityOffered: 12,
    },
  });
  await uploadAndIngest(PROJECT_B_ID, 'atlas_pitch.txt', 'text/plain', Buffer.from(ATLAS_PITCH_TEXT, 'utf8'), 'pitch');
  await uploadAndIngest(PROJECT_B_ID, 'atlas_finmodel.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    makeAtlasFinmodel(), 'financial');
}

async function runQuery(projectId: string, query: string): Promise<{ retrieved: Array<{ title: string; scope: string; score: number; sectionLabel: string | null }>; facts: Array<{ metric: string; period: string | null; value: number; sectionLabel: string | null }> }> {
  const isFin = detectFinancialQuestion(query);
  const result = await retrieveKnowledgeForTranscript(query, {
    projectId, role: 'ADMIN', topN: 5, feature: 'sales_assistant.analyze',
    mode: 'full', financeBoost: isFin,
  });
  const facts = isFin
    ? await retrieveProjectNumericFacts({ projectIds: [projectId], transcript: query, limit: 10 })
    : [];
  return {
    retrieved: result.sources.map((s) => ({
      title: s.title, scope: s.scope, score: Number(s.score.toFixed(4)),
      sectionLabel: s.sectionLabel ?? null,
    })),
    facts: facts.map((f) => ({ metric: f.metric, period: f.period, value: f.value, sectionLabel: f.sectionLabel })),
  };
}

async function main(): Promise<void> {
  await initKnowledgeFts();
  console.log('[p2-audit] cleanup + seed…');
  await cleanup();
  await seed();
  console.log('[p2-audit] seeded 2 projects with pitch + 3-sheet XLSX each.');

  // ─── 1. Cross-project isolation ─────────────────────────────────────────
  section('1. Cross-project isolation (project A query MUST NOT see project B)');
  {
    const r = await runQuery(PROJECT_A_ID, 'какая EBITDA в 2027 году');
    const fromBProject = r.retrieved.filter((x) => x.scope === 'project' && /Atlas/.test(x.title));
    ok('no Atlas KB chunks in Luce Silva retrieval',
      fromBProject.length === 0, `got ${fromBProject.length}`);
    const factTitles = r.facts.map((f) => `${f.metric}=${f.value}`).join(' | ');
    ok('numeric facts come from Luce Silva (EBITDA 2027 = 88, not 210)',
      r.facts.some((f) => f.metric === 'EBITDA' && f.period === '2027' && f.value === 88)
      && !r.facts.some((f) => f.value === 210),
      `facts: ${factTitles}`);
  }

  // ─── 2. Finance query — XLSX sectionLabel surfaces ──────────────────────
  section('2. Finance query — sectionLabel from sheet-aware chunking');
  {
    const r = await runQuery(PROJECT_B_ID, 'какая чистая прибыль в 2027 году по финмодели?');
    const topFromXlsx = r.retrieved.find((x) => x.sectionLabel?.startsWith('Sheet:'));
    ok('at least one returned chunk has sectionLabel "Sheet: …"',
      Boolean(topFromXlsx), `top: ${JSON.stringify(r.retrieved[0])}`);
    ok('numeric facts include net_profit 2027 = 92',
      r.facts.some((f) => f.metric === 'Чистая прибыль' && f.period === '2027' && f.value === 92),
      `facts count: ${r.facts.length}`);
  }

  // ─── 3. Team query — pitch chunk wins ───────────────────────────────────
  section('3. Team query — pitch (project_presentation) chunk should rank top');
  {
    const r = await runQuery(PROJECT_B_ID, 'расскажите про команду проекта, кто CFO?');
    ok('at least one project-scoped chunk retrieved', r.retrieved.some((x) => x.scope === 'project'));
    ok('Atlas pitch text wins (mentions «Анна Соловьёва»)',
      r.retrieved.some((x) => /atlas_pitch|pitch.*atlas/i.test(x.title)),
      `titles: ${r.retrieved.map((x) => x.title).join(' | ')}`);
  }

  // ─── 4. Market query — generic, fallback OK ─────────────────────────────
  section('4. Market query — graceful behavior when no specific KB');
  {
    const r = await runQuery(PROJECT_A_ID, 'какой рынок свадебных услуг в России и его динамика?');
    // No market data uploaded; retrieval should fall back to either KB or empty.
    // We only assert that no Atlas chunks leak in (isolation property).
    const atlasLeak = r.retrieved.filter((x) => /atlas/i.test(x.title));
    ok('no Atlas leak in Luce Silva market query', atlasLeak.length === 0);
  }

  // ─── 5. Deal structure query — finance triggers boost ───────────────────
  section('5. Deal structure query — finance trigger + project boost');
  {
    const r = await runQuery(PROJECT_B_ID, 'какая оценка проекта pre-money и условия выхода?');
    ok('valuation fact returned',
      r.facts.some((f) => f.metric.toLowerCase().includes('pre-money') || f.metric.toLowerCase().includes('valuation') || /pre-money/i.test(f.metric))
      || r.facts.some((f) => f.value === 1000),
      `facts: ${r.facts.map((f) => `${f.metric}=${f.value}`).join('|')}`);
  }

  // ─── 6. Retrieval debug panel parity ────────────────────────────────────
  //
  // Verifies that what the admin SEES in RetrievalDebugPanel (via
  // search-debug-v2 → retrieveKnowledgeForTranscript) matches what the
  // analyze prompt SEES (also via retrieveKnowledgeForTranscript). Both
  // paths share the same engine — this is a contract test against drift.
  section('6. Debug panel = analyze prompt (same engine path)');
  {
    const query = 'какая EBITDA маржа в 2027?';
    const fromAnalyzePath = await retrieveKnowledgeForTranscript(query, {
      projectId: PROJECT_B_ID, role: 'ADMIN', topN: 5,
      feature: 'sales_assistant.analyze', mode: 'full', financeBoost: true,
    });
    const fromDebugPath = await retrieveKnowledgeForTranscript(query, {
      projectId: PROJECT_B_ID, role: 'ADMIN', topN: 5,
      feature: 'sales_assistant.analyze', mode: 'debug', financeBoost: true,
    });
    ok('both paths return same source IDs in same order',
      JSON.stringify(fromAnalyzePath.sources.map((s) => s.sourceId)) ===
      JSON.stringify(fromDebugPath.sources.map((s) => s.sourceId)),
      `analyze: ${fromAnalyzePath.sources.map((s) => s.sourceId).join(',')} debug: ${fromDebugPath.sources.map((s) => s.sourceId).join(',')}`);
    ok('debug mode adds breakdown to each source',
      fromDebugPath.sources.every((s) => s.breakdown !== undefined));
    ok('analyze mode does NOT expose breakdown',
      fromAnalyzePath.sources.every((s) => s.breakdown === undefined));
  }

  await cleanup();
  await prisma.$disconnect();

  console.log('\n══════════════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('  ✅ All retrieval-quality audit checks passed.');
    process.exit(0);
  }
  console.error(`  ❌ ${failed} check(s) failed.`);
  process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
