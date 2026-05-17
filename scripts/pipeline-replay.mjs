#!/usr/bin/env node
// Sprint 58 P0.6 — Deterministic pipeline replay debugger.
//
// Run via:
//   `npm run replay`                              — uses built-in scenarios
//   `npm run replay -- path/to/events.json`       — replays a saved event stream
//
// What it does:
//   Replays a sequence of raw realtime events through the full pipeline
//   (normalize → hallucination guard → dedup → append) and shows the
//   resulting transcript + every per-segment lifecycle decision.
//
// Event format (JSON array):
//   [
//     { "kind": "completed", "text": "...", "advanceMs": 2000 },
//     { "kind": "interim",   "text": "...", "advanceMs": 500  },
//     { "kind": "stale",     "text": "..." }
//   ]
//
// Output: per-segment lifecycle trace + final transcript array.

import fs from 'node:fs';
import path from 'node:path';
import { compareDraftVsCleanJs } from './_regression_diff.mjs';

// ─── Pipeline mirror (sync with web/src/lib/*) ───
function normalizeTranscript(raw) {
  if (!raw) return raw;
  return raw.replace(
    /(?<![\p{L}\p{N}])[Гг][лл][аа][сс][ \-]?[Нн][аа][бБпП](?![\p{L}\p{N}])/gu,
    'Главснаб',
  );
}

const SUSPICIOUS_AI_PROMPT_PHRASES = [
  /^Чек или доля\??$/i,
  /^Ну,? если вы настаиваете[.…]{0,3}$/i,
];
const HALLUCINATION_MAX_CHARS = 60;
const ISOLATION_WINDOW_MS = 8_000;

function looksLikeAiHallucination(text, prev, now) {
  if (text.length > HALLUCINATION_MAX_CHARS) return false;
  if (!SUSPICIOUS_AI_PROMPT_PHRASES.some((re) => re.test(text))) return false;
  const last = prev[prev.length - 1];
  if (!last) return true;
  return (now - last.ts) >= ISOLATION_WINDOW_MS;
}

function appendFinalSegment(prev, text, now, lifecycle, segmentId, sessionId, source) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    lifecycle.push({ segmentId, sessionId, source, stage: 'dedup_filtered', status: 'dropped', reason: 'empty_after_trim', preview: '' });
    return prev;
  }
  const last = prev[prev.length - 1];
  if (last && last.text === trimmed) {
    lifecycle.push({ segmentId, sessionId, source, stage: 'dedup_filtered', status: 'dropped', reason: 'duplicate_of_previous_final', preview: trimmed.slice(0, 60) });
    return prev;
  }
  if (looksLikeAiHallucination(trimmed, prev, now)) {
    lifecycle.push({ segmentId, sessionId, source, stage: 'hallucination_filtered', status: 'dropped', reason: 'isolated_short_ai_pattern', preview: trimmed.slice(0, 60) });
    return prev;
  }
  lifecycle.push({ segmentId, sessionId, source, stage: 'appended', status: 'ok', preview: trimmed.slice(0, 60) });
  return [...prev, { ts: now, text: trimmed, segmentId }];
}

let _counter = 0;
function newSegmentId() { return `seg_${(++_counter).toString(36)}`; }

// ─── Replay ───
function replay(events, sessionId = 'replay') {
  let transcript = [];
  let now = 1_000_000;
  const lifecycle = [];
  for (const ev of events) {
    now += ev.advanceMs ?? 2_000;
    if (ev.kind === 'stale') {
      const id = newSegmentId();
      lifecycle.push({ segmentId: id, sessionId, source: 'realtime', stage: 'raw_received', status: 'ok', preview: ev.text.slice(0, 60) });
      lifecycle.push({ segmentId: id, sessionId, source: 'realtime', stage: 'stale_dropped', status: 'dropped', reason: 'wrong_session', preview: ev.text.slice(0, 60) });
      continue;
    }
    if (ev.kind === 'interim') {
      // Replay tool ignores interim events for transcript building; they
      // affect only mutation-vs-final diffing which is realtime-specific.
      continue;
    }
    // kind=completed (or default)
    const id = newSegmentId();
    lifecycle.push({ segmentId: id, sessionId, source: 'realtime', stage: 'raw_received', status: 'ok', preview: ev.text.slice(0, 60) });
    const normalized = normalizeTranscript(ev.text);
    if (normalized !== ev.text) {
      lifecycle.push({ segmentId: id, sessionId, source: 'realtime', stage: 'normalized', status: 'ok', reason: 'brand_normalize_applied', preview: normalized.slice(0, 60) });
    }
    transcript = appendFinalSegment(transcript, normalized, now, lifecycle, id, sessionId, 'realtime');
  }
  return { transcript, lifecycle };
}

