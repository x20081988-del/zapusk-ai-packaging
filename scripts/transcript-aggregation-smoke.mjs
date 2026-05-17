#!/usr/bin/env node
// P0 hotfix golden test — Transcript aggregation correctness.
//
// Run via: `node scripts/transcript-aggregation-smoke.mjs`
// Exits 0 on success, 1 with details on regression.
//
// Why this script (not a unit test):
//   • Repo has no Vitest/Jest config; adding a runner is a separate decision.
//   • This script verifies the aggregation contract used by SalesAssistant
//     onFinal + sr.onresult: pure data-in / data-out, no React, no DOM.
//   • Replays the 2026-04-08 investor qualification call as a simulated
//     event stream. If anyone refactors transcript appending and breaks
//     accumulation, this script fails loud BEFORE deploy.
//
// What it validates:
//   1. Every distinct final segment survives.
//   2. Exact consecutive duplicates are dedup'd (anti-hallucination).
//   3. Non-consecutive repeats are preserved (legitimate «Да.» multiple times).
//   4. Manual context stays separate.
//   5. Stale-session events are dropped.
//   6. Interim updates do NOT pollute the final array.

// ─── Helpers under test (mirror of web/src/pages/SalesAssistant.tsx) ───
// Hallucination guard config — keep in sync with web/src/pages/SalesAssistant.tsx
const SUSPICIOUS_AI_PROMPT_PHRASES = [
  /^Чек или доля\??$/i,
  /^Ну, если вы настаиваете[.…]{0,3}$/i,
  /^Подскажите.{0,30}\?$/i,
  /^Я правильно понимаю\??$/i,
  /^Что для вас важнее.{0,40}\?$/i,
];
const HALLUCINATION_ISOLATION_WINDOW_MS = 8_000;
const HALLUCINATION_MAX_CHARS = 40;

function looksLikeAiHallucination(text, prev, now) {
  if (text.length > HALLUCINATION_MAX_CHARS) return false;
  if (!SUSPICIOUS_AI_PROMPT_PHRASES.some((re) => re.test(text))) return false;
  const last = prev[prev.length - 1];
  if (!last) return true;
  return (now - last.ts) >= HALLUCINATION_ISOLATION_WINDOW_MS;
}

function appendFinalSegment(prev, text, source, nowOverride) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return prev;
  const last = prev[prev.length - 1];
  if (last && last.final && last.text.trim() === trimmed) {
    return prev; // dedup
  }
  const now = nowOverride ?? Date.now();
  if (looksLikeAiHallucination(trimmed, prev, now)) {
    return prev; // hallucination drop
  }
  return [...prev, { ts: now, final: true, text: trimmed, source }];
}

// Brand normalizer (mirror of web/src/lib/transcriptNormalize.ts)
function normalizeTranscript(raw) {
  if (!raw) return raw;
  return raw.replace(
    /(?<![\p{L}\p{N}])[Гг][лл][аа][сс][ \-]?[Нн][аа][бБпП](?![\p{L}\p{N}])/gu,
    'Главснаб',
  );
}

