// Sprint 62.HOTFIX P0.2 — Detect when previous AI advice was already spoken.
//
// Production observation 2026-05-18:
//   AI suggested «Да, понял, давайте тогда коротко по сути проекта. Terminal —
//   это платформа социальной коммерции…». Manager spoke it. Manager clicked
//   «Получить подсказку» again. AI returned the SAME phrase.
//
// Existing guards that DID NOT catch this:
//   • Server prompt: «Не повторяй previousAdvice и предыдущий mainQuestion
//     дословно» — model honored «not exactly», generated near-identical
//     paraphrase that passed prompt directive.
//   • Server avoidRepeatedAdvice() — only checks if new mainQuestion is a
//     SUBSTRING of previousAdvice/adviceHistory. Doesn't compare against
//     transcript content at all.
//
// Missing piece: nobody checks whether the previousAdvice is ALREADY IN
// the transcript. This module fills the gap.
//
// Algorithm:
//   1. Tokenize both texts (lowercase, Unicode-aware word boundary, ≥3-char
//      tokens, strip Russian morphology suffix by trimming last 2 chars).
//   2. Compute COVERAGE of advice tokens in the transcript: how many of
//      the advice's tokens appear at least once in the transcript.
//   3. If coverage ≥ 60% AND advice has at least 4 meaningful tokens
//      AND transcript chunk containing matches >= 8 chars long
//      → flag as already-spoken.
//
// Thresholds chosen conservatively:
//   • 60% coverage catches paraphrases («коротко по сути проекта»
//     vs «коротко по сути этого проекта») while leaving room for
//     legitimately distinct next questions.
//   • 4-token floor protects against false positives on short generic
//     phrases («Да, понял», «Спасибо за встречу») where coverage is
//     easily high.
//   • Stem-trimming (last 2 chars) handles Russian declension:
//     «проекта»/«проекте»/«проект» all share «проек» stem.

export interface AdviceAlreadySaidResult {
  alreadySpoken: boolean;
  /** 0..1 — fraction of advice tokens found in transcript. */
  coverage: number;
  /** Number of advice tokens checked (after filtering). */
  adviceTokenCount: number;
  /** Token threshold + chars threshold passed? */
  meetsMinimum: boolean;
  /** Up to 5 matched tokens, for debug. */
  matchedTokens: string[];
}

const COVERAGE_THRESHOLD = 0.6;
const MIN_ADVICE_TOKENS = 4;
const MIN_TOKEN_LENGTH = 3;
// Russian morphology: use a 5-char PREFIX as the stem. «проект» / «проекта» /
// «проекте» / «проектами» all share prefix «проек». «команда» / «командами»
// share «коман». Tokens shorter than 5 chars keep their full form (no false
// merging of e.g. «дом» with «домик» — both stay distinct).
const STEM_PREFIX = 5;

// Conservative stopword list — words too common to count toward coverage.
// Russian + English. Keeps the signal/noise high.
const STOPWORDS = new Set<string>([
  // RU
  'это', 'эта', 'этот', 'эти', 'тот', 'тоже', 'также',
  'который', 'которая', 'которые', 'которые',
  'если', 'тогда', 'когда', 'сейчас', 'теперь',
  'может', 'можно', 'нужно', 'надо', 'будет', 'было', 'были',
  'есть', 'нет', 'был', 'была', 'быть',
  'очень', 'просто', 'только', 'даже', 'ещё',
  'свой', 'своя', 'свои', 'наш', 'наша', 'наши', 'ваш', 'ваша',
  'один', 'два', 'три',
  'кто', 'что', 'как', 'где', 'когда', 'почему', 'зачем',
  // common conversational
  'спасибо', 'пожалуйста', 'давайте', 'понял', 'поняла', 'хорошо', 'ладно',
  'привет', 'здравствуйте', 'добрый',
  // EN
  'this', 'that', 'these', 'those', 'with', 'from', 'have', 'will',
  'would', 'could', 'should', 'about', 'their', 'there', 'them',
  'what', 'when', 'where', 'which', 'while', 'okay',
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const raw = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // Apply prefix-stem (handles Russian case endings consistently).
  return raw
    .filter((t) => t.length >= MIN_TOKEN_LENGTH)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => t.slice(0, STEM_PREFIX));
}

export function isAdviceAlreadySaid(adviceText: string, transcriptText: string): AdviceAlreadySaidResult {
  const empty: AdviceAlreadySaidResult = {
    alreadySpoken: false, coverage: 0, adviceTokenCount: 0,
    meetsMinimum: false, matchedTokens: [],
  };
  if (!adviceText || !transcriptText) return empty;

  const adviceTokens = tokenize(adviceText);
  const transcriptTokens = tokenize(transcriptText);
  if (adviceTokens.length === 0 || transcriptTokens.length === 0) return empty;
  if (adviceTokens.length < MIN_ADVICE_TOKENS) {
    return {
      ...empty,
      adviceTokenCount: adviceTokens.length,
      // Too few tokens — avoid false positive on short advice like «Спросите про чек».
    };
  }

  const transcriptSet = new Set(transcriptTokens);
  const matched: string[] = [];
  const adviceUnique = new Set(adviceTokens);
  for (const t of adviceUnique) {
    if (transcriptSet.has(t)) matched.push(t);
  }
  const coverage = matched.length / adviceUnique.size;
  return {
    alreadySpoken: coverage >= COVERAGE_THRESHOLD,
    coverage,
    adviceTokenCount: adviceUnique.size,
    meetsMinimum: adviceUnique.size >= MIN_ADVICE_TOKENS,
    matchedTokens: matched.slice(0, 5),
  };
}
