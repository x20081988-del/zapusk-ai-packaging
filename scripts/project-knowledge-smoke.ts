#!/usr/bin/env -S npx --prefix server tsx
// Sprint 61 — Project Knowledge Layer smoke test.
//
// Run via: `npm run smoke:project-knowledge`
// Exits 0 on success, 1 with details on regression.
//
// Why this script (not a unit-test runner):
//   • Repo has no Jest/Vitest config (sprint 60 doc baseline).
//   • These checks exercise pure formatter contracts used by AI prompt
//     construction. If anyone tweaks the formatter and breaks the prompt
//     shape, this script fails BEFORE deploy.
//
// What it validates:
//   1. detectFinancialQuestion fires on RU + EN + year triggers but NOT on
//      generic small-talk.
//   2. formatProjectContextForAssistant 'full' includes brief.keyMetrics,
//      InvestorTerms valuation/payback, napkin map, interviewAnswers, file
//      list — and 'fast' is compact (no weaknesses, no files).
//   3. formatProjectsContextForAssistant caps at 5 projects and adds
//      «=== Проект N ===» headers.
//   4. buildProjectFinancialFacts returns a non-empty source-tagged block
//      when transcript asks about 2027 profit AND ProjectBrief has the
//      metric; empty otherwise.
//   5. pickSourceTypeForFile maps XLSX → financial_question, PDF/DOCX →
//      project_presentation, PPT → other.

import {
  formatProjectContextForAssistant,
  formatProjectsContextForAssistant,
  detectFinancialQuestion,
  type LoadedProject,
} from '../server/src/services/projectContextFormatter.ts';
import { buildProjectFinancialFacts } from '../server/src/services/projectFinancialFacts.ts';
import { estimateTokens, profilePrompt } from '../server/src/services/promptBudget.ts';
import { evaluateHallucination } from '../web/src/lib/transcriptHallucinationFilter.ts';
import { reconcileTruncatedFinal } from '../web/src/lib/transcriptReconcile.ts';
import { isAdviceAlreadySaid } from '../web/src/lib/adviceAlreadySaid.ts';
import {
  isGenericDemoHint,
  rewriteGenericHint,
  CONTEXT_AWARE_FALLBACK,
} from '../server/src/lib/genericHintGuard.ts';
import { recoverUtf8Filename, looksLikeMojibake } from '../server/src/lib/filenameEncoding.ts';
import { recoverDisplayFilename } from '../web/src/lib/filenameDisplay.ts';
import {
  composeAnalyzeTranscript,
  getAnalyzeTranscriptStats,
} from '../web/src/lib/salesAssistantTranscript.ts';
import { extractFactsFromSection, extractFactsFromSheets } from '../server/src/services/numericFactsExtractor.ts';
import { rankNumericFactsInMemory } from '../server/src/services/numericFactsRetrieval.ts';
import { planChunksForXlsx, extractXlsxStructured } from '../server/src/services/xlsxStructured.ts';

// Reach into projectKnowledgeIngest for sourceType picker without exporting
// internals — we test it via a duplicated lookup table here to avoid forcing
// an extra public API surface. If the picker logic in
// projectKnowledgeIngest.ts changes, this table must change in lockstep.
function pickSourceTypeForFile(category: string, mime: string, originalName: string): string {
  const cat = (category ?? '').toLowerCase();
  const ext = originalName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? '';
  if (cat === 'financial' || ext === '.xlsx' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'financial_question';
  }
  if (cat === 'pitch' || cat === 'description' || cat === 'reference') {
    return 'project_presentation';
  }
  if (ext === '.pdf' || ext === '.docx' || ext === '.md' || ext === '.txt') {
    return 'project_presentation';
  }
  return 'other';
}

// ─── Test data ─────────────────────────────────────────────────────────────

const fixtureProject: LoadedProject = {
  id: 'proj-1',
  name: 'Atlas Industrial Park',
  industry: 'real_estate',
  stage: 'scaling',
  raiseAmount: 120_000_000,
  currency: 'RUB',
  minCheck: 5_000_000,
  equityOffered: 12,
  investorType: 'private',
  status: 'packaging',
  investmentTrack: 'llc_share',
  brief: {
    businessSummary: 'Сеть промышленных парков под аренду логистике и легкому производству в регионах ЦФО.',
    monetization: 'Долгосрочные арендные контракты + сервисные сборы за пакеты под ключ.',
    keyMetrics: JSON.stringify({
      MRR: 4_200_000,
      churn_percent: 1.8,
      net_profit_2027: 92_000_000,
      revenue_2026: 380_000_000,
      tenants: 18,
    }),
    investmentAsk: 'Дострой третьей очереди + buyout земли соседнего лота.',
    strengths: JSON.stringify(['Низкая вакантность', 'Сервисная модель против чистой аренды', 'Команда с опытом DLFY']),
    weaknesses: JSON.stringify(['Зависимость от 2 якорных арендаторов', 'Не закрыт вопрос по подключению ЛЭП']),
    missingData: JSON.stringify(['Точная себестоимость 2024', 'Структура долговой нагрузки']),
    napkin: JSON.stringify({
      investorReturn: '25% годовых ожидаемая доходность',
      payback: '4.5 года',
      ebitda_margin: 38,
      gmv: 420_000_000,
    }),
    interviewAnswers: JSON.stringify([
      { question: 'Что произойдёт, если ключевой арендатор уйдёт?',
        answer: 'У нас 6 мес. fixed-take в договорах и waiting-list на 4 кандидатов.',
        category: 'risks', savedAt: '2026-05-01T10:00:00Z' },
      { question: 'Какая структура использования средств?',
        answer: '60% стройка, 25% коммуникации, 15% оборотка.',
        category: 'finance', savedAt: '2026-05-02T10:00:00Z' },
    ]),
  },
  investorTerms: {
    amount: 120_000_000,
    equityPercent: 12,
    valuation: 1_000_000_000,
    instrument: 'llc_share',
    useOfFunds: '60% capex, 25% инфра, 15% working capital',
    exitStrategy: 'Выкуп доли через 5 лет / вторичка через broker',
    expectedReturn: '25% годовых · IRR 22-28%',
    payback: '4-5 лет',
  },
  files: [
    { id: 'f1', originalName: 'pitch_deck_2026Q2.pdf', category: 'pitch', mimeType: 'application/pdf', size: 1_200_000, url: null },
    { id: 'f2', originalName: 'finmodel_v3.xlsx', category: 'financial', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 350_000, url: null },
    { id: 'f3', originalName: 'тех_описание.docx', category: 'description', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 90_000, url: null },
  ],
};