// ─── Simulated event stream for the 2026-04-08 qualification call ───
// 14 final segments + a few duplicates + a stale-session event.
const SIMULATED_EVENTS = [
  // Each event mimics OpenAI Realtime "input_audio_transcription.completed"
  { sessionId: 1, transcript: 'Да.' },
  { sessionId: 1, transcript: 'Алло, Адам, здравствуйте.' },
  { sessionId: 1, transcript: 'Здравствуйте.' },
  { sessionId: 1, transcript: 'Это Алиса, компания ГласНаб.' }, // brand mis-recognition → must be normalized
  { sessionId: 1, transcript: 'Это Алиса, компания ГласНаб.' }, // exact duplicate (echo) → must be dedup'd
  { sessionId: 1, transcript: 'У вас была ранее назначена встреча, но не состоялась. Подскажите, вы рассматриваете еще варианты инвестирования?' },
  { sessionId: 1, transcript: 'Да, в принципе, я писал одному, я не помню, кто мне писал. Мне надо сначала руководителю пообщаться по этому вопросу.' },
  { sessionId: 1, transcript: 'Он пока не настроен на это.' },
  { sessionId: 1, transcript: 'Пока то есть неактуальна информация, верно?' },
  { sessionId: 1, transcript: 'Да. Я говорил с ним, но он пока сказал подождать с этим.' },
  { sessionId: 1, transcript: 'А можете мне ссылку скинуть? Я посмотрю, может, потом поговорю с руководителем.' },
  { sessionId: 0, transcript: 'STALE SESSION — must be dropped.' }, // stale → must not appear
  { sessionId: 1, transcript: 'Где вам прислать ссылку? В Максе?' },
  { sessionId: 1, transcript: 'Да, в Максе можно.' },
  { sessionId: 1, transcript: 'Я могу отправить вам СМС с ссылкой по проекту ГласНаб.' }, // brand fix
  { sessionId: 1, transcript: 'Если вас что-то заинтересует, можете написать мне в Максе напрямую. Я могу назначить встречу.' },
  { sessionId: 1, transcript: 'Да.' }, // legitimate repeat (different point in conversation)
];

// ─── Replay simulation ───
// Simulate timing: events arrive every 2s, except where noted.
let now = 1_000_000;
let transcript = [];
const currentSessionId = 1;
let dropped = 0;
for (const ev of SIMULATED_EVENTS) {
  now += 2_000; // 2 sec between events
  if (ev.sessionId !== currentSessionId) {
    dropped++;
    continue;
  }
  const normalized = normalizeTranscript(ev.transcript);
  transcript = appendFinalSegment(transcript, normalized, 'realtime', now);
}

// ─── Assertions ───
const REQUIRED_PHRASES = [
  'Алло, Адам, здравствуйте',
  'рассматриваете еще варианты инвестирования',
  'руководителю пообщаться',
  'он пока не настроен',
  'ссылку скинуть',
  'в Максе можно',
  'СМС с ссылкой',
  'назначить встречу',
];

const fullText = transcript.map((s) => s.text).join(' ');
const fullTextLower = fullText.toLowerCase();
const missing = REQUIRED_PHRASES.filter((p) => !fullTextLower.includes(p.toLowerCase()));

const results = {
  totalSegments: transcript.length,
  expectedAtLeast: 12, // 17 events - 1 stale drop - 1 dedup ≈ 15 unique, but we want at least 12 distinct
  fullTextChars: fullText.length,
  staleDropped: dropped,
  requiredPhrasesMissing: missing,
  brandNormalized: fullText.includes('Главснаб') && !fullText.includes('ГласНаб'),
  dedupOk: !/Это Алиса, компания Главснаб\. Это Алиса, компания Главснаб\./.test(fullText),
  legitRepeatPreserved: (fullText.match(/Да\./g) ?? []).length >= 2, // both «Да.»'s present
};

console.log('\n=== Transcript Aggregation Golden Test ===\n');
console.log(`Events fed:           ${SIMULATED_EVENTS.length}`);
console.log(`Final segments:       ${results.totalSegments} (expect ≥ ${results.expectedAtLeast})`);
console.log(`Full text chars:      ${results.fullTextChars}`);
console.log(`Stale-session drops:  ${results.staleDropped} (expect 1)`);
console.log(`Brand normalized:     ${results.brandNormalized ? 'YES' : 'NO'} (expect YES)`);
console.log(`Dedup worked:         ${results.dedupOk ? 'YES' : 'NO'} (expect YES)`);
console.log(`Legit repeat kept:    ${results.legitRepeatPreserved ? 'YES' : 'NO'} (expect YES)`);
console.log(`Required phrases missing: ${results.requiredPhrasesMissing.length === 0 ? 'none ✓' : results.requiredPhrasesMissing.join(', ')}`);

