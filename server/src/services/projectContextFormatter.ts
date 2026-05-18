// Sprint 61 — Project Knowledge Layer.
//
// Единый форматтер контекста проекта для всех AI Assistant entry points:
//   • analyzeSalesTurn        (full,    project block ~2.5K-4K chars)
//   • analyzeSalesTurnFast    (fast,    project block ~0.8K-1.5K chars)
//   • prepareForMeeting       (prep,    full)
//
// Принципы:
//   1. Один loader + один formatter — никакого дублирования формат-логики
//      между analyze/fast/prep.
//   2. Компактно: каждое поле — 1 строка («ключ: значение»). Длинные тексты
//      обрезаются с маркером «…». Идея: AI должен видеть факты, а не дамп.
//   3. Безопасный truncate для всего — никаких unbounded полей.
//   4. Multi-project: явный маркер «=== Проект N ===». Cap 5 проектов
//      (унаследовано из Sprint 52 P0.4).
//   5. Файлы упоминаются как СПИСОК (имя · категория · тип). Содержимое
//      файлов в context-block НЕ дамп-аем — оно retrieve-ится через
//      KnowledgeChunk'и (см. Sprint B project-KB ingestion).
//
// Что попадает в prompt vs что НЕ попадает:
//
//   В prompt — структурированно, компактно:
//     • Project: name, industry, stage, raiseAmount/equity/minCheck, investorType
//     • Brief: businessSummary, monetization, keyMetrics(JSON→строки),
//              investmentAsk, strengths, weaknesses, missingData (только в full),
//              napkin (структурный, не только investorReturn), interviewAnswers
//              (top-N по бюджету)
//     • InvestorTerms: amount, equity, valuation, instrument, useOfFunds (truncated),
//                      exitStrategy, expectedReturn, payback
//     • Files: список originalName · category · mime (без содержимого)
//
//   НЕ в prompt:
//     • Полный текст pitch-deck / финмодели (это для KB retrieve)
//     • rawAIResponse, missingByCategory (избыточно)
//     • Любые internal служебные поля
//
// Файл намеренно НЕ импортирует prisma на верхнем уровне — loader-функции
// делают lazy import. Это даёт smoke-тестам возможность require'нуть pure
// formatter из node-script'а без поднимания Prisma.

// ─── Public types ──────────────────────────────────────────────────────────

export type ProjectContextVerbosity = 'full' | 'fast' | 'prep';

