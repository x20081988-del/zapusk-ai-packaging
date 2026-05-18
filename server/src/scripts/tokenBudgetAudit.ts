// Sprint 62.VERIFICATION P0 — Token budget audit.
//
// What this measures:
//   For 3 scenarios (small / medium / worst-case-12-sheet-XLSX),
//   compose the EXACT analyze prompt that production would build and
//   report per-segment token estimates.
//
// Scenarios:
//   A. Cold-start. No KB, short transcript, no manual context, no project files.
//   B. Mid-session. 7 KB sources seeded (bench dataset, P1.A baseline),
//      moderate transcript, finance question, project + financialFacts.
//   C. Worst-case. 12-sheet XLSX ingested (sheet-aware chunking + 80 numeric
//      facts persisted), long transcript with finance + risk triggers,
//      manualContext present (Zoom Notes simulation), interim transcript
//      appended, KB returns top-5 sources (per `analyze` mode).
//
// We measure:
//   • per-segment chars + estimated tokens (via promptBudget.estimateTokens —
//     same heuristic that production uses)
//   • totals
//   • warnings emitted by profilePrompt (8K soft / 12K hard / 4K per-segment)
//
// We do NOT call the real OpenAI API. Heuristic tokenizer is ±15% of
// tiktoken on Cyrillic and ±10% on ASCII (per Sprint 61.P1 calibration).

import { prisma } from '../db.js';
import { initKnowledgeFts } from '../services/knowledgeFts.js';
import { retrieveKnowledgeForTranscript, formatKnowledgeForPrompt } from '../services/knowledgeService.js';
import {
  loadProjectsForContext,
  formatProjectsContextForAssistant,
  detectFinancialQuestion,
} from '../services/projectContextFormatter.js';
import { buildProjectFinancialFacts } from '../services/projectFinancialFacts.js';
import { retrieveProjectNumericFacts } from '../services/numericFactsRetrieval.js';
import { profilePrompt, estimateTokens } from '../services/promptBudget.js';
import {
  BENCH_PROJECT_ID,
  cleanup,
  isolateOthers,
  restoreOthers,
  seed,
  type IsolationState,
} from './retrievalBenchmarkFixtures.js';
import { ingestProjectFileToKnowledge } from '../services/projectKnowledgeIngest.js';
import { storage } from '../services/storage.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';

interface ScenarioReport {
  name: string;
  transcriptChars: number;
  projectContextChars: number;
  projectContextTokens: number;
  financialFactsChars: number;
  financialFactsTokens: number;
  kbChars: number;
  kbTokens: number;
  manualChars: number;
  manualTokens: number;
  taskListChars: number;
  taskListTokens: number;
  systemTokens: number;
  totalTokens: number;
  totalChars: number;
  warnings: string[];
}

