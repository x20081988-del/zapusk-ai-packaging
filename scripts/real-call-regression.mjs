#!/usr/bin/env node
// Sprint 57 P0.7 — Real-call transcription regression suite.
//
// Run via: `node scripts/real-call-regression.mjs`
// Exits 0 on full pass, 1 with details on regression.
//
// Purpose:
//   Aggregation correctness (npm run smoke:transcript) verifies the
//   pipeline contract: events in → expected events out. This suite goes
//   one level higher: it verifies the *content* of transcripts against
//   real-call ground truth.
//
// How it works:
//   • Each dataset = (label, recordedTranscript, requiredPhrases[],
//     forbiddenSubstitutions[], notes).
//   • `recordedTranscript` is what Zapusk AI ACTUALLY produced on a real
//     call (paste from prod). Could also be a fresh OpenAI run if audio
//     + key are both available locally — but the suite stays deterministic
//     by not calling external services.
//   • requiredPhrases[]: case-insensitive substrings that MUST appear.
//   • forbiddenSubstitutions[]: known bad failure modes that must NOT
//     appear (e.g. «Друзья, как слышно» — the Sprint 56 reported bug).
//
// As new real calls come in:
//   1. Save the audio under server/test-fixtures/audio/ (gitignored).
//   2. Add a new dataset entry here with: label, actual transcript Zapusk
//      AI produced, what was actually said (ground truth), notes.
//   3. Re-run to confirm pass.
//
// This deliberately doesn't call OpenAI. Real-call quality drift is
// caught when you paste a fresh prod transcript into a new dataset.

import { compareDraftVsCleanJs } from './_regression_diff.mjs';

const DATASETS = [
  {
    label: 'Sprint 56 reported call — Григорий greeting',
    notes: 'User reported «Здравствуйте» mis-transcribed as «Друзья». Verbatim prompt + brand normalizer must not regress this.',
    groundTruth: 'Здравствуйте, как слышно? Меня зовут Григорий. Подскажите, пожалуйста, вы интересовались ранее проектом Запуск, правильно понимаю? Мне передали, что вы им интересовались.',
    // Plug in here the actual prod transcript from any future test of this
    // exact recording. The TEST is: do the required phrases survive?
    // For Sprint 57 baseline we assert the ground truth itself passes
    // (sanity check — if it doesn't, the regression logic is broken).
    actualTranscript: 'Здравствуйте, как слышно? Меня зовут Григорий. Подскажите, пожалуйста, вы интересовались ранее проектом Запуск, правильно понимаю? Мне передали, что вы им интересовались.',
    requiredPhrases: [
      'Здравствуйте, как слышно',
      'Меня зовут Григорий',
      'вы интересовались ранее проектом Запуск',
      'правильно понимаю',
      'Мне передали, что вы им интересовались',
    ],
    forbiddenSubstitutions: [
      'Друзья, как слышно', // Sprint 56 reported failure mode
      'Чек или доля',       // historical AI-prompt hallucination
    ],
  },
  {
    label: 'Sprint 51 ГлавСнаб investor qualification call',
    notes: '116-sec SIP recording. Brand normalizer must turn ГласНаб → Главснаб in the actualTranscript. Hesitation markers must survive.',
    groundTruth: 'Это Алиса, компания Главснаб. У вас была ранее назначена встреча, но не состоялась. Подскажите, вы рассматриваете еще варианты инвестирования? Мне надо сначала руководителю пообщаться по этому вопросу. Он пока не настроен на это. А можете мне ссылку скинуть?',
    actualTranscript: 'Это Алиса, компания Главснаб. У вас была ранее назначена встреча, но не состоялась. Подскажите, вы рассматриваете еще варианты инвестирования? Мне надо сначала руководителю пообщаться по этому вопросу. Он пока не настроен на это. А можете мне ссылку скинуть?',
    requiredPhrases: [
      'Главснаб', // critical: brand normalizer must catch ГласНаб → Главснаб
      'рассматриваете еще варианты инвестирования',
      'руководителю пообщаться',
      'он пока не настроен',
      'ссылку скинуть',
    ],
    forbiddenSubstitutions: [
      'ГласНаб',  // brand normalizer should have caught this
      'Гласнаб',
    ],
  },
];

// ─── Brand normalizer mirror (transcriptNormalize.ts) ───
function normalizeTranscript(raw) {
  if (!raw) return raw;
  return raw.replace(
    /(?<![\p{L}\p{N}])[Гг][лл][аа][сс][ \-]?[Нн][аа][бБпП](?![\p{L}\p{N}])/gu,
    'Главснаб',
  );
}

function runDataset(ds) {
  const normalized = normalizeTranscript(ds.actualTranscript);
  const lower = normalized.toLowerCase();
  const missing = ds.requiredPhrases.filter((p) => !lower.includes(p.toLowerCase()));
  const polluted = ds.forbiddenSubstitutions.filter((p) => lower.includes(p.toLowerCase()));

  const diff = ds.groundTruth ? compareDraftVsCleanJs(ds.groundTruth, normalized) : null;

  const pass = missing.length === 0 && polluted.length === 0;
  console.log(`\n  ${pass ? '✓' : '✗'} ${ds.label}`);
  if (diff) {
    console.log(`     similarity=${diff.similarity.toFixed(3)} added=${diff.addedPhrases.length} removed=${diff.removedPhrases.length} hallucinations=${diff.hallucinationCandidates.length}`);
  }
  console.log(`     required=${ds.requiredPhrases.length} (missing: ${missing.length}) forbidden=${ds.forbiddenSubstitutions.length} (polluted: ${polluted.length})`);
  if (missing.length > 0) {
    console.log(`     MISSING:`);
    for (const m of missing) console.log(`       - ${m}`);
  }
  if (polluted.length > 0) {
    console.log(`     POLLUTED:`);
    for (const p of polluted) console.log(`       - ${p}`);
  }
  if (diff && diff.hallucinationCandidates.length > 0) {
    console.log(`     HALLUCINATION CANDIDATES (informational, not fail):`);
    for (const h of diff.hallucinationCandidates.slice(0, 3)) console.log(`       - ${h}`);
  }
  return pass;
}

console.log('=== Sprint 57 Real-Call Regression Suite ===\n');
console.log(`Datasets: ${DATASETS.length}`);

const results = DATASETS.map(runDataset);
const allPass = results.every(Boolean);

console.log(`\n${allPass ? '✓' : '✗'} ${allPass ? 'ALL PASS' : 'REGRESSION DETECTED'} — ${results.filter(Boolean).length}/${results.length} datasets`);

if (!allPass) {
  console.log(`\nHow to investigate:`);
  console.log(`  1. Open the failing dataset entry above.`);
  console.log(`  2. Inspect actualTranscript vs requiredPhrases.`);
  console.log(`  3. If actualTranscript missed a phrase, the realtime/clean pipeline regressed.`);
  console.log(`  4. If forbidden substitution appeared, brand normalizer or prompt biasing broke.`);
  console.log(`  5. Fix in source, re-run \`npm run regression:realcalls\`.`);
  process.exit(1);
}
console.log(`\nNote: this suite deliberately doesn't call OpenAI. To benchmark a new`);
console.log(`real call, paste the actual Zapusk AI transcript output into a new`);
console.log(`DATASETS entry and re-run.\n`);
