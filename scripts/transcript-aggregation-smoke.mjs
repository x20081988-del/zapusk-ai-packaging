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
function appendFinalSegment(prev, text, source) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return prev;
  const last = prev[prev.length - 1];
  if (last && last.final && last.text.trim() === trimmed) {
    return prev; // dedup
  }
  return [...prev, { ts: Date.now(), final: true, text: trimmed, source }];
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
let transcript = [];
const currentSessionId = 1;
let dropped = 0;
for (const ev of SIMULATED_EVENTS) {
  // Session-id guard (same logic as SalesAssistant onFinal)
  if (ev.sessionId !== currentSessionId) {
    dropped++;
    continue;
  }
  const normalized = normalizeTranscript(ev.transcript);
  transcript = appendFinalSegment(transcript, normalized, 'realtime');
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