// Reuse the bench finmodel sheet generator (matches ingestStress.ts shape).
function buildFinmodelBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const sheets: Array<{ name: string; rows: Array<Record<string, string | number>> }> = [
    { name: 'P&L Summary', rows: [
      { 'Показатель': 'Выручка', '2025': 280, '2026': 380, '2027': 520, '2028': 680, '2029': 850 },
      { 'Показатель': 'EBITDA', '2025': 95, '2026': 145, '2027': 210, '2028': 295, '2029': 380 },
      { 'Показатель': 'Чистая прибыль', '2025': 38, '2026': 65, '2027': 92, '2028': 128, '2029': 168 },
      { 'Показатель': 'EBITDA margin %', '2025': 33.9, '2026': 38.2, '2027': 40.4, '2028': 43.4, '2029': 44.7 },
    ]},
    { name: 'Revenue by source', rows: [
      { 'Источник': 'Аренда', '2025': 230, '2026': 310, '2027': 420, '2028': 540, '2029': 670 },
      { 'Источник': 'Сервис', '2025': 40, '2026': 55, '2027': 75, '2028': 100, '2029': 130 },
    ]},
    { name: 'Cost structure', rows: [
      { 'Статья': 'Эксплуатация', '2025': 65, '2026': 85, '2027': 110, '2028': 140, '2029': 175 },
      { 'Статья': 'Управление', '2025': 35, '2026': 45, '2027': 60, '2028': 75, '2029': 90 },
      { 'Статья': 'Налоги', '2025': 30, '2026': 45, '2027': 70, '2028': 95, '2029': 125 },
    ]},
    { name: 'Capex', rows: [
      { 'Объект': 'Очередь 3 - стройка', '2025': 180, '2026': 120, '2027': 0, '2028': 0, '2029': 0 },
      { 'Объект': 'ЛЭП подключение', '2025': 45, '2026': 25, '2027': 0, '2028': 0, '2029': 0 },
    ]},
    { name: 'Unit Economics', rows: [
      { 'Метрика': 'CAC RUB', value: 180000 },
      { 'Метрика': 'Средний контракт мес', value: 36 },
      { 'Метрика': 'Сервисная маржа %', value: 38 },
    ]},
    { name: 'Tenant pipeline', rows: [
      { 'Год': 2025, 'Активные арендаторы': 18, 'Vacancy %': 6 },
      { 'Год': 2026, 'Активные арендаторы': 22, 'Vacancy %': 5 },
      { 'Год': 2027, 'Активные арендаторы': 26, 'Vacancy %': 4 },
    ]},
    { name: 'Sensitivity', rows: [
      { 'Сценарий': 'Base', 'IRR %': 25, 'Net profit 2027': 92 },
      { 'Сценарий': 'Optimistic', 'IRR %': 31, 'Net profit 2027': 118 },
      { 'Сценарий': 'Pessimistic', 'IRR %': 18, 'Net profit 2027': 64 },
    ]},
    { name: 'Use of funds', rows: [
      { 'Направление': 'Строительство', 'Доля %': 60 },
      { 'Направление': 'Коммуникации', 'Доля %': 25 },
      { 'Направление': 'Оборотный капитал', 'Доля %': 15 },
    ]},
    { name: 'Debt schedule', rows: [
      { 'Год': 2025, 'Остаток долга': 80, 'Процентные платежи': 8 },
      { 'Год': 2026, 'Остаток долга': 70, 'Процентные платежи': 7 },
      { 'Год': 2027, 'Остаток долга': 60, 'Процентные платежи': 6 },
    ]},
    { name: 'Cash flow', rows: [
      { 'Год': 2025, 'Operating CF': 60, 'Investing CF': -80, 'Financing CF': -10 },
      { 'Год': 2026, 'Operating CF': 85, 'Investing CF': -65, 'Financing CF': -10 },
      { 'Год': 2027, 'Operating CF': 110, 'Investing CF': -50, 'Financing CF': -10 },
    ]},
    { name: 'Valuation', rows: [
      { 'Параметр': 'Pre-money valuation млн', value: 1000 },
      { 'Параметр': 'IRR 5 лет', value: 25 },
      { 'Параметр': 'Окупаемость лет', value: 4.5 },
    ]},
    { name: 'Risk register', rows: [
      { 'Риск': 'Концентрация арендаторов', 'Митигация': 'Waiting-list 4 кандидата + break-fee 6 мес' },
      { 'Риск': 'Задержка ЛЭП', 'Митигация': 'Договор с Россетями подписан' },
    ]},
  ];
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

const SHORT_TRANSCRIPT = 'Здравствуйте, я рассматриваю проект Atlas.';

const MEDIUM_TRANSCRIPT = [
  'Здравствуйте. Я Александр, представляю частный фонд.',
  'Расскажите, в какой стадии проект и какие конкретно условия по чеку?',
  'Меня в первую очередь интересует доходность и риски — у вас якорные арендаторы.',
  'Какая у вас EBITDA в 2027 году по плану и как вы видите выход через 5 лет?',
  'Я обычно захожу чеками 30-50 миллионов на 5-7 лет, IRR не ниже 22%.',
].join(' ');

