// Sprint 61.P1 — Retrieval quality benchmark (CLI entry-point).
//
// Цель: НЕВКУСОВЫЕ числа для решений про projectBoost, financeBoost,
// chunk size, retrieval threshold. См. retrievalBenchmarkFixtures.ts для
// seed-данных и query suite.
//
// Запуск: `npm run benchmark:retrieval`

import { prisma } from '../db.js';
import { retrieveKnowledgeForTranscript } from '../services/knowledgeService.js';
import { initKnowledgeFts, isFtsAvailable } from '../services/knowledgeFts.js';
import { detectFinancialQuestion } from '../services/projectContextFormatter.js';
import {
  BENCH_PROJECT_ID,
  QUERIES,
  cleanup,
  seed,
  isolateOthers,
  restoreOthers,
  type Query,
  type QueryCategory,
  type IsolationState,
} from './retrievalBenchmarkFixtures.js';

type Config = 'baseline' | 'project_only' | 'finance_only' | 'sprint61_auto';

interface QueryResult {
  queryId: string;
  config: Config;
  retrievedIds: string[];
  scores: number[];
  recall1: number;
  recall3: number;
  recall5: number;
  reciprocalRank: number;
  top1Margin: number;
  topScore: number;
}

async function runQuery(
  q: Query,
  config: Config,
  expectedToActual: Map<string, string>,
): Promise<QueryResult> {
  let projectId: string | null = BENCH_PROJECT_ID;
  let financeBoost: boolean | undefined;
  switch (config) {
    case 'baseline':
      projectId = null;
      financeBoost = false;
      break;
    case 'project_only':
      projectId = BENCH_PROJECT_ID;
      financeBoost = false;
      break;
    case 'finance_only':
      projectId = BENCH_PROJECT_ID;
      financeBoost = true;
      break;
    case 'sprint61_auto':
      projectId = BENCH_PROJECT_ID;
      financeBoost = detectFinancialQuestion(q.text);
      break;
  }

  const hybrid = await retrieveKnowledgeForTranscript(q.text, {
    projectId,
    role: 'ADMIN',
    topN: 5,
    feature: 'sales_assistant.analyze',
    mode: 'full',
    financeBoost,
  });

  const expectedActualIds = q.expected.map((id) => expectedToActual.get(id)).filter(Boolean) as string[];
  const retrievedIds = hybrid.sources.map((s) => s.sourceId);
  const scores = hybrid.sources.map((s) => s.score);

  const hitsByPos = retrievedIds.map((id) => expectedActualIds.includes(id));
  const recall1 = hitsByPos[0] ? 1 : 0;
  const recall3 = hitsByPos.slice(0, 3).some(Boolean) ? 1 : 0;
  const recall5 = hitsByPos.slice(0, 5).some(Boolean) ? 1 : 0;
  const firstHitIdx = hitsByPos.findIndex(Boolean);
  const reciprocalRank = firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0;
  const top1Margin = scores.length >= 2 ? scores[0] - scores[1] : (scores[0] ?? 0);
  const topScore = scores[0] ?? 0;

  return {
    queryId: q.id,
    config,
    retrievedIds,
    scores,
    recall1,
    recall3,
    recall5,
    reciprocalRank,
    top1Margin,
    topScore,
  };
}

interface ConfigSummary {
  config: Config;
  totalQueries: number;
  recall1: number;
  recall3: number;
  recall5: number;
  mrr: number;
  avgTopScore: number;
  avgTop1Margin: number;
  byCategory: Record<QueryCategory, { recall1: number; recall5: number; mrr: number; n: number }>;
}