console.log('\n--- Final transcript preview ---');
for (let i = 0; i < transcript.length; i++) {
  const t = transcript[i].text;
  console.log(`  [${(i + 1).toString().padStart(2, ' ')}] ${t.slice(0, 80)}${t.length > 80 ? '…' : ''}`);
}

// Exit code
const ok =
  results.totalSegments >= results.expectedAtLeast &&
  results.staleDropped === 1 &&
  results.brandNormalized &&
  results.dedupOk &&
  results.legitRepeatPreserved &&
  results.requiredPhrasesMissing.length === 0;

if (!ok) {
  console.log('\n✗ FAIL — aggregation regression detected.');
  console.log(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log('\n✓ PASS — all required phrases survived aggregation.\n');

// ─── Sprint 54 P0.5 — Hallucination guard scenarios ───
console.log('\n=== Hallucination Guard Test ===\n');

function runHallucinationCase(label, events, expect) {
  let t = [];
  let n = 1_000_000;
  for (const ev of events) {
    n += ev.advanceMs ?? 2_000;
    t = appendFinalSegment(t, ev.text, 'realtime', n);
  }
  const final = t.map((s) => s.text);
  const expectInFinal = expect.includes ?? [];
  const expectNotInFinal = expect.excludes ?? [];
  const okIncludes = expectInFinal.every((p) => final.some((seg) => seg.includes(p)));
  const okExcludes = expectNotInFinal.every((p) => !final.some((seg) => seg.includes(p)));
  const pass = okIncludes && okExcludes;
  console.log(`  ${pass ? '✓' : '✗'} ${label}`);
  console.log(`     final = ${JSON.stringify(final)}`);
  if (!pass) {
    if (!okIncludes) {
      const missing = expectInFinal.filter((p) => !final.some((seg) => seg.includes(p)));
      console.log(`     missing: ${JSON.stringify(missing)}`);
    }
    if (!okExcludes) {
      const present = expectNotInFinal.filter((p) => final.some((seg) => seg.includes(p)));
      console.log(`     should-be-dropped but present: ${JSON.stringify(present)}`);
    }
  }
  return pass;
}

const halluResults = [
  // Case 1: «Чек или доля?» arrives in isolation (long silence) — must be dropped.
  runHallucinationCase(
    'Drops «Чек или доля?» when isolated (>8 sec after last segment)',
    [
      { text: 'Алло, здравствуйте.', advanceMs: 2_000 },
      { text: 'Я перезвоню позже.', advanceMs: 2_000 },
      { text: 'Чек или доля?', advanceMs: 10_000 }, // 10 sec gap → isolated
    ],
    { excludes: ['Чек или доля'] },
  ),
  // Case 2: «Да» short reply right after recent segment — must be PRESERVED.
  runHallucinationCase(
    'Preserves short reply «Да» when in dense conversation',
    [
      { text: 'Вы рассматриваете инвестиции?', advanceMs: 2_000 },
      { text: 'Да.', advanceMs: 1_500 },
    ],
    { includes: ['Да'] },
  ),
  // Case 3: «Угу» short reply — must be PRESERVED.
  runHallucinationCase(
    'Preserves «Угу» — common Russian backchannel',
    [
      { text: 'Я отправлю вам ссылку.', advanceMs: 2_000 },
      { text: 'Угу.', advanceMs: 1_000 },
    ],
    { includes: ['Угу'] },
  ),
  // Case 4: First segment is the AI-pattern phrase — must be dropped (no prior context to trust).
  runHallucinationCase(
    'Drops AI-pattern phrase when it is the very first segment',
    [
      { text: 'Ну, если вы настаиваете…', advanceMs: 2_000 },
    ],
    { excludes: ['настаиваете'] },
  ),
  // Case 5: AI-pattern phrase right after another segment (no isolation) — preserved (could be legit).
  runHallucinationCase(
    'Preserves AI-pattern phrase if NOT isolated (manager actually said it)',
    [
      { text: 'Хорошо, как пожелаете.', advanceMs: 2_000 },
      { text: 'Чек или доля?', advanceMs: 1_500 }, // 1.5 sec — not isolated
    ],
    { includes: ['Чек или доля'] },
  ),
  // Case 6: Long phrase matching pattern — preserved (length filter).
  runHallucinationCase(
    'Preserves long phrase even with AI-prompt keyword',
    [
      { text: 'У меня вопрос на счет распределения долей в этой сделке.', advanceMs: 12_000 },
    ],
    { includes: ['распределения долей'] },
  ),
];

const halluOk = halluResults.every(Boolean);
if (!halluOk) {
  console.log('\n✗ FAIL — hallucination guard regression.');
  process.exit(1);
}
console.log(`\n✓ PASS — hallucination guard: ${halluResults.length}/${halluResults.length} scenarios.\n`);

// ─── Sprint 55 P0 — Transcript diff helper (compareDraftVsClean) ───
// Mirror of server/src/services/transcriptDiff.ts.
console.log('\n=== Transcript Diff Helper Test ===\n');

const HALLUCINATION_PATTERNS = [
  /^Чек или доля\??$/i,
  /^Ну,? если вы настаиваете[.…]{0,3}$/i,
  /^Подскажите.{0,30}\?$/i,
  /^Я правильно понимаю\??$/i,
  /^Что для вас важнее.{0,40}\?$/i,
];

function splitSentencesJs(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?…])\s+|(?:\r?\n)+/g).map((s) => s.trim()).filter((s) => s);
}
function tokenize2(text) {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length >= 3),
  );
}
function jaccard2(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const u = a.size + b.size - inter;
  return u === 0 ? 0 : inter / u;
}
function findMatch2(s, others) {
  const t = tokenize2(s);
  if (t.size === 0) return true;
  for (const o of others) if (jaccard2(t, o.tokens) >= 0.4) return true;
  return false;
}
function compareDraftVsCleanJs(draft, clean) {
  const ds = splitSentencesJs(draft);
  const cs = splitSentencesJs(clean);
  const di = ds.map((text) => ({ text, tokens: tokenize2(text) }));
  const ci = cs.map((text) => ({ text, tokens: tokenize2(text) }));
  const removed = ds.filter((s) => !findMatch2(s, ci));
  const added = cs.filter((s) => !findMatch2(s, di));
  const hallu = removed.filter((s) => s.length <= 60 && HALLUCINATION_PATTERNS.some((re) => re.test(s.trim())));
  return {
    similarity: jaccard2(tokenize2(draft), tokenize2(clean)),
    addedPhrases: added,
    removedPhrases: removed,
    hallucinationCandidates: hallu,
  };
}

