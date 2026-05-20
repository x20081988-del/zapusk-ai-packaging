// Sprint 62.P1 demo hotfix — generic-opener detection + replacement.
//
// Problem
// -------
// Founders reported that during live demos the AI assistant kept returning
// generic "let's go through the project briefly" openers even when:
//   • manual meeting context was provided ("инвестор интересуется Terminal");
//   • live transcript already had substance ("я хотел коротко обсудить Terminal").
// The hints looked like placeholders ("Что ж, предлагаю коротко пройтись по
// проекту…"), not context-aware questions. The investor across the call
// could tell immediately that AI wasn't reading the room.
//
// Two sources of these openers:
//   (a) The hard-coded PROJECT_DETAILS_TRANSITION_PHRASE override in
//       salesAssistantService.ts — fires when detectProjectDetailsRequest()
//       signal matches 2+ phrases. The user wanted a context-aware reply
//       instead.
//   (b) AI improvising in the spirit of the prompt rule, returning paraphrases
//       like "давайте коротко по сути проекта", "что ж, предлагаю
//       пройтись по проекту".
//
// Strategy
// --------
// 1. Detector — pattern set targeting the demo placeholder phrases.
// 2. Prompt guard — when there's substantive transcript/context, tell AI in
//    the system prompt: NO generic project-openers. Move to qualification.
// 3. Post-processing replacement — if the detector still catches a generic
//    opener AND there's substantive context, rewrite mainQuestion + backups
//    to a context-aware fallback (no extra AI call — keep latency).

export const GENERIC_HINT_PATTERNS: ReadonlyArray<RegExp> = [
  /коротко.*проект/iu,
  /пройтись.*проект/iu,
  /по\s+сути\s+проект/iu,
  /расскаж(?:у|ите|и|ем).*проект/iu,
  /что\s+ж.{0,20}предлага/iu,
  /предлагаю\s+коротко/iu,
  /давайте\s+коротко/iu,
  /быстро\s+(?:обсуд|пройт|расскаж|объясн)/iu,
];

/**
 * Detects "generic demo placeholder" hint phrases. Designed to catch the
 * specific failure mode observed in prod (May 2026):
 *   • «Что ж, предлагаю коротко пройтись по проекту…»
 *   • «Давайте коротко по сути проекта…»
 *   • «Расскажу коротко, что это за проект…»
 *
 * Returns false for legitimate specific questions like:
 *   • «Какой формат участия вам ближе — финансовый или стратегический?»
 *   • «Был ли у вас опыт инвестиций в маркетплейсы?»
 *
 * Conservative on purpose: only catches phrases that explicitly use the
 * "коротко + проект" / "пройтись + проект" / "по сути проекта" combos
 * because those are the placeholder shapes that look like UI mock copy.
 */
export function isGenericDemoHint(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text).trim();
  if (!t) return false;
  // Very short replies (< 12 chars) cannot be substantive question or
  // placeholder either; let downstream handle them.
  if (t.length < 12) return false;
  return GENERIC_HINT_PATTERNS.some((re) => re.test(t));
}

/**
 * Context-aware fallback used when the AI returned a generic opener AND
 * we have enough context to ask a real question. Picked to be neutral and
 * useful in both qualification and meeting flow — leans on the most common
 * investor-discovery question. Server-side, not from AI, so no latency cost.
 */
export const CONTEXT_AWARE_FALLBACK = {
  mainQuestion:
    'Уточните у инвестора: какой формат участия ему ближе — как финансовому инвестору с прицелом на доходность, или как стратегическому партнёру с операционным интересом?',
  backupQuestions: [
    'Был ли у вас опыт инвестиций в маркетплейсы или платформенные бизнесы — и какой критерий тогда был решающим?',
    'Что для вас сейчас важнее в новом проекте: рост выручки, сильная команда или возможность выхода на горизонте 2-3 года?',
    'Какой чек вам обычно комфортен на первый заход и что должно быть в материалах, чтобы вы согласились на следующую встречу?',
  ],
};

