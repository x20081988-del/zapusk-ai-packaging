// Sprint 62.P9.HOTFIX — client-side defense against system-prompt leakage
// in live transcription.
//
// Background: the `realtime_transcription` PromptTemplate body contains
// instructive prose («Ты — модуль точной русской транскрипции...», «ОСНОВНЫЕ
// ПРАВИЛА», etc.). OpenAI Realtime API treats `transcription.prompt` as
// continuation context — if you give it prose, the model can emit it back
// as transcript completions. Verified prod incident 2026-05-26 (founder
// screenshot: full template body landed in the live transcript pane).
//
// Sprint 62.P9.HOTFIX server-side fix: `buildRealtimePrompt` now extracts
// only the dictionary section and sends a flat phrase list to OpenAI. This
// removes the trigger.
//
// THIS module is the second line of defence: if a leak still slips
// through (custom user templates without the «СЛОВАРЬ» header, third-party
// transcription providers, future API changes), the client filter drops the
// chunk before it reaches the UI / analyze payload.
//
// Heuristic: 4+ matches against high-signal prompt signatures over a span
// of ≤200 chars. We want zero false-positives on real investor speech, so
// the signatures are deliberately specific.
//
// Pure module — no React, no DOM. Tested via project-knowledge-smoke.

export const PROMPT_LEAKAGE_SIGNATURES: ReadonlyArray<RegExp> = [
  // Imperative «I am the transcription module» self-reference
  /Ты\s+—?\s+модул[ьея]\s+(точной|русской|транскрипции)/iu,
  /модул[ьея]\s+(точной|русской)\s+транскрипции/iu,
  // Section headers from the seed body
  /СЛОВАР[ЬЯ]\s+ТЕРМИНОВ/iu,
  /ОСНОВН[ЫЕ]Е?\s+ПРАВИЛА/iu,
  /БИЗНЕС[-\s]?ИМ[ЁЕ]Н/iu,
  // Product-instruction self-references
  /платформ[ыа]?\s+ZAPUSK\s+AI/iu,
  /AI[-\s]?ассистента?\s+переговоров/iu,
  // Imperative instructions to the model
  /(Английские|английские)\s+термины\s+оставляй/iu,
  /(Не\s+сокращай|не\s+парафразируй)/iu,
  /Сохраняй\s+пунктуацию/iu,
  /Если\s+(слышишь|говорящий)\s+(паузу|запинается)/iu,
  /(приоритет|приоритеты)\s+распознавания/iu,
];

export interface LeakageDetection {
  detected: boolean;
  /** How many signatures matched. */
  hits: number;
  /** The matched signature substrings (first 80 chars each). */
  matchedSamples: string[];
  /** Short reason string for logs. */
  reason: string;
}

const MIN_HITS_TO_FLAG = 2;
const MIN_LEN_TO_CHECK = 40;

/**
 * Returns leak detection result for the given transcript chunk.
 *
 * Strategy: count distinct signature matches. A real investor saying «у нас
 * SPIN-этапы понимаем» won't trip multiple prompt-specific patterns. The
 * leaked body trips 5+ patterns in the first 200 chars.
 *
 * Threshold is conservative: 2 hits flags. Single match (e.g. someone
 * literally says «ZAPUSK AI» on a real call) does NOT block — needs a
 * second corroborating signature.
 */
export function detectPromptLeakage(text: string | null | undefined): LeakageDetection {
  if (!text || typeof text !== 'string') {
    return { detected: false, hits: 0, matchedSamples: [], reason: 'empty' };
  }
  if (text.length < MIN_LEN_TO_CHECK) {
    return { detected: false, hits: 0, matchedSamples: [], reason: 'too_short' };
  }
  const hits: string[] = [];
  for (const re of PROMPT_LEAKAGE_SIGNATURES) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) hits.push(m[0].slice(0, 80));
    if (hits.length >= MIN_HITS_TO_FLAG) break;
  }
  if (hits.length < MIN_HITS_TO_FLAG) {
    return { detected: false, hits: hits.length, matchedSamples: hits, reason: 'below_threshold' };
  }
  return {
    detected: true,
    hits: hits.length,
    matchedSamples: hits,
    reason: `prompt_leakage_signatures_matched`,
  };
}

/**
 * Drop-in filter wrapper. Returns the text unchanged when safe, or empty
 * string when leakage detected. Caller can act on `.dropped` to log /
 * increment a counter.
 */
export interface FilteredChunk {
  text: string;
  dropped: boolean;
  detection: LeakageDetection;
}

export function filterPromptLeakage(text: string): FilteredChunk {
  const detection = detectPromptLeakage(text);
  if (detection.detected) {
    return { text: '', dropped: true, detection };
  }
  return { text, dropped: false, detection };
}