function summarize(results: QueryResult[], queries: Query[]): ConfigSummary[] {
  const configs: Config[] = ['baseline', 'project_only', 'finance_only', 'sprint61_auto'];
  return configs.map((cfg) => {
    const filtered = results.filter((r) => r.config === cfg);
    const byCategory: ConfigSummary['byCategory'] = {
      finance_numeric:     { recall1: 0, recall5: 0, mrr: 0, n: 0 },
      finance_qualitative: { recall1: 0, recall5: 0, mrr: 0, n: 0 },
      risk_objection:      { recall1: 0, recall5: 0, mrr: 0, n: 0 },
      team_pitch:          { recall1: 0, recall5: 0, mrr: 0, n: 0 },
      general_sales:       { recall1: 0, recall5: 0, mrr: 0, n: 0 },
    };
    for (const r of filtered) {
      const q = queries.find((x) => x.id === r.queryId)!;
      const c = byCategory[q.category];
      c.n++;
      c.recall1 += r.recall1;
      c.recall5 += r.recall5;
      c.mrr += r.reciprocalRank;
    }
    for (const k of Object.keys(byCategory) as QueryCategory[]) {
      const c = byCategory[k];
      if (c.n > 0) {
        c.recall1 /= c.n;
        c.recall5 /= c.n;
        c.mrr /= c.n;
      }
    }
    return {
      config: cfg,
      totalQueries: filtered.length,
      recall1: avg(filtered.map((r) => r.recall1)),
      recall3: avg(filtered.map((r) => r.recall3)),
      recall5: avg(filtered.map((r) => r.recall5)),
      mrr: avg(filtered.map((r) => r.reciprocalRank)),
      avgTopScore: avg(filtered.map((r) => r.topScore)),
      avgTop1Margin: avg(filtered.map((r) => r.top1Margin)),
      byCategory,
    };
  });
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function fmt(n: number, digits = 3): string { return n.toFixed(digits); }
function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }
function pad(s: string, n: number): string { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

function printSummary(summaries: ConfigSummary[]): void {
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('  Retrieval benchmark — overall metrics (12 queries × 4 configs)');
  console.log(`  FTS available: ${isFtsAvailable() ? 'yes (BM25 + keyword hybrid)' : 'NO (keyword-only fallback)'}`);
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log('config           | Recall@1 | Recall@3 | Recall@5 |   MRR   | avg top1 | top1-Δ');
  console.log('─────────────────┼──────────┼──────────┼──────────┼─────────┼──────────┼────────');
  for (const s of summaries) {
    console.log(
      pad(s.config, 16) + ' | ' +
      pad(pct(s.recall1), 8) + ' | ' +
      pad(pct(s.recall3), 8) + ' | ' +
      pad(pct(s.recall5), 8) + ' | ' +
      pad(fmt(s.mrr), 7) + ' | ' +
      pad(fmt(s.avgTopScore, 4), 8) + ' | ' +
      pad(fmt(s.avgTop1Margin, 4), 6),
    );
  }
  console.log('\n  By category (Recall@1 / Recall@5 / MRR):');
  const cats: QueryCategory[] = ['finance_numeric', 'finance_qualitative', 'risk_objection', 'team_pitch', 'general_sales'];
  for (const cat of cats) {
    console.log(`\n  ── ${cat} ─────────`);
    for (const s of summaries) {
      const c = s.byCategory[cat];
      if (c.n === 0) continue;
      console.log(
        `    ${pad(s.config, 16)}  R@1=${pct(c.recall1)}  R@5=${pct(c.recall5)}  MRR=${fmt(c.mrr)}  (n=${c.n})`,
      );
    }
  }
  console.log('');
}

function printPerQuery(results: QueryResult[], expectedToActual: Map<string, string>): void {
  console.log('\n  Per-query detail (sprint61_auto config):');
  console.log('  query-id                              cat                  R@1 R@5 MRR    top-score  top-id-match');
  for (const r of results.filter((x) => x.config === 'sprint61_auto')) {
    const q = QUERIES.find((x) => x.id === r.queryId)!;
    const expectedActualIds = q.expected.map((id) => expectedToActual.get(id)).filter(Boolean) as string[];
    const topRetrieved = r.retrievedIds[0] ?? '∅';
    const topMatched = expectedActualIds.includes(topRetrieved);
    const idLabel = humanizeSourceId(topRetrieved, expectedToActual);
    console.log(
      `    ${pad(r.queryId, 37)} ${pad(q.category, 19)} ${r.recall1 ? '✓' : '✗'}   ${r.recall5 ? '✓' : '✗'}   ${fmt(r.reciprocalRank, 2)}   ${fmt(r.topScore, 4)}    ${topMatched ? '✓' : '✗'} ${idLabel}`,
    );
  }
  console.log('');
}

function humanizeSourceId(actualId: string, mapping: Map<string, string>): string {
  for (const [expected, actual] of mapping.entries()) {
    if (actual === actualId) return expected;
  }
  return actualId.slice(0, 12);
}

async function main(): Promise<void> {
  console.log('[bench] init FTS (lazy in production via server startup)…');
  await initKnowledgeFts();
  console.log(`[bench] FTS available: ${isFtsAvailable()}`);
  console.log('[bench] cleanup previous bench data…');
  await cleanup();
  console.log('[bench] isolate other knowledge (hide non-bench published sources)…');
  const isolation: IsolationState = await isolateOthers();
  console.log(`[bench] hid ${isolation.hiddenSourceIds.length} non-bench sources`);
  console.log('[bench] seeding…');
  const expectedToActual = await seed();
  console.log(`[bench] seeded ${expectedToActual.size} sources (project=${BENCH_PROJECT_ID})`);

  const configs: Config[] = ['baseline', 'project_only', 'finance_only', 'sprint61_auto'];
  const results: QueryResult[] = [];
  try {
    for (const q of QUERIES) {
      for (const cfg of configs) {
        results.push(await runQuery(q, cfg, expectedToActual));
      }
    }
  } finally {
    // Restore non-bench KB even if benchmark fails mid-flight.
    console.log('[bench] restoring isolated non-bench sources…');
    await restoreOthers(isolation);
  }

  const summaries = summarize(results, QUERIES);
  printSummary(summaries);
  printPerQuery(results, expectedToActual);

  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('  Delta analysis');
  console.log('══════════════════════════════════════════════════════════════════════════');
  const base = summaries.find((s) => s.config === 'baseline')!;
  const proj = summaries.find((s) => s.config === 'project_only')!;
  const auto = summaries.find((s) => s.config === 'sprint61_auto')!;

  console.log(`  Recall@5  sprint61_auto vs baseline:     ${pct(auto.recall5)} vs ${pct(base.recall5)} (Δ${pct(auto.recall5 - base.recall5)})`);
  console.log(`  Recall@5  sprint61_auto vs project_only: ${pct(auto.recall5)} vs ${pct(proj.recall5)} (Δ${pct(auto.recall5 - proj.recall5)})`);
  console.log(`  MRR       sprint61_auto vs baseline:     ${fmt(auto.mrr)} vs ${fmt(base.mrr)} (Δ${fmt(auto.mrr - base.mrr)})`);
  console.log(`  MRR       sprint61_auto vs project_only: ${fmt(auto.mrr)} vs ${fmt(proj.mrr)} (Δ${fmt(auto.mrr - proj.mrr)})`);

  // Regression detection — точечные пороги.
  let regressed = false;
  if (auto.mrr < proj.mrr - 0.01) {
    console.error('\n  ❌ REGRESSION: sprint61_auto MRR worse than project_only. Finance boost hurting.');
    regressed = true;
  }
  if (proj.mrr < base.mrr - 0.01) {
    console.error('\n  ❌ REGRESSION: project_only MRR worse than baseline. Project boost hurting.');
    regressed = true;
  }

  // Sprint 61.P1 — weight sweep. После основного A/B/C/D прогона, проверяем
  // несколько альтернативных hybrid-весов на sprint61_auto конфиге. Это даёт
  // эмпирику для будущего решения «крутить ли bm25/keyword». НЕ меняет prod.
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('  Weight sweep (sprint61_auto config, 12 queries)');
  console.log('══════════════════════════════════════════════════════════════════════════');
  const sweeps: Array<{ name: string; weights: NonNullable<Parameters<typeof retrieveKnowledgeForTranscript>[1]['scoringWeights']> }> = [
    { name: 'prod (0.4 bm25 / 0.2 kw)', weights: {} }, // defaults
    { name: 'balanced (0.3 / 0.3)',     weights: { bm25: 0.3, keyword: 0.3 } },
    { name: 'kw-heavy (0.2 / 0.4)',     weights: { bm25: 0.2, keyword: 0.4 } },
    { name: 'project-boost 1.6',        weights: { projectBoost: 1.6 } },
    { name: 'project-boost 1.2',        weights: { projectBoost: 1.2 } },
    { name: 'fin-mul 1.8',              weights: { financeQuestionMul: 1.8 } },
  ];
  for (const sweep of sweeps) {
    const sweepResults: QueryResult[] = [];
    for (const q of QUERIES) {
      const financeBoost = detectFinancialQuestion(q.text);
      const hybrid = await retrieveKnowledgeForTranscript(q.text, {
        projectId: BENCH_PROJECT_ID,
        role: 'ADMIN',
        topN: 5,
        feature: 'sales_assistant.analyze',
        mode: 'full',
        financeBoost,
        scoringWeights: sweep.weights,
      });
      const expectedActualIds = q.expected.map((id) => expectedToActual.get(id)).filter(Boolean) as string[];
      const retrievedIds = hybrid.sources.map((s) => s.sourceId);
      const scores = hybrid.sources.map((s) => s.score);
      const hitsByPos = retrievedIds.map((id) => expectedActualIds.includes(id));
      sweepResults.push({
        queryId: q.id,
        config: 'sprint61_auto',
        retrievedIds,
        scores,
        recall1: hitsByPos[0] ? 1 : 0,
        recall3: hitsByPos.slice(0, 3).some(Boolean) ? 1 : 0,
        recall5: hitsByPos.slice(0, 5).some(Boolean) ? 1 : 0,
        reciprocalRank: (() => { const i = hitsByPos.findIndex(Boolean); return i >= 0 ? 1 / (i + 1) : 0; })(),
        top1Margin: scores.length >= 2 ? scores[0] - scores[1] : (scores[0] ?? 0),
        topScore: scores[0] ?? 0,
      });
    }
    const r1 = avg(sweepResults.map((r) => r.recall1));
    const r3 = avg(sweepResults.map((r) => r.recall3));
    const r5 = avg(sweepResults.map((r) => r.recall5));
    const mrr = avg(sweepResults.map((r) => r.reciprocalRank));
    console.log(`  ${pad(sweep.name, 32)}  R@1=${pct(r1)}  R@3=${pct(r3)}  R@5=${pct(r5)}  MRR=${fmt(mrr)}`);
  }
  console.log('');

  await cleanup();
  await prisma.$disconnect();
  if (regressed) process.exit(1);
  console.log('\n  ✅ No regression vs baseline.\n');
}

main().catch(async (err) => {
  console.error('[bench] fatal:', err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(2);
});