/**
 * Returns the prompt-level directive that forbids generic openers when
 * there's substantive context. Empty string if not applicable — caller can
 * safely concatenate.
 *
 * `hasContext` is the truthy signal from caller (manual context + transcript
 * combined chars >= 60 typically). The cutoff lives at the call site because
 * the salesAssistantService already computes payload character counts.
 */
export function buildAntiGenericGuard(hasContext: boolean): string {
  if (!hasContext) return '';
  return [
    'ЗАПРЕТ generic placeholder-подсказок (Sprint 62.P1):',
    '• Если есть meeting context ИЛИ transcript содержит хоть одну фразу — НЕЛЬЗЯ возвращать в mainQuestion фразы вида:',
    '  «давайте коротко пройдёмся по проекту», «коротко по сути проекта», «расскажу коротко, что это за проект», «что ж, предлагаю…».',
    '• Это placeholder-стиль, который сразу выдаёт AI как заглушку — для демо запрещено.',
    '• Вместо этого задай конкретный вопрос инвестору, опирающийся на последнюю фразу из transcript или manual context:',
    '  – вопрос про опыт инвестиций / портфель,',
    '  – уточнение формата участия (финансовый vs стратегический),',
    '  – квалификация по чеку, горизонту, критерию решения,',
    '  – SPIN problem-question по уже произнесённой реплике,',
    '  – переход к next step (отправить материалы, назначить созвон).',
    '• Только если транскрипт реально пустой (< 30 символов) и контекста нет — допустим вход «Расскажите, что вам интересно в первую очередь».',
  ].join('\n');
}

export interface AntiGenericRewriteResult<T> {
  card: T;
  rewritten: boolean;
  reason: string | null;
}

/**
 * Post-processing rewrite. If `card.mainQuestion` is a generic demo placeholder
 * AND we have substantive context, replace mainQuestion + backupQuestions
 * with the context-aware fallback. Otherwise pass-through.
 *
 * Generic shape: { mainQuestion: string | null | undefined; backupQuestions?: string[]; ... }
 * Returns the same shape with the (possibly rewritten) fields.
 *
 * No async / no AI call — this is the safety net AFTER the AI response.
 */
export function rewriteGenericHint<T extends { mainQuestion?: string | null; backupQuestions?: string[] }>(
  card: T,
  opts: { hasContext: boolean; suggestedPhraseField?: keyof T },
): AntiGenericRewriteResult<T> {
  const mainQuestion = card.mainQuestion?.trim() ?? '';
  if (!opts.hasContext) {
    return { card, rewritten: false, reason: 'no_context' };
  }
  if (!isGenericDemoHint(mainQuestion)) {
    return { card, rewritten: false, reason: null };
  }
  // Build the rewritten card, preserving any other fields the caller depends
  // on. Backup questions get rotated to the curated set; if the original card
  // had backups that are NOT generic, prepend them to keep useful variety.
  const originalBackups = Array.isArray(card.backupQuestions) ? card.backupQuestions : [];
  const cleanOriginalBackups = originalBackups.filter((q) => q && !isGenericDemoHint(q));
  const mergedBackups = Array.from(new Set([
    ...cleanOriginalBackups,
    ...CONTEXT_AWARE_FALLBACK.backupQuestions,
  ])).slice(0, 4);

  const next = {
    ...card,
    mainQuestion: CONTEXT_AWARE_FALLBACK.mainQuestion,
    backupQuestions: mergedBackups,
  } as T;

  // Some callers (CoreCard) carry a parallel `suggestedPhrase` mirror of
  // mainQuestion. If specified, update it too.
  if (opts.suggestedPhraseField) {
    (next as Record<string, unknown>)[opts.suggestedPhraseField as string] = CONTEXT_AWARE_FALLBACK.mainQuestion;
  }

  return { card: next, rewritten: true, reason: 'generic_demo_hint_with_context' };
}