// ─── Default scenarios ───
const SCENARIOS = [
  {
    label: 'Happy path — 5 normal phrases',
    events: [
      { kind: 'completed', text: 'Здравствуйте, как слышно?' },
      { kind: 'completed', text: 'Меня зовут Григорий.' },
      { kind: 'completed', text: 'Вы интересовались проектом Запуск?' },
      { kind: 'completed', text: 'Да, рассматриваем.' },
      { kind: 'completed', text: 'Отлично, тогда давайте обсудим.' },
    ],
    expectSegments: 5,
    expectHallucinationDrops: 0,
  },
  {
    label: 'Dedup — same phrase emitted twice',
    events: [
      { kind: 'completed', text: 'Да.' },
      { kind: 'completed', text: 'Да.' }, // dup
      { kind: 'completed', text: 'Хорошо.' },
    ],
    expectSegments: 2,
    expectDedupDrops: 1,
  },
  {
    label: 'Stale session events',
    events: [
      { kind: 'completed', text: 'Здравствуйте.' },
      { kind: 'stale',     text: 'Old session leak.' },
      { kind: 'completed', text: 'Хорошо.' },
    ],
    expectSegments: 2,
    expectStaleDrops: 1,
  },
  {
    label: 'Hallucination guard drops isolated AI-pattern',
    events: [
      { kind: 'completed', text: 'Алло, здравствуйте.' },
      { kind: 'completed', text: 'Я перезвоню позже.' },
      { kind: 'completed', text: 'Чек или доля?', advanceMs: 10_000 }, // isolated
    ],
    expectSegments: 2,
    expectHallucinationDrops: 1,
  },
  {
    label: 'Brand normalization — ГласНаб → Главснаб',
    events: [
      { kind: 'completed', text: 'Это компания ГласНаб.' },
      { kind: 'completed', text: 'Главснаб — основной проект.' }, // already correct
    ],
    expectSegments: 2,
    expectNormalize: 1,
    expectInFinal: ['Главснаб'],
    expectNotInFinal: ['ГласНаб'],
  },
  {
    label: 'Rapid finalization — 6 segments in 5 seconds',
    events: [
      { kind: 'completed', text: 'А.', advanceMs: 800 },
      { kind: 'completed', text: 'Б.', advanceMs: 800 },
      { kind: 'completed', text: 'В.', advanceMs: 800 },
      { kind: 'completed', text: 'Г.', advanceMs: 800 },
      { kind: 'completed', text: 'Д.', advanceMs: 800 },
      { kind: 'completed', text: 'Е.', advanceMs: 800 },
    ],
    expectSegments: 6,
  },
  {
    label: 'VAD chopping — short pause splits one sentence into 2 segments',
    events: [
      { kind: 'completed', text: 'Я подумаю.' },
      { kind: 'completed', text: 'Перезвоните завтра.', advanceMs: 1_500 }, // ≈ VAD threshold
    ],
    expectSegments: 2, // aggregation preserves both; concatenation is downstream
  },
  {
    label: 'Slow speech with hesitation markers',
    events: [
      { kind: 'completed', text: 'Эээ…' },
      { kind: 'completed', text: 'Я… ну…' },
      { kind: 'completed', text: 'Дайте подумать.' },
    ],
    expectSegments: 3, // fillers preserved by verbatim prompt + aggregation
  },
];

