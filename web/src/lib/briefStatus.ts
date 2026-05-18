// Sprint 14: централизованная логика «статус брифа проекта».
//
// До спринта статус и CTA на брифе размазывались по страницам — Dashboard,
// AILeads, ProjectCockpit и Journey считали по-разному. Этот хелпер даёт
// единый source-of-truth: 4 состояния, понятная метка, CTA-текст и
// completion percent — и используется везде, где UI трогает бриф.

import type { Project } from './api';

export type BriefState = 'not_started' | 'in_progress' | 'ready' | 'needs_review';

export interface BriefStatus {
  state: BriefState;
  label: string;          // короткая метка для бейджа
  longLabel: string;      // полная фраза для контекста
  cta: string;            // текст CTA-кнопки в текущем состоянии
  /** 0..100 — какая часть AI-вопросов закрыта (или 0 / 100 для крайних состояний). */
  completion: number;
  /** Сколько вопросов всё ещё открыто (для подписи под progress bar). */
  openQuestions: number;
}

export function getBriefStatus(project: Pick<Project, 'brief'>): BriefStatus {
  const brief = project.brief;

  if (!brief) {
    return {
      state: 'not_started',
      label: 'Бриф не начат',
      longLabel: 'Бриф ещё не сгенерирован',
      cta: 'Заполнить бриф',
      completion: 0,
      openQuestions: 0,
    };
  }

  const missing = collectMissingQuestions(brief);
  const answered = new Set(parseAnswers(brief.interviewAnswers).map(normalizeQuestion));
  const stillOpen = missing.filter((q) => !answered.has(normalizeQuestion(q)));

  if (missing.length === 0) {
    // AI generated brief and didn't ask for clarifications → ready as-is.
    return {
      state: 'ready',
      label: 'Бриф заполнен',
      longLabel: `Бриф собран · версия v${brief.version}`,
      cta: 'Открыть бриф',
      completion: 100,
      openQuestions: 0,
    };
  }

  const total = missing.length;
  const answeredCount = total - stillOpen.length;

  if (stillOpen.length === 0) {
    // All clarifications answered → ready, but signal that AI may ask more on re-gen.
    return {
      state: 'ready',
      label: 'Бриф заполнен',
      longLabel: `Все уточнения закрыты · v${brief.version}`,
      cta: 'Открыть бриф',
      completion: 100,
      openQuestions: 0,
    };
  }

  if (answeredCount === 0) {
    // Brief exists, but the founder hasn't answered any clarification yet.
    return {
      state: 'needs_review',
      label: 'Требуются уточнения',
      longLabel: `AI попросил ответить на ${total} вопрос${pluralize(total)}`,
      cta: 'Продолжить бриф',
      completion: Math.max(20, Math.round(briefBaseProgress(brief))),
      openQuestions: total,
    };
  }

  return {
    state: 'in_progress',
    label: 'Бриф в процессе',
    longLabel: `${answeredCount} из ${total} уточнений готовы`,
    cta: 'Продолжить бриф',
    completion: Math.round((answeredCount / total) * 100),
    openQuestions: stillOpen.length,
  };
}

/** Tailwind tone for StatusBadge per brief state. */
export function briefStatusTone(state: BriefState): 'neutral' | 'warning' | 'success' | 'ai' {
  switch (state) {
    case 'not_started': return 'neutral';
    case 'in_progress': return 'ai';
    case 'needs_review': return 'warning';
    case 'ready': return 'success';
  }
}

// ── internals ──────────────────────────────────────────────────────────────

function briefBaseProgress(brief: NonNullable<Project['brief']>): number {
  // Even with no answers, the brief itself contributes ~20-40% (the AI already
  // pulled out summary / monetization / strengths). This keeps the progress bar
  // from showing 0% on a brief that visibly has content.
  let filled = 0;
  let total = 0;
  for (const key of ['businessSummary', 'monetization', 'investmentAsk', 'keyMetrics', 'strengths', 'weaknesses'] as const) {
    total += 1;
    if (typeof brief[key] === 'string' && (brief[key] ?? '').trim().length > 0) filled += 1;
  }
  return total === 0 ? 25 : Math.round((filled / total) * 60); // capped at 60% until clarifications answered
}

function collectMissingQuestions(brief: NonNullable<Project['brief']>): string[] {
  const byCategory = parseRecord(brief.missingByCategory);
  const categorized = Object.values(byCategory).flatMap((items) => (Array.isArray(items) ? items : []));
  const list = categorized.length > 0 ? categorized : parseList(brief.missingData);
  return list.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
}

function parseAnswers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a) =>
        typeof a?.question === 'string' && typeof a?.answer === 'string' && a.answer.trim() ? a.question : null,
      )
      .filter((q): q is string => Boolean(q));
  } catch {
    return [];
  }
}

function parseList(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

function pluralize(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return '';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'а';
  return 'ов';
}

/**
 * Resolve target href for the brief CTA from anywhere in the app.
 *
 * Sprint 61.HOTFIX (P0.1) — When the CTA is "Продолжить бриф" (brief in
 * progress / needs review), route DIRECTLY to /interview so the founder
 * lands on the questions form, not the brief read-view. The old behavior
 * sent them to /brief where they had to scroll to MissingDataPanel and
 * click again. Production manual test on Luce Silva: «click does not open
 * the brief flow» — root cause confirmed.
 *
 * Priority:
 *   1. If a specific projectId is passed:
 *      → /interview when state ∈ {in_progress, needs_review}
 *      → /brief otherwise (ready/not_started — view-mode)
 *   2. If user has zero projects → /projects/new.
 *   3. If user has multiple, no preselection → null (caller opens picker).
 */
export function resolveBriefCtaHref(opts: {
  projectId?: string | null;
  projects: Pick<Project, 'id'>[];
  /**
   * Optional brief state. Pass this when the caller already computed it so
   * we can decide between /brief (view) and /interview (answer-form).
   * Without it we keep the old behavior (/brief) for back-compat.
   */
  briefState?: BriefState;
}): string | null {
  if (opts.projectId) {
    const isAnswerMode = opts.briefState === 'in_progress' || opts.briefState === 'needs_review';
    const suffix = isAnswerMode ? '/interview' : '/brief';
    return `/projects/${opts.projectId}${suffix}`;
  }
  if (opts.projects.length === 0) return '/projects/new';
  if (opts.projects.length === 1) return `/projects/${opts.projects[0].id}/brief`;
  return null; // caller should open a project picker
}

/**
 * Sprint 61.HOTFIX (P0.1) — convenience helper for ProjectCockpit and similar
 * pages that already have the project + brief status. Routes to /interview
 * for answer-mode states, /brief for view-mode.
 */
export function briefCtaHrefForProject(projectId: string, state: BriefState): string {
  const isAnswerMode = state === 'in_progress' || state === 'needs_review';
  return `/projects/${projectId}${isAnswerMode ? '/interview' : '/brief'}`;
}