export interface FormatProjectContextOptions {
  verbosity?: ProjectContextVerbosity;
  // Хочешь увидеть список загруженных файлов? full=да, fast=нет (бюджет).
  includeFiles?: boolean;
  // Hard cap общего размера блока на ОДИН проект. Defaults — см. константы.
  perProjectCharCap?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const VERBOSITY_DEFAULTS: Record<ProjectContextVerbosity, {
  perProjectCharCap: number;
  includeFiles: boolean;
  includeWeaknesses: boolean;
  includeMissingData: boolean;
  includeInterviewAnswers: boolean;
  interviewAnswerLimit: number;
  // Максимум символов на одно длинное текстовое поле (businessSummary, monetization,
  // useOfFunds, exitStrategy). Превышение режется + «…».
  maxFieldLen: number;
}> = {
  full: {
    perProjectCharCap: 4_000,
    includeFiles: true,
    includeWeaknesses: true,
    includeMissingData: true,
    includeInterviewAnswers: true,
    interviewAnswerLimit: 6,
    maxFieldLen: 600,
  },
  prep: {
    perProjectCharCap: 4_000,
    includeFiles: true,
    includeWeaknesses: true,
    includeMissingData: false,
    includeInterviewAnswers: true,
    interviewAnswerLimit: 5,
    maxFieldLen: 600,
  },
  fast: {
    perProjectCharCap: 1_500,
    includeFiles: false,
    includeWeaknesses: false,
    includeMissingData: false,
    includeInterviewAnswers: false,
    interviewAnswerLimit: 0,
    maxFieldLen: 240,
  },
};

const MAX_PROJECTS_IN_CONTEXT = 5;

// ─── Public API ────────────────────────────────────────────────────────────

// Структура, которую loader отдаёт formatter'у. Изоморфна Prisma-shape, но
// явная — formatter не зависит от Prisma и тестируем без БД.
export interface LoadedProject {
  id: string;
  name: string;
  industry: string | null;
  stage: string | null;
  raiseAmount: number | null;
  currency: string | null;
  minCheck: number | null;
  equityOffered: number | null;
  investorType: string | null;
  status: string | null;
  investmentTrack: string | null;
  brief: {
    businessSummary: string | null;
    monetization: string | null;
    keyMetrics: string | null;        // JSON
    investmentAsk: string | null;
    strengths: string | null;          // JSON array
    weaknesses: string | null;         // JSON array
    missingData: string | null;        // JSON array
    napkin: string | null;             // JSON
    interviewAnswers: string | null;   // JSON array
  } | null;
  investorTerms: {
    amount: number | null;
    equityPercent: number | null;
    valuation: number | null;
    instrument: string | null;
    useOfFunds: string | null;
    exitStrategy: string | null;
    expectedReturn: string | null;
    payback: string | null;
  } | null;
  files: Array<{
    id: string;
    originalName: string;
    category: string;
    mimeType: string;
    size: number;
    url: string | null;
  }>;
}

// Pure formatter — не ходит в БД. Тестируется на in-memory LoadedProject.
export function formatProjectContextForAssistant(
  project: LoadedProject | null | undefined,
  options: FormatProjectContextOptions = {},
): string {
  if (!project) {
    return '— проект не выбран, работай как универсальный AI Sales Assistant Zapusk';
  }
  const verbosity = options.verbosity ?? 'full';
  const cfg = VERBOSITY_DEFAULTS[verbosity];
  const cap = options.perProjectCharCap ?? cfg.perProjectCharCap;
  const includeFiles = options.includeFiles ?? cfg.includeFiles;

  const currency = project.currency ?? 'RUB';
  const lines: string[] = [];

  // ── 1. Project core ──────────────────────────────────────────────────────
  lines.push(`Проект: ${project.name}`);
  lines.push(
    `Отрасль: ${project.industry ?? 'не указана'} · Стадия: ${project.stage ?? 'не указана'}`,
  );
  const equityStr = project.equityOffered != null ? `${project.equityOffered}%` : '—';
  lines.push(
    `Раунд: ${fmtMoney(project.raiseAmount, currency)} за ${equityStr} · Min чек: ${fmtMoney(project.minCheck, currency)}`,
  );
  if (project.investorType) lines.push(`Тип инвестора: ${project.investorType}`);
  if (project.investmentTrack) lines.push(`Формат сделки: ${project.investmentTrack}`);

  // ── 2. Brief ─────────────────────────────────────────────────────────────
  const b = project.brief;
  if (b) {
    if (b.businessSummary) lines.push(`Бизнес: ${truncate(b.businessSummary, cfg.maxFieldLen)}`);
    if (b.monetization)    lines.push(`Монетизация: ${truncate(b.monetization, cfg.maxFieldLen)}`);
    if (b.investmentAsk)   lines.push(`Запрос инвестиций (бриф): ${truncate(b.investmentAsk, cfg.maxFieldLen)}`);

    // keyMetrics — это JSON-объект с числовыми KPI. Разворачиваем в строку
    // ключ=значение, чтобы AI мог сослаться на MRR/ARR/users/churn etc.
    const metrics = renderKeyValueJson(b.keyMetrics, cfg.maxFieldLen);
    if (metrics) lines.push(`Ключевые метрики (по брифу): ${metrics}`);

    // napkin — структурированный «бизнес на салфетке». Не только investorReturn —
    // всё что есть. Render как key=value compact list.
    const napkin = renderKeyValueJson(b.napkin, cfg.maxFieldLen);
    if (napkin) lines.push(`Бизнес на салфетке: ${napkin}`);

    const strengths = renderStringArray(b.strengths, 4);
    if (strengths) lines.push(`Сильные стороны: ${strengths}`);

    if (cfg.includeWeaknesses) {
      const weaknesses = renderStringArray(b.weaknesses, 4);
      if (weaknesses) lines.push(`Слабые места (готовить ответы): ${weaknesses}`);
    }

    if (cfg.includeMissingData) {
      const missing = renderStringArray(b.missingData, 4);
      if (missing) lines.push(`Не закрыто в брифе: ${missing}`);
    }

    if (cfg.includeInterviewAnswers && cfg.interviewAnswerLimit > 0) {
      const answers = renderInterviewAnswers(b.interviewAnswers, cfg.interviewAnswerLimit, cfg.maxFieldLen);
      if (answers.length > 0) {
        lines.push(`Ответы фаундера из AI-интервью (топ-${answers.length}):`);
        for (const a of answers) lines.push(`  • ${a}`);
      }
    }
  }

  // ── 3. InvestorTerms ─────────────────────────────────────────────────────
  const t = project.investorTerms;
  if (t) {
    const parts: string[] = [];
    if (t.amount != null)         parts.push(`сумма ${fmtMoney(t.amount, currency)}`);
    if (t.equityPercent != null)  parts.push(`доля ${t.equityPercent}%`);
    if (t.valuation != null)      parts.push(`оценка ${fmtMoney(t.valuation, currency)}`);
    if (t.instrument)             parts.push(`инструмент: ${t.instrument}`);
    if (t.expectedReturn)         parts.push(`доходность: ${truncate(t.expectedReturn, 80)}`);
    if (t.payback)                parts.push(`окупаемость: ${truncate(t.payback, 80)}`);
    if (parts.length > 0) lines.push(`Условия инвестирования: ${parts.join(' · ')}`);
    if (t.useOfFunds)   lines.push(`Use of funds: ${truncate(t.useOfFunds, cfg.maxFieldLen)}`);
    if (t.exitStrategy) lines.push(`Стратегия выхода: ${truncate(t.exitStrategy, cfg.maxFieldLen)}`);
  }

  // ── 4. Files (только metadata, БЕЗ содержимого) ──────────────────────────
  if (includeFiles && project.files.length > 0) {
    const fileLines = project.files.slice(0, 8).map((f) => {
      const kind = f.url ? 'link' : (shortMime(f.mimeType) ?? 'file');
      return `${f.originalName} · ${f.category} · ${kind}`;
    });
    lines.push(`Загруженные материалы проекта (${project.files.length}):`);
    for (const fl of fileLines) lines.push(`  • ${fl}`);
    if (project.files.length > fileLines.length) {
      lines.push(`  • … ещё ${project.files.length - fileLines.length}`);
    }
  }

  // ── 5. Hard cap ──────────────────────────────────────────────────────────
  return capBlock(lines.join('\n'), cap);
}

// Multi-project variant. Cap=5 проектов. Каждый проект форматится своим
// бюджетом; общий блок не превышает 5×perProjectCharCap + заголовки.
export function formatProjectsContextForAssistant(
  projects: LoadedProject[],
  options: FormatProjectContextOptions = {},
): string {
  const filtered = projects.filter(Boolean).slice(0, MAX_PROJECTS_IN_CONTEXT);
  if (filtered.length === 0) {
    return '— проект не выбран, работай как универсальный AI Sales Assistant Zapusk';
  }
  if (filtered.length === 1) {
    return formatProjectContextForAssistant(filtered[0], options);
  }
  const blocks = filtered.map((p, idx) => {
    const ctx = formatProjectContextForAssistant(p, options);
    return `=== Проект ${idx + 1} ===\n${ctx}`;
  });
  return [
    `В разговоре упоминаются ${filtered.length} проекта. AI должен ориентироваться по контексту реплики, какой из них активный.`,
    '',
    ...blocks,
  ].join('\n');
}

// DB loader. Один include — все relation'ы, которые нужны formatter'у.
// Возвращает LoadedProject (не Prisma row), чтобы тесты могли мокать.
// Lazy import prisma — иначе smoke-test'ы триггерят инициализацию Prisma client.
export async function loadProjectForContext(projectId: string): Promise<LoadedProject | null> {
  const { prisma } = await import('../db.js');
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      brief: true,
      investorTerms: true,
      files: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          originalName: true,
          category: true,
          mimeType: true,
          size: true,
          url: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    stage: row.stage,
    raiseAmount: row.raiseAmount,
    currency: row.currency,
    minCheck: row.minCheck,
    equityOffered: row.equityOffered,
    investorType: row.investorType,
    status: row.status,
    investmentTrack: row.investmentTrack,
    brief: row.brief
      ? {
          businessSummary: row.brief.businessSummary,
          monetization: row.brief.monetization,
          keyMetrics: row.brief.keyMetrics,
          investmentAsk: row.brief.investmentAsk,
          strengths: row.brief.strengths,
          weaknesses: row.brief.weaknesses,
          missingData: row.brief.missingData,
          napkin: row.brief.napkin,
          interviewAnswers: row.brief.interviewAnswers,
        }
      : null,
    investorTerms: row.investorTerms
      ? {
          amount: row.investorTerms.amount,
          equityPercent: row.investorTerms.equityPercent,
          valuation: row.investorTerms.valuation,
          instrument: row.investorTerms.instrument,
          useOfFunds: row.investorTerms.useOfFunds,
          exitStrategy: row.investorTerms.exitStrategy,
          expectedReturn: row.investorTerms.expectedReturn,
          payback: row.investorTerms.payback,
        }
      : null,
    files: row.files,
  };
}

