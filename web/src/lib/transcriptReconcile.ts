// Sprint 62.HOTFIX P0.1 — Interim/final reconciliation.
//
// Problem (production observed 2026-05-18):
//   User said slowly: «Здравствуйте, меня зовут Григорий, проверяю
//   транскрипцию».
//   UI showed: «Транскрипция» (only the last word).
//
// Root cause:
//   OpenAI Realtime emits .delta events that we accumulate into
//   `interimBuffer`. On .completed, `msg.transcript` is OpenAI's
//   server-finalized text. In normal flow these align well — we drop
//   interim and use final.
//
//   But OpenAI's transcribe model occasionally returns a final that is
//   dramatically truncated relative to interim — only the last word in
//   nominative case (e.g. «Транскрипция» when user said the accusative
//   «транскрипцию» at end of a 57-char phrase). Cause is server-side
//   (likely VAD chopping or model rewriting), not our pipeline. But the
//   client must not silently throw away the correct interim.
//
//   The existing `compareInterimVsFinal` detector flags suspicious
//   mutation when finalChars >= 20 — too high. The «Транскрипция» case
//   (12 chars) slips through unflagged.
//
// Fix:
//   Detect TRUNCATION specifically (not generic mutation):
//     • interim is ≥ 3× longer than final
//     • final is short (≤ 30 chars)
//     • final's word stem appears in interim's tail (proves same content)
//   → prefer interim text.
//
//   Conservative on purpose:
//     • Normal case (lengths similar): no intervention.
//     • Model corrects stuttering interim (final shorter but interim was
//       wrong): only the 3× length gate triggers if final is ALSO short,
//       and ALSO must contain the final stem in interim tail. Stuttering
//       interims like «пр пр привет» rarely produce a stem-match miss.
//     • Long final never triggers (user spoke a lot, final has the lot).
//
// Test coverage: scripts/project-knowledge-smoke.ts section 15.

export interface ReconcileResult {
  /** The text we recommend appending to UI/state. */
  text: string;
  /** True if we substituted interim because final looks truncated. */
  recovered: boolean;
  /** Debug: numeric ratio. */
  ratio: number;
}

const TRUNCATION_LENGTH_RATIO = 3;
const TRUNCATION_FINAL_MAX_CHARS = 30;
const STEM_MIN_LENGTH = 4;

export function reconcileTruncatedFinal(interim: string, final: string): ReconcileResult {
  const a = (interim ?? '').trim();
  const b = (final ?? '').trim();
  if (!a || !b) return { text: b || a, recovered: false, ratio: 0 };

  const ratio = a.length / Math.max(1, b.length);

  // Not a truncation candidate: lengths are comparable.
  if (a.length < b.length * TRUNCATION_LENGTH_RATIO) return { text: b, recovered: false, ratio };

  // Final is long — even if interim is longer, the truncation pattern
  // doesn't fit. We bail to avoid over-correction.
  if (b.length > TRUNCATION_FINAL_MAX_CHARS) return { text: b, recovered: false, ratio };

  // Does interim contain final's word stem? Strip case + morphology
  // (last ~3 chars). Russian conjugation lives in suffixes; the stem
  // is morphology-neutral enough to match accusative «транскрипцию»
  // against nominative «Транскрипция» (both share «транскрип...»).
  const aLower = a.toLowerCase();
  const bClean = b.toLowerCase().replace(/[.,!?…]+$/, '').trim();
  if (!bClean) return { text: b, recovered: false, ratio };
  const stemLen = Math.max(STEM_MIN_LENGTH, bClean.length - 3);
  const stem = bClean.slice(0, stemLen);
  if (stem.length < STEM_MIN_LENGTH) return { text: b, recovered: false, ratio };

  // Look for the stem in the TAIL of interim (search window = 2× final length).
  // This avoids matching the stem mid-phrase coincidence.
  const tailWindow = Math.min(aLower.length, Math.max(b.length * 2, stemLen + 8));
  const tail = aLower.slice(-tailWindow);
  if (!tail.includes(stem)) return { text: b, recovered: false, ratio };

  // All gates pass → truncation recovered. Use interim.
  return { text: a, recovered: true, ratio };
}