const LONG_FINANCE_TRANSCRIPT = (() => {
  const base = [
    'Спасибо за встречу. Я Григорий, частный инвестор, специализируюсь на industrial real estate с 2014 года.',
    'У меня сейчас три объекта в Подмосковье и один в Калуге — суммарно около 65 тысяч квадратных метров.',
    'Расскажите, в какой стадии Atlas сейчас, что с очередью три и когда планируется ввод.',
    'Какая чистая прибыль у вас по плану на 2027 год по финансовой модели?',
    'Меня смущает концентрация на двух якорных арендаторах — какие у вас mitigation?',
    'Что с подключением ЛЭП — это типовой долгий процесс с Россетями?',
    'Какая структура use of funds — куда конкретно пойдут привлечённые деньги?',
    'EBITDA margin 40 процентов — на чём она держится, и как реагирует на снижение arr и средней ставки?',
    'Окупаемость 4.5 года — это с учётом amortization или cash-on-cash?',
    'Расскажите про команду — кто отвечает за финансы и эксплуатацию?',
    'Какие у вас сейчас активные переговоры с другими инвесторами?',
    'Я могу зайти чеком 50 миллионов рублей, но мне нужна структура с защитой капитала.',
    'Можем обсудить выкуп доли через 5 лет с заранее зафиксированным валюейшеном?',
    'Покажите ваш sensitivity scenario — что будет если выручка отстанет на 20 процентов?',
    'А как выглядит cap table сейчас — кто из основателей сколько имеет?',
  ];
  return base.join(' ');
})();

const MANUAL_CONTEXT_LONG = [
  'Контекст из Zoom Notes до сегодняшней встречи.',
  'Инвестор: Григорий Соловьёв. Уже инвестировал в коммерческую недвижимость.',
  'Был знаком с проектом по презентации от 8 мая, задал вопросы по очереди 3 и финмодели.',
  'Прошлая итерация переговоров закончилась на «надо изучить риски ЛЭП и финансовую модель глубже».',
  'Мы прислали ему обновлённую финмодель v3 и краткое описание митигации anchor-tenant риска.',
  'На сегодняшней встрече цель — обсудить условия и получить предварительный сигнал по сумме и срокам.',
  'Investor profile: 45 лет, прошлый опыт — Tinkoff Capital, сейчас family office.',
  'Известные предпочтения: предсказуемый cash flow, защита капитала через личное поручительство фаундера.',
].join('\n');

function measureScenario(
  name: string,
  segments: Array<{ label: string; text: string }>,
): ScenarioReport {
  const report = profilePrompt(segments);
  const get = (label: string): { chars: number; tokens: number } => {
    const s = report.segments.find((seg) => seg.label === label);
    return { chars: s?.chars ?? 0, tokens: s?.tokens ?? 0 };
  };
  return {
    name,
    transcriptChars: get('transcript').chars,
    projectContextChars: get('project_context').chars,
    projectContextTokens: get('project_context').tokens,
    financialFactsChars: get('finance_facts').chars,
    financialFactsTokens: get('finance_facts').tokens,
    kbChars: get('kb').chars,
    kbTokens: get('kb').tokens,
    manualChars: get('manual').chars,
    manualTokens: get('manual').tokens,
    taskListChars: get('task_list').chars,
    taskListTokens: get('task_list').tokens,
    systemTokens: get('system').tokens,
    totalChars: report.totalChars,
    totalTokens: report.totalTokens,
    warnings: report.warnings,
  };
}

async function buildSystemPromptStub(): Promise<string> {
  // Mirror the sales_gpt template body. We don't run resolveSalesPrompt
  // since that would create DB writes. Use a realistic-sized stub instead;
  // the actual prod template ~5500 chars per Sprint 56 verbatim version.
  // We measure the BIGGEST realistic value.
  const stub = [
    'Ты — Zapusk Sales Assistant, live AI co-pilot встречи фаундера с инвестором.',
    'Главная задача: давать structured mini-brief, который сканируется за 5 секунд.',
    'Методология ZAPUSK SPIN: Situation / Problem / Implication / Need-payoff.',
    'Эмоциональный слой: investorState, conversationTemperature, momentum.',
    'Engagement signal: длина ответов, встречные вопросы, эмоциональные слова, защитные реакции.',
    'Tones: SOFT (доверие) / CONTROL (ведение) / CLOSE (деньги). Меняй tone по динамике.',
    'Не повторяй previousAdvice. Если этап S закрыт — двигай в P/I/N.',
    'Включай 2-4 backupQuestions, 1-2 selfSaleQuestions если этап S/P или passive.',
    'miniPitch — только если виден сигнал интереса в transcript; иначе null.',
    'whatToDo: 1-2 действия. whatNotToDo: 1-3 пункта.',
    'conversationObjective — цель этапа. conversationDirection — куда ведём дальше.',
    'dealNextStep — конкретный шаг (диапазон чека, дата встречи).',
    'Верни строго JSON. Никаких пояснений, никакого markdown.',
    'Желателен короткий русский текст в каждом поле. Длинные предложения не нужны.',
  ].join('\n').repeat(4); // pad to ~6K chars to mimic realistic prod template
  return stub;
}