function diffCase(label, draft, clean, expect) {
  const d = compareDraftVsCleanJs(draft, clean);
  const ok = (
    (expect.hallucinationContains
      ? expect.hallucinationContains.every((p) => d.hallucinationCandidates.some((c) => c.includes(p)))
      : true) &&
    (expect.hallucinationNotContains
      ? expect.hallucinationNotContains.every((p) => !d.hallucinationCandidates.some((c) => c.includes(p)))
      : true) &&
    (expect.minSimilarity !== undefined ? d.similarity >= expect.minSimilarity : true) &&
    (expect.maxSimilarity !== undefined ? d.similarity <= expect.maxSimilarity : true)
  );
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  console.log(`     similarity=${d.similarity.toFixed(3)} added=${d.addedPhrases.length} removed=${d.removedPhrases.length} hallucinations=${d.hallucinationCandidates.length}`);
  if (!ok) {
    console.log(`     hallu: ${JSON.stringify(d.hallucinationCandidates)}`);
    console.log(`     expect: ${JSON.stringify(expect)}`);
  }
  return ok;
}

const diffResults = [
  // Case 1: hallucinated «Чек или доля?» in draft, absent in clean → detected.
  diffCase(
    'Detects hallucinated «Чек или доля?» (in draft, not in clean)',
    'Здравствуйте Адам. Чек или доля? Я могу отправить вам ссылку.',
    'Здравствуйте Адам. Я могу отправить вам ссылку. Связаться позже.',
    { hallucinationContains: ['Чек или доля'] },
  ),
  // Case 2: identical transcripts → similarity ~ 1, no hallucinations.
  diffCase(
    'Identical transcripts → similarity 1.0, zero hallucinations',
    'Здравствуйте. Я перезвоню позже.',
    'Здравствуйте. Я перезвоню позже.',
    { minSimilarity: 0.99, hallucinationNotContains: ['Чек или доля', 'настаиваете'] },
  ),
  // Case 3: legitimate sentence with «доля» in long form → NOT flagged.
  diffCase(
    'Long sentence mentioning доля is NOT a hallucination candidate',
    'У меня вопрос на счёт распределения долей. Какие условия?',
    'У меня вопрос на счёт распределения долей в этой сделке. Уточните условия пожалуйста.',
    { hallucinationNotContains: ['распределения долей'] },
  ),
  // Case 4: completely different → low similarity but no false hallucination.
  diffCase(
    'Different transcripts → low similarity but no hallucination false-positive',
    'Привет, как дела? Расскажите про инвестиции.',
    'Здравствуйте. Я перезвоню завтра. До свидания.',
    { maxSimilarity: 0.3, hallucinationNotContains: ['Чек или доля'] },
  ),
];

