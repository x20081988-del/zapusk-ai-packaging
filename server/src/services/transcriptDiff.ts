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
  };
}