// ─── CLI ───
const arg = process.argv[2];
let scenariosToRun = SCENARIOS;
if (arg) {
  const fp = path.resolve(arg);
  if (!fs.existsSync(fp)) {
    console.error(`File not found: ${fp}`);
    process.exit(2);
  }
  const events = JSON.parse(fs.readFileSync(fp, 'utf8'));
  scenariosToRun = [{ label: path.basename(fp), events, expectSegments: undefined }];
}

let allOk = true;
console.log(`\n=== Pipeline Replay (${scenariosToRun.length} scenarios) ===\n`);

for (const sc of scenariosToRun) {
  _counter = 0;
  const { transcript, lifecycle } = replay(sc.events);
  const stats = {
    appended: lifecycle.filter((l) => l.stage === 'appended').length,
    dedupDrops: lifecycle.filter((l) => l.stage === 'dedup_filtered').length,
    hallucinationDrops: lifecycle.filter((l) => l.stage === 'hallucination_filtered').length,
    staleDrops: lifecycle.filter((l) => l.stage === 'stale_dropped').length,
    normalizes: lifecycle.filter((l) => l.stage === 'normalized').length,
  };
  const finalText = transcript.map((t) => t.text).join(' ').toLowerCase();
  const checks = [];
  if (sc.expectSegments !== undefined) checks.push(['segments', stats.appended, sc.expectSegments]);
  if (sc.expectDedupDrops !== undefined) checks.push(['dedupDrops', stats.dedupDrops, sc.expectDedupDrops]);
  if (sc.expectHallucinationDrops !== undefined) checks.push(['hallucinationDrops', stats.hallucinationDrops, sc.expectHallucinationDrops]);
  if (sc.expectStaleDrops !== undefined) checks.push(['staleDrops', stats.staleDrops, sc.expectStaleDrops]);
  if (sc.expectNormalize !== undefined) checks.push(['normalizes', stats.normalizes, sc.expectNormalize]);
  let pass = true;
  const failures = [];
  for (const [k, actual, expected] of checks) {
    if (actual !== expected) {
      pass = false;
      failures.push(`${k}: expected=${expected} actual=${actual}`);
    }
  }
  if (sc.expectInFinal) {
    for (const phrase of sc.expectInFinal) {
      if (!finalText.includes(phrase.toLowerCase())) {
        pass = false;
        failures.push(`expectInFinal missing: «${phrase}»`);
      }
    }
  }
  if (sc.expectNotInFinal) {
    for (const phrase of sc.expectNotInFinal) {
      if (finalText.includes(phrase.toLowerCase())) {
        pass = false;
        failures.push(`expectNotInFinal present: «${phrase}»`);
      }
    }
  }
  allOk = allOk && pass;
  console.log(`  ${pass ? '✓' : '✗'} ${sc.label}`);
  console.log(`     stats: appended=${stats.appended} dedup=${stats.dedupDrops} hallu=${stats.hallucinationDrops} stale=${stats.staleDrops} normalized=${stats.normalizes}`);
  if (transcript.length > 0) {
    console.log(`     final: ${transcript.map((t) => `"${t.text.slice(0, 40)}"`).join(' | ')}`);
  }
  if (failures.length > 0) {
    for (const f of failures) console.log(`     ✗ ${f}`);
  }
}

console.log(`\n${allOk ? '✓' : '✗'} ${allOk ? 'ALL SCENARIOS PASS' : 'REGRESSION'}\n`);

if (!allOk) {
  console.log('How to inspect:');
  console.log('  • Each scenario has expectation fields (expectSegments etc).');
  console.log('  • Failures listed above. The replay function mirrors web/src/pages/SalesAssistant.tsx');
  console.log('    + web/src/lib/transcriptPipeline.ts. If aggregation behaviour diverges, fix the');
  console.log('    real code first, then update mirror here.');
  process.exit(1);
}