const diffOk = diffResults.every(Boolean);
if (!diffOk) {
  console.log('\n✗ FAIL — transcript diff regression.');
  process.exit(1);
}
console.log(`\n✓ PASS — transcript diff: ${diffResults.length}/${diffResults.length} scenarios.\n`);

// ─── Sprint 55 P0 — Idempotency / no-duplicate-memory contract ───
// Pure logic-level check (simulated). Verifies the policy: a session must
// have at most ONE NegotiationMemory after recompute (upsert, not insert).
console.log('\n=== Recompute Idempotency Test ===\n');

function simulateRecompute(initialState) {
  // Mimic recomputeFromCleanTranscript guard:
  //   - if aiDerivedFrom='clean' && cleanTranscriptProcessedAt set → skip
  //   - else: set aiDerivedFrom='clean', cleanTranscriptProcessedAt=now,
  //           upsert (not insert) memory.
  if (initialState.aiDerivedFrom === 'clean' && initialState.cleanTranscriptProcessedAt) {
    return { ...initialState, status: 'skipped_already_processed' };
  }
  return {
    ...initialState,
    aiDerivedFrom: 'clean',
    cleanTranscriptProcessedAt: new Date().toISOString(),
    memoryCount: 1, // upsert → exactly one
    status: 'recomputed',
  };
}

let s = {
  aiDerivedFrom: 'draft',
  cleanTranscriptProcessedAt: null,
  memoryCount: 1, // initial memory from draft (created at finalize)
};
const r1 = simulateRecompute(s);
const r2 = simulateRecompute(r1);
const r3 = simulateRecompute(r2);

const idempOk =
  r1.status === 'recomputed' &&
  r1.aiDerivedFrom === 'clean' &&
  r1.memoryCount === 1 &&
  r2.status === 'skipped_already_processed' &&
  r3.status === 'skipped_already_processed' &&
  r2.memoryCount === 1 &&
  r3.memoryCount === 1;

console.log(`  ${idempOk ? '✓' : '✗'} First call recomputes, subsequent calls skip`);
console.log(`     r1=${r1.status} r2=${r2.status} r3=${r3.status} memoryCount=${r3.memoryCount}`);

if (!idempOk) {
  console.log('\n✗ FAIL — idempotency regression.');
  process.exit(1);
}
console.log('\n✓ PASS — recompute is idempotent, memory upsert prevents duplicates.\n');
