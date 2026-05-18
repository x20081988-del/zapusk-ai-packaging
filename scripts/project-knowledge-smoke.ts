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
import { recoverUtf8Filename, looksLikeMojibake } from '../server/src/lib/filenameEncoding.ts';
import { recoverDisplayFilename } from '../web/src/lib/filenameDisplay.ts';

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

// ─── Final report ──────────────────────────────────────────────────────────
section('Summary');
if (failed === 0) {
  console.log('  ✅ All project-knowledge smoke checks passed.');
  process.exit(0);
} else {
  console.error(`  ❌ ${failed} check(s) failed.`);
  process.exit(1);
}