async function main(): Promise<void> {
  console.log('[token-audit] init…');
  await initKnowledgeFts();
  console.log('[token-audit] cleanup previous bench data…');
  await cleanup();
  console.log('[token-audit] isolate other KB sources…');
  const isolation: IsolationState = await isolateOthers();
  console.log(`[token-audit] hidden ${isolation.hiddenSourceIds.length} non-bench sources`);
  console.log('[token-audit] seed bench dataset…');
  await seed();

  // Add 12-sheet XLSX to the bench project so we exercise sheet-aware path.
  const buf = buildFinmodelBuffer();
  const diskName = `audit-${randomUUID()}.xlsx`;
  const rel = path.join(BENCH_PROJECT_ID, diskName);
  await storage.saveBuffer(rel, buf);
  const fileRow = await prisma.uploadedFile.create({
    data: {
      projectId: BENCH_PROJECT_ID,
      filename: diskName,
      originalName: 'AUDIT_finmodel_12sheets.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buf.length,
      category: 'financial',
      path: rel,
    },
  });
  const ingestResult = await ingestProjectFileToKnowledge(fileRow.id, BENCH_PROJECT_ID);
  console.log(`[token-audit] XLSX ingest: status=${ingestResult.status} chunks=${ingestResult.chunkCount ?? 0}`);

  const system = await buildSystemPromptStub();
  const loadedProjects = await loadProjectsForContext([BENCH_PROJECT_ID]);
  const reports: ScenarioReport[] = [];

  // ─── A. Cold start ──────────────────────────────────────────────────────
  {
    const projectContext = formatProjectsContextForAssistant([], { verbosity: 'full' });
    const knowledge = await retrieveKnowledgeForTranscript(SHORT_TRANSCRIPT, {
      projectId: null, role: 'FOUNDER', topN: 5, mode: 'full', feature: 'sales_assistant.analyze',
    });
    const kbBlock = formatKnowledgeForPrompt(knowledge, 'FOUNDER', { charBudget: 4000 });
    reports.push(measureScenario('A. Cold-start (no project, no KB)', [
      { label: 'system',          text: system },
      { label: 'project_context', text: projectContext },
      { label: 'finance_facts',   text: '' },
      { label: 'kb',              text: kbBlock },
      { label: 'memory',          text: '' },
      { label: 'qualification',   text: '' },
      { label: 'transcript',      text: SHORT_TRANSCRIPT },
      { label: 'recent_context',  text: SHORT_TRANSCRIPT },
      { label: 'advice_history',  text: '' },
      { label: 'manual',          text: '' },
      { label: 'task_list',       text: 'Задача: коротко.' },
    ]));
  }

  // ─── B. Mid-session ─────────────────────────────────────────────────────
  {
    const projectContext = formatProjectsContextForAssistant(loadedProjects, { verbosity: 'full' });
    const isFin = detectFinancialQuestion(MEDIUM_TRANSCRIPT);
    const numericFacts = isFin
      ? await retrieveProjectNumericFacts({ projectIds: [BENCH_PROJECT_ID], transcript: MEDIUM_TRANSCRIPT, limit: 15 })
      : [];
    const facts = buildProjectFinancialFacts(loadedProjects, MEDIUM_TRANSCRIPT, {
      forceInclude: false, charBudget: 1500, numericFacts,
    });
    const knowledge = await retrieveKnowledgeForTranscript(MEDIUM_TRANSCRIPT, {
      projectId: BENCH_PROJECT_ID, role: 'ADMIN', topN: 5, mode: 'full',
      feature: 'sales_assistant.analyze', financeBoost: isFin,
    });
    const kbBlock = formatKnowledgeForPrompt(knowledge, 'ADMIN', { charBudget: 4000 });
    reports.push(measureScenario('B. Mid-session (project + bench KB + facts)', [
      { label: 'system',          text: system },
      { label: 'project_context', text: projectContext },
      { label: 'finance_facts',   text: facts },
      { label: 'kb',              text: kbBlock },
      { label: 'memory',          text: '' },
      { label: 'qualification',   text: '' },
      { label: 'transcript',      text: MEDIUM_TRANSCRIPT },
      { label: 'recent_context',  text: MEDIUM_TRANSCRIPT },
      { label: 'advice_history',  text: 'previous step 1; previous step 2; previous step 3' },
      { label: 'manual',          text: '' },
      { label: 'task_list',       text: 'Задача (full).'.repeat(40) },
    ]));
  }

  // ─── C. Worst-case ──────────────────────────────────────────────────────
  {
    const projectContext = formatProjectsContextForAssistant(loadedProjects, { verbosity: 'full' });
    const isFin = detectFinancialQuestion(LONG_FINANCE_TRANSCRIPT);
    const numericFacts = isFin
      ? await retrieveProjectNumericFacts({ projectIds: [BENCH_PROJECT_ID], transcript: LONG_FINANCE_TRANSCRIPT, limit: 15 })
      : [];
    const facts = buildProjectFinancialFacts(loadedProjects, LONG_FINANCE_TRANSCRIPT, {
      forceInclude: false, charBudget: 1500, numericFacts,
    });
    const knowledge = await retrieveKnowledgeForTranscript(LONG_FINANCE_TRANSCRIPT, {
      projectId: BENCH_PROJECT_ID, role: 'ADMIN', topN: 5, mode: 'full',
      feature: 'sales_assistant.analyze', financeBoost: isFin,
    });
    const kbBlock = formatKnowledgeForPrompt(knowledge, 'ADMIN', { charBudget: 4000 });
    reports.push(measureScenario('C. Worst-case (12-sheet XLSX + long transcript + manual)', [
      { label: 'system',          text: system },
      { label: 'project_context', text: projectContext },
      { label: 'finance_facts',   text: facts },
      { label: 'kb',              text: kbBlock },
      { label: 'memory',          text: '' },
      { label: 'qualification',   text: '' },
      { label: 'transcript',      text: LONG_FINANCE_TRANSCRIPT.repeat(20) },
      { label: 'recent_context',  text: LONG_FINANCE_TRANSCRIPT.slice(-6000) },
      { label: 'advice_history',  text: ('previous step ' + 'X '.repeat(50)).repeat(6) },
      { label: 'manual',          text: MANUAL_CONTEXT_LONG },
      { label: 'task_list',       text: 'Задача (full).'.repeat(40) },
    ]));
  }

  // ─── Report ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('  Sprint 62 P0 — Token budget audit');
  console.log('══════════════════════════════════════════════════════════════════════════');
  for (const r of reports) {
    console.log(`\n── ${r.name} ──`);
    console.log(`  system            ${r.systemTokens.toString().padStart(5)} t`);
    console.log(`  project_context   ${r.projectContextTokens.toString().padStart(5)} t  (${r.projectContextChars} c)`);
    console.log(`  finance_facts     ${r.financialFactsTokens.toString().padStart(5)} t  (${r.financialFactsChars} c)`);
    console.log(`  kb                ${r.kbTokens.toString().padStart(5)} t  (${r.kbChars} c)`);
    console.log(`  transcript        ${estimateTokens(LONG_FINANCE_TRANSCRIPT.repeat(20).slice(0, r.transcriptChars)).toString().padStart(5)} t  (${r.transcriptChars} c)`);
    console.log(`  manual            ${r.manualTokens.toString().padStart(5)} t  (${r.manualChars} c)`);
    console.log(`  task_list         ${r.taskListTokens.toString().padStart(5)} t`);
    console.log(`  ────────────────────────────────`);
    console.log(`  TOTAL             ${r.totalTokens.toString().padStart(5)} t  (${r.totalChars} c)`);
    if (r.warnings.length > 0) {
      console.log(`  ⚠ warnings: ${r.warnings.join(' | ')}`);
    }
  }

  // SLOs from promptBudget.ts: soft=8K, hard=12K, per-segment=4K.
  const hardBreach = reports.find((r) => r.totalTokens > 12_000);
  const softBreach = reports.find((r) => r.totalTokens > 8_000);
  console.log('\n── Verdict ──');
  console.log(`  soft budget breached: ${softBreach ? 'YES (' + softBreach.name + ')' : 'NO'}`);
  console.log(`  hard budget breached: ${hardBreach ? 'YES (' + hardBreach.name + ')' : 'NO'}`);

  // Cleanup
  await prisma.uploadedFile.deleteMany({ where: { id: fileRow.id } });
  await restoreOthers(isolation);
  await cleanup();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[token-audit] fatal:', err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
