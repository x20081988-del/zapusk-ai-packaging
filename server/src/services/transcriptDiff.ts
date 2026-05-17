// Sprint 55 P0 — Transcript diff foundation.
//
// Сравнивает draft (realtime) vs clean (offline) transcripts и возвращает:
//   • added phrases   — есть в clean, нет в draft (модель «достроила» позже)
//   • removed phrases — есть в draft, нет в clean (вероятные галлюцинации
//                       realtime или дропнутые из-за помех)
//   • hallucination candidates — подмножество removed: короткие фразы,
//     матчащие curated AI-prompt patterns
//   • similarity     — Jaccard на множествах слов (0..1)
//   • stats          — char/word counts для обеих сторон
//
// Дизайн:
//   • Чистая функция, без I/O.
//   • Никаких ML — только пословное сравнение + регекспы.
//   • Foundation под future QA dashboard.
//   • НЕ удаляет ничего: только маркирует.

// Sprint 56 P0 — narrowed patterns. Keep only phrases that have no
// clean reading in normal investor calls. See SalesAssistant.tsx for
// full rationale.
const SUSPICIOUS_AI_PROMPT_PHRASES = [
  /^Чек или доля\??$/i,
  /^Ну,? если вы настаиваете[.…]{0,3}$/i,
];
const HALLUCINATION_MAX_CHARS = 60;

export interface TranscriptDiff {
  draftStats: { chars: number; words: number; sentences: number };
  cleanStats: { chars: number; words: number; sentences: number };
  similarity: number;        // 0..1 Jaccard on word set
  addedPhrases: string[];    // sentences in clean only
  removedPhrases: string[];  // sentences in draft only
  hallucinationCandidates: string[];  // subset of removed: short + matches AI pattern
  // Sprint 58 P0.7 — quality metrics. Lets ops quantify «how much did
  // the model change between draft and clean» beyond a single similarity
  // number. All values 0..1 unless noted.
  mutationRatio: number;     // 1 - similarity (overall token churn)
  tokenSurvivalRate: number; // share of draft tokens that survived into clean
  phrasePreservationRate: number; // share of draft SENTENCES that have a >=0.4 Jaccard match in clean
  draftTokenCount: number;
  cleanTokenCount: number;
  // Sprint 59 P0.6 — RealtimeQualityScore: composite 0..100 score that
  // summarizes how trustworthy realtime draft was vs offline clean.
  // 100 = realtime == clean (effectively lossless).
  // 50  = significant rewrites OR meaningful loss.
  // 0   = realtime essentially unrelated to clean (worst case).
  //
  // Formula (weighted):
  //   score = 100 * (
  //     0.4 * similarity
  //     + 0.3 * phrasePreservationRate
  //     + 0.3 * tokenSurvivalRate
  //     - 0.1 * (hallucinationCandidates.length > 0 ? 1 : 0)
  //   )
  // Clamped to [0, 100]. The penalty term ensures even one detected
  // hallucination knocks the score down by 10 points (signal, not noise).
  realtimeQualityScore: number;
  realtimeQualityClass: 'excellent' | 'good' | 'mediocre' | 'poor';
  // Sprint 60 P0.5 — filler / hesitation preservation metrics.
  //
  // Verbatim prompt explicitly instructs the model to preserve filler
  // words (ага / угу / эээ). These are SIGNAL for downstream AI
  // (hesitation, uncertainty, tone). If the realtime path stripped them
  // but offline kept them — or vice versa — we lose data.
  //
  // fillerPreservationRate: how many of the draft's filler occurrences
  //   survived to the clean transcript. Ideal: 1.0 (verbatim).
  //   Low rate means one of the two transcripts «cleaned them up» — a
  //   prompt regression signal.
  draftFillerCount: number;
  cleanFillerCount: number;
  fillerPreservationRate: number; // 0..1
  // Sprint 60 P0.7 — auto-escalation flag computed alongside the diff.
  // Set when realtime quality is suspicious enough that ops should
  // look at this session by hand.
  requiresManualReview: boolean;
  manualReviewReason: string | null;
}

// Лёгкая токенизация на русский язык: разбиваем по , . ! ? ; … и фильтруем
// пустые. Не идеально (бренды с . внутри сломают split), но для diff'а на
// уровне «фразы» этого достаточно.
function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?…])\s+|(?:\r?\n)+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/digits
    .split(/\s+/)
    .filter((t) => t.length >= 3); // skip 1-2 char noise («и», «о»)
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((t) => t.length > 0).length;
}

// Sprint 60 P0.5 — filler / hesitation word detection.
// «ага» / «угу» / «эээ» (with elongated variants) + «ммм», «нуу».
// Whole-word match (Unicode-aware boundary via lookaround) to avoid
// hitting substrings inside «когда».
const FILLER_PATTERN = /(?<![\p{L}\p{N}])(?:а+г+а+|у+г+у+|э+|м+м+|н+у+у+|х+м+м*)(?![\p{L}\p{N}])/giu;
function countFillers(text: string): number {
  if (!text) return 0;
  const matches = text.match(FILLER_PATTERN);
  return matches ? matches.length : 0;
}