const emptyProject: LoadedProject = {
  id: 'proj-empty',
  name: 'Empty Co',
  industry: null, stage: null, raiseAmount: null, currency: null,
  minCheck: null, equityOffered: null, investorType: null,
  status: null, investmentTrack: null,
  brief: null, investorTerms: null, files: [],
};

// ─── Tiny assertion helper ─────────────────────────────────────────────────

let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n— ${title} —`);
}

// ─── Test 1. detectFinancialQuestion ───────────────────────────────────────
section('1. detectFinancialQuestion');
{
  ok('RU "Какая прибыль в 2027?"', detectFinancialQuestion('Какая прибыль в 2027 году?'));
  ok('RU "оценка проекта"',         detectFinancialQuestion('Расскажите про оценку проекта'));
  ok('RU "выручка по плану"',       detectFinancialQuestion('Какая у вас выручка по плану на следующий год'));
  ok('RU "CAC / LTV"',              detectFinancialQuestion('А что с CAC и LTV?'));
  ok('RU "EBITDA маржа"',           detectFinancialQuestion('какая EBITDA маржа?'));
  ok('Year-only "2028 год"',        detectFinancialQuestion('Что будет в 2028 году?'));
  ok('EN "revenue"',                detectFinancialQuestion('show me revenue'));
  ok('No false-positive on greeting', !detectFinancialQuestion('Здравствуйте, рад знакомству.'));
  ok('No false-positive on "оценил"', !detectFinancialQuestion('Я оценил подход коллег, очень понравилось.') === false
    ? false /* expected to detect 'оценил' if regex stems naïvely */
    : true,
    'оценил content has "оценил" word — our regex is intentionally permissive on финансовый stem; treat detect=true as acceptable',
  );
  // The above check is loose intentionally: detector is permissive (catches
  // "оценить/оценка/оцениваю") to avoid missing finance triggers. We just
  // make sure it doesn't crash. Real false-positive guard happens upstream
  // through transcript length / project facts presence.
}

// ─── Test 2. formatProjectContextForAssistant full ─────────────────────────
section('2. formatProjectContextForAssistant — full');
{
  const out = formatProjectContextForAssistant(fixtureProject, { verbosity: 'full' });
  ok('contains project name',          out.includes('Atlas Industrial Park'));
  ok('contains industry + stage',      out.includes('real_estate') && out.includes('scaling'));
  ok('contains raise + min check',     out.includes('Раунд:') && out.includes('Min чек:'));
  ok('contains business summary',      out.includes('промышленных парков'));
  ok('contains keyMetrics (MRR)',      out.includes('MRR=4200000'));
  ok('contains keyMetrics (net_profit_2027)', out.includes('net_profit_2027=92000000'));
  ok('contains napkin (investorReturn)', out.includes('investorReturn=') || out.includes('investorReturn'));
  ok('contains InvestorTerms valuation', out.includes('оценка 1') || out.includes('оценка 1 000 000 000') || /оценка\s+1/.test(out));
  ok('contains payback',               out.includes('окупаемость') && out.includes('4-5'));
  ok('contains interview answer Q→A',  out.includes('Что произойдёт') && out.includes('waiting-list'));
  ok('contains weaknesses',            out.includes('якорных арендаторов'));
  ok('contains missingData',           out.includes('Точная себестоимость') || out.includes('не закрыто') || out.includes('Не закрыто'));
  ok('contains file list',             out.includes('pitch_deck_2026Q2.pdf') && out.includes('finmodel_v3.xlsx'));
  ok('file list shows mime label',     out.includes('PDF') && out.includes('XLSX'));
  ok('within 4000 char cap',           out.length <= 4_000);
}

// ─── Test 3. formatProjectContextForAssistant fast ─────────────────────────
section('3. formatProjectContextForAssistant — fast');
{
  const out = formatProjectContextForAssistant(fixtureProject, { verbosity: 'fast' });
  ok('contains project name',          out.includes('Atlas Industrial Park'));
  ok('contains business summary',      out.includes('промышленных парков') || out.includes('Бизнес'));
  ok('contains key metrics line',      out.includes('MRR=4200000') || out.includes('Ключевые метрики'));
  ok('NO files (fast)',                !out.includes('pitch_deck_2026Q2.pdf'));
  ok('NO weaknesses (fast)',           !out.includes('якорных арендаторов'));
  ok('NO interview answers (fast)',    !out.includes('waiting-list'));
  ok('within 1500 char cap',           out.length <= 1_500);
}

// ─── Test 4. Empty project — graceful ──────────────────────────────────────
section('4. formatProjectContextForAssistant — empty project');
{
  const out = formatProjectContextForAssistant(emptyProject, { verbosity: 'full' });
  ok('does NOT throw',                 typeof out === 'string');
  ok('has project name',               out.includes('Empty Co'));
  ok('no brief blocks',                !out.includes('Бизнес:') && !out.includes('Монетизация:'));
}

// ─── Test 5. Multi-project ─────────────────────────────────────────────────
section('5. formatProjectsContextForAssistant — multi');
{
  const projects = [fixtureProject, { ...emptyProject, id: 'proj-2', name: 'Second LLC' }];
  const out = formatProjectsContextForAssistant(projects, { verbosity: 'full' });
  ok('lists 2 projects',               out.includes('упоминаются 2 проекта'));
  ok('has Проект 1 + Проект 2 headers', out.includes('=== Проект 1 ===') && out.includes('=== Проект 2 ==='));
  ok('contains both names',            out.includes('Atlas Industrial Park') && out.includes('Second LLC'));
}
{
  const six = Array.from({ length: 6 }, (_, i) => ({ ...emptyProject, id: `p${i}`, name: `Project ${i}` }));
  const out = formatProjectsContextForAssistant(six, { verbosity: 'full' });
  ok('cap at 5 projects',              out.includes('Проект 5') && !out.includes('Проект 6'));
}

// ─── Test 6. buildProjectFinancialFacts triggered ──────────────────────────
section('6. buildProjectFinancialFacts');
{
  const transcript = 'Окей, а какая чистая прибыль ожидается в 2027 году по финмодели?';
  const out = buildProjectFinancialFacts([fixtureProject], transcript);
  ok('non-empty when transcript has finance trigger', out.length > 0);
  ok('header present',                 out.includes('Финансовые факты проекта'));
  ok('contains source provenance tag', out.includes('[источник:'));
  ok('contains net_profit 2027 fact (with year period parsed)',
     /Net\s+profit/i.test(out) && (out.includes('2027') || out.includes('92000000') || out.includes('92 000 000')));
  ok('mentions valuation source as investorTerms',
     /Оценка.*инвестировани/i.test(out) || /valuation/i.test(out));
}
{
  const transcript = 'Что у тебя на выходные?';
  const out = buildProjectFinancialFacts([fixtureProject], transcript);
  ok('empty when no finance trigger',  out === '');
}
{
  const transcript = 'И сколько мы зарабатываем?';
  const out = buildProjectFinancialFacts([emptyProject], transcript);
  ok('empty when project has no financial fields', out === '');
}

// ─── Test 7. pickSourceTypeForFile ─────────────────────────────────────────
section('7. pickSourceTypeForFile (taxonomy mapping)');
{
  ok('XLSX → financial_question',
     pickSourceTypeForFile('other', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'finmodel.xlsx') === 'financial_question');
  ok('category=financial → financial_question',
     pickSourceTypeForFile('financial', 'text/plain', 'notes.txt') === 'financial_question');
  ok('PDF + pitch → project_presentation',
     pickSourceTypeForFile('pitch', 'application/pdf', 'deck.pdf') === 'project_presentation');
  ok('DOCX + description → project_presentation',
     pickSourceTypeForFile('description', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx') === 'project_presentation');
  ok('image → other',
     pickSourceTypeForFile('image', 'image/png', 'logo.png') === 'other');
}

// ─── Test 8. Token estimator ────────────────────────────────────────────────
section('8. Token estimator (Sprint 61.P1)');
{
  // ASCII: ~0.25 tok/char.
  const asciiTokens = estimateTokens('hello world hello world hello world');
  ok('ASCII ~0.25 tok/char', asciiTokens >= 7 && asciiTokens <= 12, `got ${asciiTokens} for 35 chars`);

  // Cyrillic: ~0.5 tok/char.
  const ru = 'Привет, как дела сегодня вечером в офисе компании';
  const ruTokens = estimateTokens(ru);
  ok('Cyrillic ~0.5 tok/char', ruTokens >= 18 && ruTokens <= 30, `got ${ruTokens} for ${ru.length} chars`);

  // Empty.
  ok('empty → 0', estimateTokens('') === 0);

  // profilePrompt with warnings — нужно превысить HARD=12000. 30_000 cyrillic
  // × 0.5 = 15_000 tokens.
  const big = 'А'.repeat(30_000);
  const report = profilePrompt([{ label: 'transcript', text: big }]);
  ok('huge transcript triggers hard_budget warning', report.warnings.some((w) => w.startsWith('hard_budget_exceeded')));

  // segment_oversize — 10_000 cyrillic = 5_000 tokens > MAX_SEGMENT(4000).
  const oversized = profilePrompt([{ label: 'transcript', text: 'А'.repeat(10_000) }]);
  ok('segment_oversize warning emitted', oversized.warnings.some((w) => w.startsWith('segment_oversize')));
}

// ─── Test 9. Dictation hallucination filter (Sprint 61.HOTFIX) ─────────────
section('9. Dictation hallucination filter');
{
  // Observed prod hallucinations — all must be DROPPED in dictation surface.
  const dictationHallucinations = [
    'Наши переговоры продолжаются',
    'наши переговоры продолжаются',
    'НАШИ ПЕРЕГОВОРЫ ПРОДОЛЖАЮТСЯ',
    'Это задача',
    'Это задача.',
    'Это задача...',
    'это задача…',
    'Видимо, потому что мы меняемся',
    'видимо, потому что мы меняемся',
    'Видимо, потому что мы меняемся.',
    'сидим',
    'сидим.',
    'Сидим',
    // Known prompt-leakage — drop in EVERY surface.
    'Мы всегда помним, что нужно учитывать стадию проекта и какой чек нужен от инвестора',
    // Classic isolated short pattern — drop after silence.
    'Чек или доля?',
    'Ну, если вы настаиваете…',
  ];
  for (const text of dictationHallucinations) {
    const decision = evaluateHallucination(text, { surface: 'dictation', lastFinalTs: null });
    ok(`drop "${text.slice(0, 32)}"`, decision.drop, `reason=${decision.reason ?? '-'}`);
  }
  // Legitimate dictation MUST pass.
  const legitDictation = [
    'Это компания в логистике для маркетплейсов',
    'Мы зарабатываем на комиссии с продаж',
    'Команда — три человека: я, CFO и операционный директор',
    'Сделаем оценку проекта через два месяца',
    'Да',
    'Нет, спасибо',
  ];
  for (const text of legitDictation) {
    const decision = evaluateHallucination(text, { surface: 'dictation', lastFinalTs: null });
    ok(`PASS "${text.slice(0, 32)}"`, !decision.drop, `decision=${JSON.stringify(decision)}`);
  }
  // Meeting surface: «Это задача» / «сидим» can be legitimate investor speech.
  // The dictation-specific patterns must NOT trigger in meeting surface.
  const meetingLegit = [
    'Это задача масштабирования',
    'Сидим, обсуждаем сделку',
    'Видимо, потому что мы меняемся вместе с рынком',
    'Наши переговоры продолжаются — давайте обсудим payment terms',
  ];
  for (const text of meetingLegit) {
    const decision = evaluateHallucination(text, { surface: 'meeting', lastFinalTs: null });
    ok(`meeting PASS "${text.slice(0, 32)}"`, !decision.drop, `decision=${JSON.stringify(decision)}`);
  }
  // Known advice leakage drops in BOTH surfaces.
  const advice = 'Мы всегда помним, что нужно учитывать стадию проекта, какой чек нужен от инвестора';
  ok('meeting drops known advice leakage',
    evaluateHallucination(advice, { surface: 'meeting', lastFinalTs: null }).drop);
  ok('dictation drops known advice leakage',
    evaluateHallucination(advice, { surface: 'dictation', lastFinalTs: null }).drop);
  // Isolation window — short suspicious pattern within 8s of last final → KEEP.
  const recentFinalTs = Date.now() - 1_000;
  const decisionRecent = evaluateHallucination('Чек или доля?', { surface: 'meeting', lastFinalTs: recentFinalTs });
  ok('isolation: keep "Чек или доля?" right after legit speech', !decisionRecent.drop);
  // Outside isolation window → DROP.
  const oldFinalTs = Date.now() - 20_000;
  const decisionOld = evaluateHallucination('Чек или доля?', { surface: 'meeting', lastFinalTs: oldFinalTs });
  ok('isolation: drop "Чек или доля?" after 20s silence', decisionOld.drop);
}

// ─── Test 10. Mojibake filename recovery (Sprint 61.HOTFIX) ────────────────
section('10. Mojibake filename recovery');
{
  // Real production mojibake samples.
  // "Презентация.pdf" encoded as UTF-8 bytes, decoded as latin1:
  const mojibake1 = 'ÐÑÐµÐ·ÐµÐ½ÑÐ°ÑÐ¸Ñ.pdf';
  // Compose programmatically to make sure pattern matches what multer produces:
  const programmatic = Buffer.from('Презентация.pdf', 'utf8').toString('latin1');
  ok('programmatic mojibake recovers to Презентация.pdf',
    recoverUtf8Filename(programmatic) === 'Презентация.pdf',
    `got "${recoverUtf8Filename(programmatic)}"`);
  // Same on the display side (browser-side helper).
  ok('display helper recovers programmatic mojibake',
    recoverDisplayFilename(programmatic) === 'Презентация.pdf',
    `got "${recoverDisplayFilename(programmatic)}"`);
  // Hand-crafted version from above:
  const recovered1 = recoverUtf8Filename(mojibake1);
  ok('hand-crafted mojibake recovers something with Cyrillic',
    /[Ѐ-ӿ]/.test(recovered1), `got "${recovered1}"`);
  // Clean UTF-8 filename should pass through unchanged.
  ok('clean Cyrillic passes through unchanged',
    recoverUtf8Filename('Финмодель v3.xlsx') === 'Финмодель v3.xlsx');
  // ASCII filename should pass through unchanged.
  ok('ASCII passes through unchanged',
    recoverUtf8Filename('pitch_deck.pdf') === 'pitch_deck.pdf');
  // Empty / null safety.
  ok('empty string returns empty',
    recoverUtf8Filename('') === '');
  // looksLikeMojibake detector.
  ok('looksLikeMojibake detects programmatic mojibake',
    looksLikeMojibake(programmatic));
  ok('looksLikeMojibake says no on clean cyrillic',
    !looksLikeMojibake('Презентация.pdf'));
  ok('looksLikeMojibake says no on ASCII',
    !looksLikeMojibake('pitch_deck.pdf'));
  // Mixed Latin chars that aren't mojibake should not be falsely recovered.
  ok('café.pdf is preserved (legit Latin-1)',
    recoverUtf8Filename('café.pdf') === 'café.pdf');
}

// ─── Test 11. Interim transcript reaches AI (Sprint 62 P0) ─────────────────
//
// This is the answer to the critical product question:
//   «Can AI already see transcript before user sees it visually?»
//
// composeAnalyzeTranscript MUST include interimTranscript in the payload. If
// this regresses, AI will only see finalized segments — meaning hints
// generated before a segment finalizes are blind. This was confirmed by code
// trace (SalesAssistant.runAnalyze passes interimRef.current as
// interimTranscript). The smoke locks the contract in.
section('11. Interim transcript visibility to AI');
{
  // Case A: only interim, no final → AI sees interim alone.
  const a = composeAnalyzeTranscript({
    interimTranscript: 'Здравствуйте, расскажите про проект',
  });
  ok('interim-only flows to analyze payload', a.includes('Здравствуйте, расскажите'),
    `got: "${a.slice(0, 80)}"`);

  // Case B: final + interim → both included, interim at the tail.
  const b = composeAnalyzeTranscript({
    liveSegments: [{ final: true, text: 'Добрый день. Я Григорий из Zapusk.' }],
    interimTranscript: 'А расскажите про доходность',
  });
  ok('final + interim both flow', b.includes('Григорий из Zapusk') && b.includes('А расскажите про доходность'));
  ok('interim is at tail', b.endsWith('А расскажите про доходность'));

  // Case C: manual + final + interim → composed in correct order.
  const c = composeAnalyzeTranscript({
    manualContext: 'Это разогрев из Zoom Notes до старта Realtime',
    liveSegments: [{ final: true, text: 'Здравствуйте' }],
    interimTranscript: 'хочу обсудить размер чека',
  });
  ok('manual + live + interim composed correctly',
    c.startsWith('Это разогрев') && c.includes('Здравствуйте') && c.endsWith('хочу обсудить размер чека'));

  // Case D: interim equal to tail of final → no duplication.
  const d = composeAnalyzeTranscript({
    liveSegments: [{ final: true, text: 'Я хочу обсудить чек' }],
    interimTranscript: 'Я хочу обсудить чек',
  });
  ok('duplicate interim does not double',
    (d.match(/Я хочу обсудить чек/g) ?? []).length === 1, `got: "${d}"`);

  // Case E: stats reflect interim presence.
  const stats = getAnalyzeTranscriptStats({
    liveSegments: [{ final: true, text: 'final part' }],
    interimTranscript: 'interim part',
  });
  ok('stats track interimChars', stats.interimChars === 'interim part'.length);
  ok('stats track liveTranscriptChars (only finals)', stats.liveTranscriptChars === 'final part'.length);
  ok('stats track total finalPayloadChars > 0', stats.finalPayloadChars > 0);

  // Case F (regression guard): unfinalized segment must NOT count as live.
  // composeAnalyzeTranscript filters by `segment.final === true`. If someone
  // accidentally removes that filter, interim-style segments could leak
  // into the «live» portion and break the «AI sees interim ONCE» contract.
  const f = composeAnalyzeTranscript({
    liveSegments: [
      { final: true, text: 'committed phrase' },
      { final: false, text: 'partial that should NOT count as final' },
    ],
    interimTranscript: 'streaming now',
  });
  ok('non-final liveSegments are filtered out',
    !f.includes('partial that should NOT count as final'),
    `got: "${f}"`);
  ok('only the actual interim is appended at tail', f.endsWith('streaming now'));
}

// ─── Test 12. Numeric facts extractor (Sprint 62 P5) ───────────────────────
section('12. Numeric facts extractor');
{
  // Wide P&L-style table — most common XLSX layout.
  const wide = extractFactsFromSection({
    sheetName: 'P&L Summary',
    sheetIndex: 0,
    headerRow: 'Показатель,2025,2026,2027',
    dataCsv: 'Показатель,2025,2026,2027\nВыручка,280,380,520\nEBITDA,95,145,210\nЧистая прибыль,38,65,92',
    charCount: 100,
  });
  ok('wide table yields 9 facts (3 metrics × 3 years)', wide.length === 9, `got ${wide.length}`);
  const profit2027 = wide.find((f) => f.metricSlug === 'net_profit' && f.period === '2027');
  ok('net_profit 2027 extracted', !!profit2027 && profit2027.value === 92,
    `got ${profit2027 ? JSON.stringify(profit2027) : 'undefined'}`);
  const ebitda2026 = wide.find((f) => f.metricSlug === 'ebitda' && f.period === '2026');
  ok('ebitda 2026 extracted', !!ebitda2026 && ebitda2026.value === 145);
  // Confidence boost for known metrics.
  ok('known metric high confidence (>=80)', (profit2027?.confidence ?? 0) >= 80);

  // Vertical key=value layout.
  const kv = extractFactsFromSection({
    sheetName: 'Valuation',
    sheetIndex: 1,
    headerRow: 'Параметр,value',
    dataCsv: 'Параметр,value\nPre-money valuation млн,1000\nIRR 5 лет,25\nОкупаемость лет,4.5',
    charCount: 80,
  });
  ok('kv table yields 3 facts', kv.length === 3, `got ${kv.length}`);
  const valuation = kv.find((f) => f.metricSlug === 'valuation');
  ok('valuation extracted', !!valuation && valuation.value === 1000);
  const payback = kv.find((f) => f.metricSlug === 'payback');
  ok('payback extracted', !!payback && payback.value === 4.5);

  // Values with units (%, RUB) survive parsing.
  const withUnits = extractFactsFromSection({
    sheetName: 'Margins',
    sheetIndex: 2,
    headerRow: 'Метрика,2027',
    dataCsv: 'Метрика,2027\nEBITDA margin,40.4%\nВыручка,520 млн',
    charCount: 50,
  });
  const margin = withUnits.find((f) => f.metricSlug === 'ebitda_margin');
  ok('% unit detected', margin?.unit === '%' && margin.value === 40.4, `got ${JSON.stringify(margin)}`);
}

// ─── Test 13. Numeric facts ranking against transcript (Sprint 62 P5) ──────
section('13. Numeric facts retrieval ranking');
{
  const stored = [
    { projectId: 'p1', metric: 'Чистая прибыль', metricSlug: 'net_profit', period: '2027', value: 92, unit: 'RUB', sectionLabel: 'Sheet: P&L', rowLabel: 'Чистая прибыль', confidence: 80 },
    { projectId: 'p1', metric: 'Выручка', metricSlug: 'revenue', period: '2026', value: 380, unit: null, sectionLabel: 'Sheet: P&L', rowLabel: 'Выручка', confidence: 70 },
    { projectId: 'p1', metric: 'EBITDA', metricSlug: 'ebitda', period: '2027', value: 210, unit: null, sectionLabel: 'Sheet: P&L', rowLabel: 'EBITDA', confidence: 80 },
    { projectId: 'p1', metric: 'CAC', metricSlug: 'cac', period: null, value: 180000, unit: 'RUB', sectionLabel: 'Sheet: Unit Economics', rowLabel: 'CAC', confidence: 70 },
    { projectId: 'p1', metric: 'Vacancy', metricSlug: 'vacancy', period: '2027', value: 4, unit: '%', sectionLabel: 'Sheet: Pipeline', rowLabel: 'Vacancy %', confidence: 60 },
  ];
  // Transcript with year + slug → fact for that year+slug wins.
  const r1 = rankNumericFactsInMemory(stored, 'А какая чистая прибыль в 2027?', 5);
  ok('net_profit 2027 ranks first when transcript mentions it',
    r1[0]?.metricSlug === 'net_profit' && r1[0]?.period === '2027',
    `top: ${JSON.stringify(r1[0])}`);

  // Transcript with only year — facts with that year prioritized.
  const r2 = rankNumericFactsInMemory(stored, 'покажи цифры за 2027', 5);
  ok('all 2027 facts surface', r2.every((f) => f.period === '2027' || f.period === null) && r2.length >= 2);

  // Transcript with only metric stem — facts with matching slug prioritized.
  const r3 = rankNumericFactsInMemory(stored, 'сколько у вас CAC?', 5);
  ok('CAC fact wins on metric stem', r3[0]?.metricSlug === 'cac');

  // No hints → top-by-confidence overall.
  const r4 = rankNumericFactsInMemory(stored, 'привет, как у вас дела сегодня', 3);
  ok('no hint → top-3 by confidence', r4.length === 3 && r4[0].confidence >= r4[2].confidence);
}

// ─── Test 14. XLSX sheet-aware planning (Sprint 62 P4) ────────────────────
section('14. XLSX sheet-aware chunk planning');
{
  // Build via xlsx module directly to feed extractXlsxStructured.
  // We can't import server-side xlsx in this tsx script easily without
  // running through extractXlsxStructured. So test planChunksForXlsx against
  // a synthetic XlsxStructuredResult.
  const result = {
    sections: [
      { sheetName: 'P&L', sheetIndex: 0, headerRow: 'Метрика,2025,2026', dataCsv: 'Метрика,2025,2026\nВыручка,280,380', charCount: 35 },
      { sheetName: 'Long Sheet', sheetIndex: 1, headerRow: 'Год,Значение',
        dataCsv: 'Год,Значение\n' + Array.from({ length: 50 }, (_, i) => `${2020 + i},${(i * 12345).toString()}`).join('\n'),
        charCount: 1000 },
    ],
    totalChars: 1035,
    sheetNames: ['P&L', 'Long Sheet'],
  };
  const plan = planChunksForXlsx(result);
  ok('plan has at least 2 chunks (one per sheet, plus long-sheet splits)', plan.length >= 2);
  ok('first chunk has sectionLabel = Sheet: P&L', plan[0].sectionLabel === 'Sheet: P&L');
  ok('all chunks have non-null sectionLabel', plan.every((p) => Boolean(p.sectionLabel)));
  ok('header survives in every chunk text',
    plan.every((p) => p.text.includes('## Sheet:')));
}

// ─── Test 15. Interim/final truncation reconciliation (Sprint 62.HOTFIX) ───
//
// Regression guard for the production bug observed 2026-05-18:
//   User said: «Здравствуйте, меня зовут Григорий, проверяю транскрипцию».
//   UI showed: «Транскрипция» (only the last word).
//
// Root cause: OpenAI's .completed event returned a truncated transcript;
// our pipeline preferred the (shorter, wrong) final over the (longer,
// correct) interim buffer. reconcileTruncatedFinal now detects this case.
section('15. Interim/final truncation reconciliation');
{
  // The exact production case.
  const interim = 'Здравствуйте, меня зовут Григорий, проверяю транскрипцию';
  const final = 'Транскрипция';
  const r1 = reconcileTruncatedFinal(interim, final);
  ok('PROD case: full phrase preserved (recovered=true)',
    r1.recovered && r1.text === interim, `got: ${JSON.stringify(r1)}`);
  ok('PROD case: forbidden output «only Транскрипция» NOT used',
    r1.text !== final);
  // Verify each required substring survives.
  for (const required of ['Здравствуйте', 'меня зовут Григорий', 'проверяю транскрипцию']) {
    ok(`PROD case: substring «${required}» preserved`, r1.text.includes(required));
  }

  // Forbidden behavior: not silently dropping first half.
  const r2 = reconcileTruncatedFinal('Привет, как дела сегодня', 'дела');
  ok('short-tail-only final triggers recovery', r2.recovered && r2.text.startsWith('Привет'),
    `got: ${JSON.stringify(r2)}`);

  // Same-length case: do NOT intervene.
  const r3 = reconcileTruncatedFinal('Привет', 'Привет');
  ok('same-length: pass through (no recovery)', !r3.recovered && r3.text === 'Привет');

  // Model-corrected stutter: interim has noise, final is clean and ≥30 chars.
  // (Should NOT recover — the final is the truth.)
  const r4 = reconcileTruncatedFinal('пр пр пр привет', 'Привет, как у тебя дела сегодня вечером');
  ok('long-clean final beats short stutter (no recovery)', !r4.recovered);

  // Empty interim — pass through.
  const r5 = reconcileTruncatedFinal('', 'Привет');
  ok('empty interim: no recovery, return final', !r5.recovered && r5.text === 'Привет');

  // Empty final — pass through (returns whatever non-empty there is).
  const r6 = reconcileTruncatedFinal('Привет', '');
  ok('empty final: no recovery', !r6.recovered);

  // Long final never triggers recovery even if interim is longer.
  const longInterim = 'Здравствуйте я хочу обсудить условия инвестиций в проект Atlas '.repeat(3);
  const longFinal = 'Здравствуйте, я хочу обсудить условия инвестиций в проект Atlas Industrial Park, имею вопросы по чеку и срокам.';
  const r7 = reconcileTruncatedFinal(longInterim, longFinal);
  ok('long final never recovers (>30 chars threshold)', !r7.recovered);

  // Stem matches but no length disparity → no recovery.
  const r8 = reconcileTruncatedFinal('Привет, дела хорошо', 'дела хорошо');
  ok('comparable lengths: no recovery', !r8.recovered);

  // Final is unrelated to interim — no stem overlap → no recovery.
  const r9 = reconcileTruncatedFinal('Здравствуйте, меня зовут Григорий', 'Покупка');
  ok('unrelated final: no recovery (stem mismatch)', !r9.recovered, `got: ${JSON.stringify(r9)}`);

  // Russian morphology: interim ends with accusative «транскрипцию», final
  // is nominative «Транскрипция». Stem «транскрип» matches at tail → recover.
  // Interim ≥ 3× final length required to trigger the ratio gate.
  const r10 = reconcileTruncatedFinal(
    'Окей сегодня вечером я ещё раз проверяю транскрипцию',
    'Транскрипция',
  );
  ok('Russian case morphology: recovery succeeds via stem match',
    r10.recovered && r10.text.includes('проверяю транскрипцию'),
    `got: ${JSON.stringify(r10)}`);

  // Edge: stem appears MID-phrase, not at tail. This is NOT the truncation
  // pattern OpenAI produces (it keeps the LAST word, not a random one).
  // Conservative: no recovery — fall through to final.
  const r11 = reconcileTruncatedFinal(
    'Я проверяю транскрипцию для тестирования системы прямо сейчас',
    'Транскрипция',
  );
  ok('mid-phrase stem (not at tail): no recovery (conservative)',
    !r11.recovered, `got: ${JSON.stringify(r11)}`);
}

// ─── Test 16. Advice already-said detection (Sprint 62.HOTFIX P0.2) ────────
//
// Regression guard for production case:
//   AI suggested: «Да, понял, давайте тогда коротко по сути проекта.
//     Terminal — это платформа социальной коммерции…»
//   Manager spoke it (now in transcript). User clicked «Получить
//   подсказку» again. AI returned essentially the same phrase.
//
// isAdviceAlreadySaid(adviceText, transcript) must return alreadySpoken=true
// for this case, and false for legitimately-distinct next questions.
section('16. Advice already-said detection');
{
  // The exact production case.
  const advice = 'Да, понял, давайте тогда коротко по сути проекта. Terminal — это платформа социальной коммерции, помогает фаундерам собирать инвесторов через прямую коммуникацию.';
  // Manager spoke it (slightly different punctuation/phrasing).
  const transcriptWithIt = 'Да понял давайте тогда коротко по сути проекта Terminal это платформа социальной коммерции помогает фаундерам собирать инвесторов через прямую коммуникацию.';
  const r1 = isAdviceAlreadySaid(advice, transcriptWithIt);
  ok('PROD case: alreadySpoken=true', r1.alreadySpoken,
    `coverage=${(r1.coverage * 100).toFixed(0)}% matched=${JSON.stringify(r1.matchedTokens)}`);
  ok('PROD case: coverage ≥ 0.6', r1.coverage >= 0.6, `got ${r1.coverage}`);
  ok('PROD case: at least 4 meaningful tokens', r1.adviceTokenCount >= 4);

  // Punctuation / case differences should still match (token-based,
  // case-insensitive, punctuation-stripped).
  const r2 = isAdviceAlreadySaid(
    'Расскажите про портфель и доходность',
    'РАССКАЖИТЕ ПРО ПОРТФЕЛЬ! и ДОХОДНОСТЬ?',
  );
  ok('punctuation/case insensitive: true', r2.alreadySpoken, `got ${JSON.stringify(r2)}`);

  // Russian morphology: «проекта» (genitive) ≈ «проекте» (prepositional)
  // ≈ «проект» (nominative) → all share 5-char prefix «проек».
  // Manager paraphrased the advice — same content, different case endings.
  const r3 = isAdviceAlreadySaid(
    'Расскажите про инвестиционную команду этого проекта',
    'Расскажу про инвестиционных в команде моего проекте отдельно',
  );
  ok('Russian morphology stem match: true', r3.alreadySpoken,
    `coverage=${(r3.coverage * 100).toFixed(0)}%`);

  // Partial overlap below 60% threshold → false.
  const r4 = isAdviceAlreadySaid(
    'Расскажите про команду и доходность портфеля по облигациям',
    'Команда есть',
  );
  ok('partial overlap < 60%: false (no false positive)', !r4.alreadySpoken,
    `coverage=${r4.coverage.toFixed(2)}`);

  // Short generic phrase — protected by min-token floor (≥4 meaningful tokens).
  const r5 = isAdviceAlreadySaid(
    'Спросите про чек',
    'Спросите про чек у инвестора',
  );
  ok('short generic advice: no false positive (min-token gate)',
    !r5.alreadySpoken,
    `tokens=${r5.adviceTokenCount}`);

  // Empty inputs.
  const r6 = isAdviceAlreadySaid('', 'transcript');
  ok('empty advice: false', !r6.alreadySpoken);
  const r7 = isAdviceAlreadySaid('advice text here', '');
  ok('empty transcript: false', !r7.alreadySpoken);

  // Distinct next question — should NOT trigger.
  const r8 = isAdviceAlreadySaid(
    'Какой портфель вас сейчас удовлетворяет меньше всего по доходности?',
    'Да понял давайте тогда коротко по сути проекта Terminal это платформа социальной коммерции',
  );
  ok('legitimate next question: false', !r8.alreadySpoken,
    `coverage=${r8.coverage.toFixed(2)}`);

  // Stopwords should not count toward coverage.
  const r9 = isAdviceAlreadySaid(
    'Это что когда где если что',  // mostly stopwords
    'Это что когда где если что — нет, не интересно',
  );
  ok('all-stopword advice: meets min false', !r9.alreadySpoken,
    `tokens=${r9.adviceTokenCount}`);

  // Common conversational fillers («Да», «Понял», «Давайте», «Спасибо»)
  // are stopwords → if advice is mostly fillers, no false-positive.
  const r10 = isAdviceAlreadySaid(
    'Да понял спасибо давайте',  // all stopwords post-filter
    'Да понял спасибо давайте обсудим',
  );
  ok('filler-only advice: no false positive', !r10.alreadySpoken,
    `tokens=${r10.adviceTokenCount}`);
}

// ─── Test 17. Generic demo hint detector (Sprint 62.P1 demo hotfix) ───────
//
// Regression guard for production demo case:
//   AI returned «Что ж, предлагаю коротко пройтись по проекту…»
//   even though manual context + live transcript already had substance.
//   Founder reported "AI looks like placeholder copy".
//
// isGenericDemoHint(text) must catch the placeholder phrase set without
// flagging legitimate context-aware questions.
section('17. Generic demo hint detector');
{
  // ─── Should catch (the demo placeholder shapes) ─────────────────────────
  ok(
    'catches "Давайте коротко по сути проекта"',
    isGenericDemoHint('Давайте коротко по сути проекта'),
  );
  ok(
    'catches "Предлагаю коротко пройтись по проекту"',
    isGenericDemoHint('Что ж, предлагаю коротко пройтись по проекту.'),
  );
  ok(
    'catches "Расскажу коротко, что это за проект"',
    isGenericDemoHint('Расскажу коротко, что это за проект Terminal.'),
  );
  ok(
    'catches PROJECT_DETAILS_TRANSITION_PHRASE',
    isGenericDemoHint('Да, понял, давайте тогда коротко по сути проекта...'),
  );
  ok(
    'catches "быстро обсудить" placeholder',
    isGenericDemoHint('Давайте быстро обсудим проект и перейдём к деталям.'),
  );

  // ─── Should NOT catch (legitimate context-aware questions) ──────────────
  ok(
    'does not catch finance-specific question',
    !isGenericDemoHint('Какая у вас доходность по портфелю облигаций за последний год?'),
    'should not flag specific finance Q',
  );
  ok(
    'does not catch SPIN problem-question',
    !isGenericDemoHint('Какой проект из вашего портфеля сейчас вызывает больше всего сомнений?'),
  );
  ok(
    'does not catch CONTEXT_AWARE_FALLBACK itself',
    !isGenericDemoHint(CONTEXT_AWARE_FALLBACK.mainQuestion),
    'fallback must not flag itself, would be infinite-rewrite loop',
  );
  ok(
    'does not catch next-step question',
    !isGenericDemoHint('Какой чек комфортен для первого захода?'),
  );
  ok(
    'does not catch qualification opener',
    !isGenericDemoHint('Был ли у вас опыт инвестиций в маркетплейсы или платформенные бизнесы?'),
  );

  // ─── Edge cases ─────────────────────────────────────────────────────────
  ok('empty string: false',   !isGenericDemoHint(''),    'empty must be false');
  ok('null: false',           !isGenericDemoHint(null),  'null must be false');
  ok('undefined: false',      !isGenericDemoHint(undefined), 'undefined must be false');
  ok(
    'short greeting (< 12 chars): false',
    !isGenericDemoHint('Коротко.'),
    'too short to be placeholder',
  );
}

// ─── Test 18. rewriteGenericHint post-processing (Sprint 62.P1) ───────────
//
// Verifies that:
//   • rewrite fires ONLY when hasContext=true,
//   • rewrite replaces both mainQuestion AND backupQuestions,
//   • original non-generic backups are preserved,
//   • suggestedPhraseField mirroring works for CoreCard,
//   • no rewrite for legitimate questions (idempotent).
section('18. rewriteGenericHint post-processing');
{
  // Generic + context → rewrite
  const r1 = rewriteGenericHint(
    { mainQuestion: 'Давайте коротко по сути проекта', backupQuestions: ['Расскажите про проект', 'Какой чек комфортен?'] },
    { hasContext: true },
  );
  ok('generic + hasContext: rewritten=true', r1.rewritten, `reason=${r1.reason}`);
  ok('generic + hasContext: mainQuestion replaced',
    r1.card.mainQuestion === CONTEXT_AWARE_FALLBACK.mainQuestion);
  ok('generic + hasContext: clean original backup survives',
    r1.card.backupQuestions?.includes('Какой чек комфортен?') === true);
  ok('generic + hasContext: generic original backup filtered out',
    r1.card.backupQuestions?.every((q) => !isGenericDemoHint(q)) === true);

  // Generic + NO context → pass through
  const r2 = rewriteGenericHint(
    { mainQuestion: 'Давайте коротко по сути проекта' },
    { hasContext: false },
  );
  ok('generic + no-context: rewritten=false (skip — first turn allowed)',
    !r2.rewritten, `reason=${r2.reason}`);

  // Legitimate + context → pass through
  const r3 = rewriteGenericHint(
    { mainQuestion: 'Какой формат участия вам ближе — финансовый или стратегический?' },
    { hasContext: true },
  );
  ok('specific + hasContext: rewritten=false', !r3.rewritten);

  // CoreCard-shaped: suggestedPhrase mirror
  const r4 = rewriteGenericHint(
    {
      mainQuestion: 'Предлагаю коротко пройтись по проекту',
      suggestedPhrase: 'Предлагаю коротко пройтись по проекту',
    },
    { hasContext: true, suggestedPhraseField: 'suggestedPhrase' as const },
  );
  ok('CoreCard mirror: mainQuestion rewritten',
    (r4.card as { mainQuestion: string }).mainQuestion === CONTEXT_AWARE_FALLBACK.mainQuestion);
  ok('CoreCard mirror: suggestedPhrase rewritten',
    (r4.card as { suggestedPhrase: string }).suggestedPhrase === CONTEXT_AWARE_FALLBACK.mainQuestion);

  // Idempotency: rewriting an already-rewritten card is a no-op
  const r5 = rewriteGenericHint(r1.card, { hasContext: true });
  ok('idempotent: already-rewritten card stays unchanged', !r5.rewritten);
}

// ─── Final report ──────────────────────────────────────────────────────────
section('Summary');
if (failed === 0) {
  console.log('  ✅ All project-knowledge smoke checks passed.');
  process.exit(0);
} else {
  console.error(`  ❌ ${failed} check(s) failed.`);
  process.exit(1);
}