export async function loadProjectsForContext(projectIds: string[]): Promise<LoadedProject[]> {
  const ids = projectIds.filter(Boolean).slice(0, MAX_PROJECTS_IN_CONTEXT);
  if (ids.length === 0) return [];
  // findMany сохранил бы порядок не гарантированно — поэтому грузим по id
  // и пересортируем в порядке аргумента.
  const rows = await Promise.all(ids.map((id) => loadProjectForContext(id)));
  return rows.filter((r): r is LoadedProject => r !== null);
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function fmtMoney(value: number | null | undefined, currency: string): string {
  if (value == null) return 'не указано';
  // Compact: 12000000 → 12 000 000 (без копеек, без валюты-prefix).
  const rounded = Math.round(value);
  const formatted = rounded.toLocaleString('ru-RU').replace(/ /g, ' ');
  return `${formatted} ${currency}`;
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

function capBlock(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return s.slice(0, cap - 1) + '…';
}

function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// JSON object → "key=value, key=value" (max N entries). Используется для
// keyMetrics, napkin. Если value — объект, render recursively shallow.
function renderKeyValueJson(raw: string | null | undefined, maxLen: number): string | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return null;
  const parts: string[] = [];
  for (const [k, v] of entries) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) continue;
      parts.push(`${k}=${truncate(trimmed, 80)}`);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${v}`);
    } else if (Array.isArray(v)) {
      const items = v.slice(0, 4).map((x) => (typeof x === 'string' ? truncate(x, 40) : JSON.stringify(x).slice(0, 40)));
      if (items.length > 0) parts.push(`${k}=[${items.join(' / ')}]`);
    } else if (typeof v === 'object') {
      // Shallow render — не уходим вниз.
      try {
        parts.push(`${k}=${truncate(JSON.stringify(v), 80)}`);
      } catch {
        // ignore unrenderable
      }
    }
  }
  if (parts.length === 0) return null;
  return truncate(parts.join(' · '), maxLen);
}

// JSON array of strings → "a; b; c" (max N).
function renderStringArray(raw: string | null | undefined, maxItems: number): string | null {
  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) return null;
  const items = parsed
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, maxItems)
    .map((x) => truncate(x.trim(), 120));
  if (items.length === 0) return null;
  return items.join('; ');
}

// JSON array of {question, answer, category?, savedAt?} → list of compact
// "Q: ... → A: ..." entries. Topology: top-N последних (по savedAt desc если есть).
function renderInterviewAnswers(
  raw: string | null | undefined,
  limit: number,
  maxFieldLen: number,
): string[] {
  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) return [];
  const entries = parsed
    .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object' && !Array.isArray(e))
    .map((e) => ({
      question: typeof e.question === 'string' ? e.question : '',
      answer: typeof e.answer === 'string' ? e.answer : '',
      category: typeof e.category === 'string' ? e.category : '',
      savedAt: typeof e.savedAt === 'string' ? e.savedAt : '',
    }))
    .filter((e) => e.question && e.answer);
  // Sort by savedAt desc when available; otherwise preserve input order.
  entries.sort((a, b) => {
    if (a.savedAt && b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
    return 0;
  });
  return entries.slice(0, limit).map((e) => {
    const cat = e.category ? ` [${e.category}]` : '';
    const q = truncate(e.question, 120);
    const a = truncate(e.answer, Math.max(120, maxFieldLen - q.length - 20));
    return `${q}${cat} → ${a}`;
  });
}

function shortMime(mime: string): string | null {
  if (!mime) return null;
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'XLSX';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'PPTX';
  if (mime === 'application/msword') return 'DOC';
  if (mime === 'application/vnd.ms-excel') return 'XLS';
  if (mime === 'application/vnd.ms-powerpoint') return 'PPT';
  if (mime === 'text/csv') return 'CSV';
  if (mime.startsWith('text/')) return 'TEXT';
  if (mime.startsWith('image/')) return 'IMG';
  if (mime === 'text/uri-list') return 'LINK';
  return mime.split('/').pop() ?? 'file';
}

// ─── Finance trigger detector (used by Sprint D financial-facts helper) ────

// Sprint 61 — список финансовых триггеров: если в transcript встречается одно
// из этих слов / лет, мы а) сильнее буст-уем retrieval на project-presentation
// и financial_question, б) инжектим высоко-приоритетный block с known facts.
// Регэксп case-insensitive, Cyrillic word boundary через Unicode-property
// lookaround (см. brand normalizer Sprint 53 — `\b` сломан для русского).
export const FINANCE_TRIGGER_PATTERNS: RegExp[] = [
  // RU revenue / profit / cost terms
  /(?<![\p{L}\p{N}])(выручк[аиеуой]+|прибыл[ьи]+|убыток|маржа|маржинальност[ьи]+|оборот|чист(?:ая|ой|ую))(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(расход[ыау]*|затрат[ыау]*|себестоимост[ьи]+|опекс|капекс)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(окупаемост[ьи]+|payback|ebitda|EBITDA|noi)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(оценк[аиеуой]+|valuation|кап(?:итализаци[яи])?|долю?|equity|доля)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(чек|раунд|round|инвестици[яиией]*|инвестировать|вложени[яейя]*)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(юнит[\s-]?эконом\w*|unit[\s-]?economic\w*|cac|ltv|arpu|mrr|arr|gmv|arpu|cpa)(?![\p{L}\p{N}])/giu,
  // Sprint 61.P1 — money/funds patterns (benchmark gap: "Use of funds",
  // "привлечённые деньги", "финмодель"). Без них detectFinancialQuestion
  // пропускал семантически финансовые запросы → financeBoost не срабатывал.
  /(?<![\p{L}\p{N}])(деньг[иам]+|финансы|финансир\w*|финмодел[ьи]+|финансов\w+)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(привлечё?нн\w+|use\s+of\s+funds|fund(?:ing|s)?|cash\s*flow)(?![\p{L}\p{N}])/giu,
  // Years 2024..2032
  /(?<![\p{L}\p{N}])20(2[4-9]|3[0-2])(?![\p{L}\p{N}])/gu,
  // EN
  /(?<![\p{L}\p{N}])(revenue|profit|loss|margin|payback|valuation|cap[\s-]?table|burn[\s-]?rate)(?![\p{L}\p{N}])/giu,
];

export function detectFinancialQuestion(text: string): boolean {
  if (!text) return false;
  for (const re of FINANCE_TRIGGER_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}
