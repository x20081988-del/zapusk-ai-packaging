// Sprint 61.HOTFIX — Shared hallucination filter for ALL transcription surfaces.
//
// Why this file exists:
//   До хотфикса логика «is this an AI hallucination» жила ТОЛЬКО внутри
//   SalesAssistant.tsx → appendFinalSegment. useVoiceDictation вызывает тот же
//   /api/realtime/transcription-session endpoint, но НЕ применял фильтр →
//   галлюцинации модели уходили прямо в textarea фаундера. На проде
//   наблюдалось:
//     • «Наши переговоры продолжаются»  — meeting-context hallucination
//     • «сидим»                          — short ambiguous filler
//     • «Видимо, потому что мы меняемся» — meta-language hallucination
//     • «Это задача...»                  — meta-language fragment
//
// Дублирование filter-pattern'ов между SalesAssistant.tsx,
// useVoiceDictation.ts и scripts/*.mjs создавало риск drift. Этот модуль —
// единственный источник правды для web/.
//
// Контракт:
//   • Pure: text-in / boolean-out. Никаких side-effects, никаких deps.
//   • shouldFilterHallucination(text, opts) принимает контекст:
//       - last final segment timestamp (для isolation check)
//       - surface ('meeting' | 'dictation') — UX-различия в порогах
//   • Pattern-эвристика консервативна: false-negative предпочтительнее
//     false-positive (см. policy в Sprint 56).
//
// Тесты:
//   web smoke не на этом файле (нет vitest), но
//   scripts/transcript-aggregation-smoke.mjs и scripts/pipeline-replay.mjs
//   реплицируют тот же фильтр для server-side regression detection.
//   ⚠ Если меняешь pattern'ы здесь — синхронно правь скрипты.

// ─── Pattern A: classic AI-prompt-leakage (short, isolated, suspicious) ────
//
// Pattern «выглядит как фраза из system/assistant промпта» — обычно
// короткая, нет смыслового продолжения, встречается на silence.
// Применяется ТОЛЬКО если есть isolation в audio buffer (нет prev segment
// в isolation window) И длина <= max char.
export const SUSPICIOUS_AI_PROMPT_PHRASES: RegExp[] = [
  /^Чек или доля\??$/i,
  // `[.…]{0,3}` — literal dot OR Unicode ellipsis U+2026.
  /^Ну, если вы настаиваете[.…]{0,3}$/i,
];

// ─── Pattern B: known prompt-leakage sentences (always drop) ───────────────
//
// Очень специфичные многословные фразы, которые НЕ могут появиться в
// нормальном transcript-content. Один раз увидели в проде → dropping
// безусловно (без isolation check).
export const KNOWN_ADVICE_LEAKAGE_PHRASES: RegExp[] = [
  // Production desktop realtime once emitted this exact sales-coach line
  // while the user was silent. Pure prompt vocabulary leak.
  /мы\s+всегда\s+помним[\s\S]{0,100}учитывать\s+стади[юи]\s+проекта[\s\S]{0,100}какой\s+чек\s+нужен\s+от\s+инвестора/i,
];

// ─── Pattern C: short meta-language phrases (dictation hotfix) ─────────────
//
// Phrases observed in dictation surface during silence. They look like
// «filler thoughts about the conversation itself» — never legitimate
// dictation content. Applied ONLY in dictation surface (NOT meeting!),
// because в meeting инвестор может реально сказать «наши переговоры
// продолжаются» или «это задача».
//
// Strict word-boundary using Cyrillic-aware lookaround (см. Sprint 53 —
// `\b` не работает на кириллице в JS regex).
export const DICTATION_HALLUCINATION_PHRASES: RegExp[] = [
  // «Наши переговоры продолжаются» — meeting-meta фраза. Если фаундер
  // диктует контекст проекта, эта фраза почти всегда галлюцинация.
  // ВАЖНО: `\w` с `u` flag НЕ включает кириллицу — используем `[\p{L}\p{N}]*`
  // как Unicode-aware word-char класс.
  /(?<![\p{L}\p{N}])наши\s+переговоры\s+продолж[\p{L}\p{N}]*(?![\p{L}\p{N}])/iu,
  // «Это задача...» / «Это задача того...» — короткое meta-предложение,
  // обычно incomplete, не из dictation потока.
  /^это\s+задача[.…]{0,3}\s*$/iu,
  // «Видимо, потому что мы меняемся» — точный production hallucination.
  /видимо[,.\s]+потому\s+что\s+мы\s+меняемся/iu,
  // Standalone «сидим» — изолированное короткое слово, не filler фраза.
  /^сидим[.!?…]{0,3}$/iu,
];

// ─── Tunables ──────────────────────────────────────────────────────────────

const HALLUCINATION_ISOLATION_WINDOW_MS = 8_000;
const HALLUCINATION_MAX_CHARS = 40;

export type TranscriptSurface = 'meeting' | 'dictation';

export interface HallucinationFilterOptions {
  /** Timestamp ms of the last legitimate final segment, if any. */
  lastFinalTs?: number | null;
  /** Where the transcript is going. */
  surface: TranscriptSurface;
  /** Optional override of "now" — useful for tests. */
  now?: number;
}

export interface HallucinationFilterResult {
  drop: boolean;
  reason?: 'known_advice_leakage' | 'isolated_short_ai_pattern' | 'dictation_meta_phrase';
}

export function evaluateHallucination(
  text: string,
  opts: HallucinationFilterOptions,
): HallucinationFilterResult {
  if (!text) return { drop: false };

  // B. Known prompt-leak — unconditional drop.
  if (KNOWN_ADVICE_LEAKAGE_PHRASES.some((re) => re.test(text))) {
    return { drop: true, reason: 'known_advice_leakage' };
  }

  // C. Dictation-specific short meta-phrases. ONLY in dictation surface.
  if (opts.surface === 'dictation') {
    for (const re of DICTATION_HALLUCINATION_PHRASES) {
      re.lastIndex = 0;
      if (re.test(text)) {
        return { drop: true, reason: 'dictation_meta_phrase' };
      }
    }
  }

  // A. Classic isolated short AI-prompt phrase. Applies to BOTH surfaces.
  if (text.length > HALLUCINATION_MAX_CHARS) return { drop: false };
  const matchesPattern = SUSPICIOUS_AI_PROMPT_PHRASES.some((re) => re.test(text));
  if (!matchesPattern) return { drop: false };
  if (opts.lastFinalTs == null) {
    // First segment + matches pattern → drop.
    return { drop: true, reason: 'isolated_short_ai_pattern' };
  }
  const now = opts.now ?? Date.now();
  const sinceLast = now - opts.lastFinalTs;
  if (sinceLast >= HALLUCINATION_ISOLATION_WINDOW_MS) {
    return { drop: true, reason: 'isolated_short_ai_pattern' };
  }
  return { drop: false };
}