// Sentence is "in" the other transcript if there's a sentence in `other`
// whose Jaccard similarity with `s` >= threshold. Threshold 0.4 chosen
// empirically: catches paraphrased forms but separates clearly distinct
// phrases. Tune by adjusting SENTENCE_MATCH_THRESHOLD.
const SENTENCE_MATCH_THRESHOLD = 0.4;
function findMatch(s: string, others: { text: string; tokens: Set<string> }[]): boolean {
  const target = tokenize(s);
  if (target.size === 0) return true; // pure punctuation — consider matched
  for (const o of others) {
    if (jaccard(target, o.tokens) >= SENTENCE_MATCH_THRESHOLD) return true;
  }
  return false;
}

function isHallucinationCandidate(s: string): boolean {
  if (s.length > HALLUCINATION_MAX_CHARS) return false;
  return SUSPICIOUS_AI_PROMPT_PHRASES.some((re) => re.test(s.trim()));
}

export function compareDraftVsClean(draft: string, clean: string): TranscriptDiff {
  const draftSentences = splitSentences(draft);
  const cleanSentences = splitSentences(clean);

  const draftIndexed = draftSentences.map((text) => ({ text, tokens: tokenize(text) }));
  const cleanIndexed = cleanSentences.map((text) => ({ text, tokens: tokenize(text) }));

  const removed: string[] = [];
  for (const s of draftSentences) {
    if (!findMatch(s, cleanIndexed)) removed.push(s);
  }
  const added: string[] = [];
  for (const s of cleanSentences) {
    if (!findMatch(s, draftIndexed)) added.push(s);
  }

  const hallucinationCandidates = removed.filter(isHallucinationCandidate);

  const draftAllTokens = tokenize(draft);
  const cleanAllTokens = tokenize(clean);
  const similarity = jaccard(draftAllTokens, cleanAllTokens);
  // Sprint 58 P0.7 — additional integrity metrics.
  const tokenSurvivalRate = draftAllTokens.size === 0
    ? 1
    : Array.from(draftAllTokens).filter((t) => cleanAllTokens.has(t)).length / draftAllTokens.size;
  const phrasePreservationRate = draftSentences.length === 0
    ? 1
    : draftSentences.filter((s) => findMatch(s, cleanIndexed)).length / draftSentences.length;
  // Sprint 60 P0.5 — filler preservation.
  const draftFillerCount = countFillers(draft);
  const cleanFillerCount = countFillers(clean);
  const fillerPreservationRate = draftFillerCount === 0
    ? 1 // no fillers in draft to preserve — neutral score
    : Math.min(1, cleanFillerCount / draftFillerCount);

  // Compute composite score + auto-escalation BEFORE return so the
  // return-shape literal stays simple and we don't double-compute.
  const score = computeRealtimeQualityScore(
    similarity, tokenSurvivalRate, phrasePreservationRate, hallucinationCandidates.length,
  );
  const escalation = computeManualReviewEscalation(
    score, hallucinationCandidates.length, phrasePreservationRate,
  );

  return {
    draftStats: {
      chars: draft.length,
      words: countWords(draft),
      sentences: draftSentences.length,
    },
    cleanStats: {
      chars: clean.length,
      words: countWords(clean),
      sentences: cleanSentences.length,
    },
    similarity,
    addedPhrases: added,
    removedPhrases: removed,
    hallucinationCandidates,
    mutationRatio: 1 - similarity,
    tokenSurvivalRate,
    phrasePreservationRate,
    draftTokenCount: draftAllTokens.size,
    cleanTokenCount: cleanAllTokens.size,
    realtimeQualityScore: score,
    realtimeQualityClass: classifyQualityScore(score),
    draftFillerCount,
    cleanFillerCount,
    fillerPreservationRate,
    requiresManualReview: escalation.requires,
    manualReviewReason: escalation.reason,
  };
}

function computeRealtimeQualityScore(
  similarity: number,
  tokenSurvivalRate: number,
  phrasePreservationRate: number,
  hallucinationCount: number,
): number {
  const raw =
    0.4 * similarity +
    0.3 * phrasePreservationRate +
    0.3 * tokenSurvivalRate -
    0.1 * (hallucinationCount > 0 ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

function classifyQualityScore(score: number): 'excellent' | 'good' | 'mediocre' | 'poor' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'mediocre';
  return 'poor';
}

// Sprint 60 P0.7 — Auto-escalation decision per spec:
//   • reliabilityScore < 50           OR
//   • hallucinationCandidates > 3      OR
//   • phrasePreservationRate < 0.6
// → mark session requires_manual_review=true.
// Returns reason string so UI/audit can show «why this session was flagged».
function computeManualReviewEscalation(
  score: number,
  hallucinationCount: number,
  phrasePreservationRate: number,
): { requires: boolean; reason: string | null } {
  const reasons: string[] = [];
  if (score < 50) reasons.push(`score=${score}<50`);
  if (hallucinationCount > 3) reasons.push(`hallucinations=${hallucinationCount}>3`);
  if (phrasePreservationRate < 0.6) reasons.push(`phrasePreservation=${phrasePreservationRate.toFixed(2)}<0.6`);
  if (reasons.length === 0) return { requires: false, reason: null };
  return { requires: true, reason: reasons.join('; ') };
}
