import type { Project, InvestmentTrack, PackagingJob } from './api';

// Sprint 21 + Sprint 28 — «Путь привлечения инвестиций».
//
// Sprint 21 заложил архитектуру: builder выводит статус каждого пункта из
// реальных данных проекта (brief, files, packaging jobs). Sprint 28 добавил
// stage-level gating и убрал hardcoded defaults:
//   • новый проект больше не показывает «юридическая упаковка в работе»
//     до выбора трека и готовности упаковки;
//   • каждый этап имеет собственный статус (готово / в работе / заблокировано);
//   • этапы 2..6 закрыты, пока не готов предыдущий, и items в закрытых этапах
//     получают `заблокировано`;
//   • brand-new project помечается явно — UI рендерит empty-hero.
//
// Это не CRM и не админка — это «операционная система привлечения инвестиций»,
// которую видит фаундер.

// ─── Типы ─────────────────────────────────────────────────────────────────

export type ItemStatus =
  | 'не_начато'
  | 'в_работе'
  | 'ожидает_информацию'
  | 'на_проверке'
  | 'готово'
  | 'заблокировано';

/** Кто отвечает за пункт. AI — собирает черновик / артефакт; специалист — проверяет. */
export type Handover = 'AI' | 'аналитик' | 'юрист' | 'менеджер' | 'команда_упаковки' | 'PR_специалист' | 'фаундер';

export interface StageItem {
  id: string;
  title: string;
  /** Опционально — короткое описание под title. */
  hint?: string;
  /** Кто делает / проверяет — рендерится handover-бейджом. */
  by: Handover;
  /** Динамический статус — вычисляется из project state. */
  status: ItemStatus;
}

export interface Stage {
  id: StageId;
  title: string;
  /** Зачем нужен этап — 1 строка под заголовком. */
  subtitle: string;
  items: StageItem[];
  /** Sprint 28: агрегатный статус этапа (вычисляется из items + gating). */
  status: ItemStatus;
  /** Sprint 28: false = этап заблокирован, его items получают `заблокировано`. */
  unlocked: boolean;
  /** Sprint 28: подсказка про разблокировку (показываем когда unlocked=false). */
  lockHint?: string;
  /** Sprint 28: короткое CTA по этапу (рендерится на карточке стадии). */
  primaryCta?: { label: string };
}

export type StageId =
  | 'brief'
  | 'packaging'
  | 'legal'
  | 'ai_leads'
  | 'meetings'
  | 'placement';

export interface TrackBuild {
  track: InvestmentTrack;
  trackLabel: string;
  trackHint: string;
  stages: Stage[];
  /** Sprint 28: brand-new проект — нет брифа, файлов и job'ов. UI показывает empty-hero. */
  isBrandNew: boolean;
}

// ─── Лейблы треков ────────────────────────────────────────────────────────

export const TRACK_OPTIONS: Array<{ id: InvestmentTrack; label: string; hint: string }> = [
  { id: 'shareholding', label: 'Акционирование / размещение акций', hint: 'Выпуск акций, регистратор, размещение на платформе' },
  { id: 'llc_share', label: 'Продажа доли ООО', hint: 'Корпоративное соглашение, договоры, без эмиссии' },
  { id: 'convertible', label: 'Конвертируемый займ', hint: 'Term sheet, условия конвертации, investor docs' },
  { id: 'safe', label: 'SAFE / инвестиционный договор', hint: 'Простая форма, конвертация при следующем раунде' },
  { id: 'pre_ipo', label: 'Pre-IPO', hint: 'Подготовка к публичному размещению, аудит, due diligence' },
  { id: 'packaging_only', label: 'Только упаковка проекта', hint: 'Без планов размещения сейчас — собираем материалы' },
];

export function trackLabel(track: InvestmentTrack | null): string {
  if (!track) return 'Формат привлечения ещё не выбран';
  return TRACK_OPTIONS.find((t) => t.id === track)?.label ?? track;
}

export function trackHint(track: InvestmentTrack | null): string {
  if (!track) return 'Выберите формат, чтобы система собрала под него этапы привлечения.';
  return TRACK_OPTIONS.find((t) => t.id === track)?.hint ?? '';
}

// ─── Лейблы статусов и handover'ов ─────────────────────────────────────────

export const STATUS_LABEL: Record<ItemStatus, string> = {
  'не_начато': 'Не начато',
  'в_работе': 'В работе',
  'ожидает_информацию': 'Ожидаем данные',
  'на_проверке': 'На проверке',
  'готово': 'Готово',
  'заблокировано': 'Заблокировано',
};

export const STATUS_TONE: Record<ItemStatus, 'neutral' | 'ai' | 'warning' | 'success' | 'danger'> = {
  'не_начато': 'neutral',
  'в_работе': 'ai',
  'ожидает_информацию': 'warning',
  'на_проверке': 'ai',
  'готово': 'success',
  'заблокировано': 'danger',
};

export const HANDOVER_LABEL: Record<Handover, string> = {
  AI: 'AI собирает',
  аналитик: 'Финансовый аналитик',
  юрист: 'Юрист',
  менеджер: 'Менеджер ZAPUSK AI',
  команда_упаковки: 'Команда упаковки',
  PR_специалист: 'PR-специалист',
  фаундер: 'Команда проекта',
};

export const HANDOVER_TONE: Record<Handover, 'ai' | 'success' | 'zapusk' | 'warning' | 'info'> = {
  AI: 'ai',
  аналитик: 'success',
  юрист: 'success',
  менеджер: 'zapusk',
  команда_упаковки: 'zapusk',
  PR_специалист: 'info',
  фаундер: 'warning',
};

// ─── Builder ──────────────────────────────────────────────────────────────

export interface JourneyOptions {
  /** Sprint 28: количество встреч с инвесторами по проекту (из listMeetings). */
  meetingsCount?: number;
  /** Sprint 28: запущена ли AI-лидогенерация (из /api/ai-leads.mode === 'live'). */
  leadsLaunched?: boolean;
}

/**
 * Собирает путь привлечения инвестиций для проекта. Sprint 28:
 *  1. Каждый этап получает items со статусами из реального state.
 *  2. Stage-level статус выводится из items + gating-правил.
 *  3. Закрытые stages пробрасывают `заблокировано` всем items.
 *  4. Track `packaging_only` показывает только этапы 1-2.
 */
export function buildInvestmentJourney(
  project: Project,
  jobs: PackagingJob[] = [],
  options: JourneyOptions = {},
): TrackBuild {
  const track = project.investmentTrack ?? 'packaging_only';
  const ctx = deriveContext(project, jobs, options);

  // Сначала собираем «сырые» этапы — items со статусами по data, без gating.
  const stages: Stage[] = [];
  stages.push(buildBriefStage(ctx));
  stages.push(buildPackagingStage(ctx));

  if (track !== 'packaging_only') {
    const legal = buildLegalStage(track, ctx);
    if (legal) stages.push(legal);
    stages.push(buildAILeadsStage(ctx));
    stages.push(buildMeetingsStage(ctx));
    stages.push(buildPlacementStage(track, ctx));
  }

  // Sprint 28: gating. Каждый этап знает, что должно быть готово перед ним.
  // Если предыдущий этап не done — текущий = заблокировано, items.status тоже.
  const briefDone = isStageDone(stages.find((s) => s.id === 'brief'));
  const packagingDone = isStageDone(stages.find((s) => s.id === 'packaging'));
  const legalDone = isStageDone(stages.find((s) => s.id === 'legal'));
  const aiLeadsHasResults = ctx.hasMeetings || ctx.hasLeadsRunning;

  for (const stage of stages) {
    if (stage.id === 'brief') continue;
    if (stage.id === 'packaging' && !briefDone) {
      lockStage(stage, 'Откроется после готовности брифа');
    } else if (stage.id === 'legal' && !packagingDone) {
      lockStage(stage, 'Откроется после готовности маркетинговой упаковки');
    } else if (stage.id === 'ai_leads' && !packagingDone) {
      lockStage(stage, 'Откроется после готовности маркетинговой упаковки');
    } else if (stage.id === 'meetings' && !aiLeadsHasResults && !ctx.hasLeadsRunning) {
      lockStage(stage, 'Откроется после первых AI-лидов');
    } else if (stage.id === 'placement' && !(legalDone && (aiLeadsHasResults || ctx.hasMeetings))) {
      lockStage(stage, 'Откроется после юридической упаковки и первых инвесторов');
    }
  }

  // Финальный проход — вычислить stage.status из items.
  for (const stage of stages) {
    stage.status = computeStageStatus(stage);
    stage.primaryCta = primaryCtaFor(stage, ctx);
  }

  return {
    track,
    trackLabel: trackLabel(track),
    trackHint: trackHint(track),
    stages,
    isBrandNew: ctx.isBrandNew,
  };
}

// ─── Stage builders ───────────────────────────────────────────────────────

function buildBriefStage(ctx: Context): Stage {
  // Sprint 28: бриф — этап 1, всегда активен. Статус items зависит от brief'а.
  const positioningStatus: ItemStatus = !ctx.hasBrief
    ? 'ожидает_информацию'
    : ctx.hasBriefMissing
      ? 'в_работе'
      : 'готово';

  return {
    id: 'brief',
    title: 'Бриф проекта',
    subtitle: 'Экономика, команда, инвестиционный запрос — основа всей упаковки',
    status: 'не_начато', // перезаписывается в финальном проходе
    unlocked: true,
    items: [
      {
        id: 'project_data',
        title: 'Базовые данные проекта',
        hint: 'Название, отрасль, стадия, размер раунда и доля.',
        by: 'фаундер',
        status: ctx.hasBasicProjectData ? 'готово' : 'ожидает_информацию',
      },
      {
        id: 'positioning',
        title: 'Позиционирование и бизнес на салфетке',
        hint: 'AI собирает на основе материалов и базовых данных.',
        by: 'AI',
        status: positioningStatus,
      },
      {
        id: 'missing_questions',
        title: 'Закрыть открытые вопросы брифа',
        hint: 'Уточнить юнит-экономику, команду и риски в интервью.',
        by: 'фаундер',
        status: !ctx.hasBrief
          ? 'не_начато'
          : ctx.hasBriefMissing
            ? 'ожидает_информацию'
            : 'готово',
      },
      {
        id: 'founder_interview',
        title: 'Интервью с основателем',
        hint: 'Зафиксировать историю, цифры, мотивацию.',
        by: 'менеджер',
        status: ctx.hasInterview ? 'готово' : ctx.hasBrief ? 'не_начато' : 'не_начато',
      },
    ],
  };
}

function buildPackagingStage(ctx: Context): Stage {
  return {
    id: 'packaging',
    title: 'Маркетинговая упаковка',
    subtitle: 'Презентация, посадочная, финмодель и one-pager под инвестора',
    status: 'не_начато',
    unlocked: true,
    items: [
      {
        id: 'pitch_deck',
        title: 'Инвестиционная презентация',
        hint: 'Деки в формате PDF и веб-страницы.',
        by: 'AI',
        status: jobStatus(ctx, ['pitch_deck', 'pitch_structure']),
      },
      {
        id: 'financial_model',
        title: 'Финансовая модель',
        hint: 'AI-черновик → проверяет финансовый аналитик.',
        by: 'аналитик',
        status: jobStatus(ctx, ['financial_model', 'calculator']),
      },
      {
        id: 'landing',
        title: 'Посадочная страница',
        hint: 'Лендинг с инвесторскими блоками и видимостью в AI-поиске.',
        by: 'команда_упаковки',
        status: jobStatus(ctx, ['landing']),
      },
      {
        id: 'one_pager',
        title: 'Ванпейджер',
        hint: 'Одностраничник для рассылки инвестору.',
        by: 'команда_упаковки',
        status: jobStatus(ctx, ['one_pager']),
      },
      {
        id: 'investor_faq',
        title: 'Investor FAQ',
        hint: 'Готовые ответы на 12-15 ключевых вопросов.',
        by: 'AI',
        status: jobStatus(ctx, ['faq']),
      },
      {
        id: 'ai_discoverability',
        title: 'Видимость в AI-поиске',
        hint: 'Видимость материалов проекта в AI-поисковиках.',
        by: 'AI',
        status: jobStatus(ctx, ['ai_visibility_report']),
      },
    ],
  };
}

function buildLegalStage(track: InvestmentTrack, _ctx: Context): Stage | null {
  if (track === 'packaging_only') return null;

  // Sprint 28: legal_structure больше НЕ дефолтится в «в_работе». Без явных
  // условий — `не_начато`. Stage-gating сделает её `заблокировано`, пока
  // packaging не готово.
  const items: StageItem[] = [];

  items.push({
    id: 'legal_structure',
    title: 'Структура сделки',
    hint: 'Юрист готовит описание формата привлечения и распределения долей.',
    by: 'юрист',
    status: 'не_начато',
  });

  if (track === 'shareholding' || track === 'pre_ipo') {
    items.push(
      { id: 'shares_issue', title: 'Выпуск акций', hint: 'Решение об эмиссии, проспект, регистрация.', by: 'юрист', status: 'не_начато' },
      { id: 'registrar', title: 'Регистратор', hint: 'Договор с регистратором, ведение реестра акционеров.', by: 'юрист', status: 'не_начато' },
      { id: 'shareholder_agreement', title: 'Акционерное соглашение', hint: 'Условия между фаундерами и инвесторами.', by: 'юрист', status: 'не_начато' },
    );
  }

  if (track === 'llc_share') {
    items.push(
      { id: 'llc_agreement', title: 'Корпоративное соглашение', hint: 'Соглашение участников ООО, правила голосования и выходов.', by: 'юрист', status: 'не_начато' },
      { id: 'sale_contracts', title: 'Договоры купли-продажи доли', hint: 'Шаблон договора для каждого инвестора.', by: 'юрист', status: 'не_начато' },
      { id: 'legal_dd', title: 'Legal due diligence', hint: 'Проверка чистоты юрлица перед сделкой.', by: 'юрист', status: 'не_начато' },
    );
  }

  if (track === 'convertible') {
    items.push(
      { id: 'term_sheet', title: 'Term Sheet', hint: 'Условия конвертации, дисконт, cap.', by: 'юрист', status: 'не_начато' },
      { id: 'loan_docs', title: 'Договор займа', hint: 'Подписываемый шаблон для инвестора.', by: 'юрист', status: 'не_начато' },
      { id: 'convert_logic', title: 'Логика конвертации / возврата', hint: 'Триггеры, проценты, условия выкупа.', by: 'юрист', status: 'не_начато' },
    );
  }

  if (track === 'safe') {
    items.push(
      { id: 'safe_form', title: 'Форма SAFE', hint: 'Шаблон договора SAFE под российскую юрисдикцию.', by: 'юрист', status: 'не_начато' },
      { id: 'safe_conversion', title: 'Условия конвертации', hint: 'Триггер: следующий раунд / выход / дата.', by: 'юрист', status: 'не_начато' },
    );
  }

  if (track === 'pre_ipo') {
    items.push(
      { id: 'audit', title: 'Финансовый аудит', hint: 'Подготовка отчётности под публичное размещение.', by: 'аналитик', status: 'не_начато' },
      { id: 'corporate_docs', title: 'Корпоративные документы', hint: 'Устав, кодекс, политики раскрытия.', by: 'юрист', status: 'не_начато' },
    );
  }

  return {
    id: 'legal',
    title: 'Юридическая упаковка',
    subtitle: 'Структура сделки и документы под выбранный формат привлечения',
    status: 'не_начато',
    unlocked: true,
    items,
  };
}

function buildAILeadsStage(ctx: Context): Stage {
  return {
    id: 'ai_leads',
    title: 'AI-лиды',
    subtitle: 'AI приводит квалифицированных инвесторов по вашему профилю',
    status: 'не_начато',
    unlocked: true,
    items: [
      {
        id: 'ai_leads_launch',
        title: 'Запуск AI-каналов',
        hint: 'AI звонит и квалифицирует инвесторов из базы.',
        by: 'AI',
        status: ctx.hasLeadsRunning ? 'в_работе' : 'не_начато',
      },
      { id: 'pr', title: 'PR и статьи', hint: 'Публикации в профильных медиа.', by: 'PR_специалист', status: 'не_начато' },
      { id: 'bloggers', title: 'Работа с блогерами', hint: 'Эфиры и обзоры у тематических авторов.', by: 'PR_специалист', status: 'не_начато' },
      { id: 'streams', title: 'Прямые эфиры', hint: 'Эфир по базе инвесторов с фаундером.', by: 'менеджер', status: 'не_начато' },
      { id: 'investor_clubs', title: 'Инвестклубы', hint: 'Презентации проекта в закрытых клубах инвесторов.', by: 'менеджер', status: 'не_начато' },
      { id: 'investor_base', title: 'Работа с базой инвесторов', hint: 'Холодные касания и продолжение общения по тёплым контактам.', by: 'менеджер', status: 'не_начато' },
    ],
  };
}

function buildMeetingsStage(ctx: Context): Stage {
  return {
    id: 'meetings',
    title: 'Встречи с инвесторами',
    subtitle: 'Подготовка, проведение и разбор каждой встречи',
    status: 'не_начато',
    unlocked: true,
    items: [
      {
        id: 'sales_prep',
        title: 'AI-подготовка к встречам',
        hint: 'Live co-pilot по SPIN + эмоциональный слой.',
        by: 'AI',
        status: jobStatus(ctx, ['sales_assistant']),
      },
      {
        id: 'meetings_run',
        title: 'Проведение встреч',
        hint: 'Созвоны с инвесторами по проекту.',
        by: 'фаундер',
        status: ctx.hasMeetings ? 'в_работе' : 'не_начато',
      },
      {
        id: 'objections',
        title: 'AI-разбор переговоров',
        hint: 'Транскрипт, score, рекомендации после каждого звонка.',
        by: 'AI',
        status: ctx.hasMeetings ? 'в_работе' : 'не_начато',
      },
    ],
  };
}

function buildPlacementStage(track: InvestmentTrack, _ctx: Context): Stage {
  const items: StageItem[] = [];

  if (track === 'shareholding' || track === 'pre_ipo') {
    items.push({ id: 'platform_listing', title: 'Размещение на платформе', hint: 'Подача документов на инвестиционную платформу.', by: 'юрист', status: 'не_начато' });
    items.push({ id: 'booking', title: 'Бронирование акций', hint: 'Сбор заявок от инвесторов с фиксацией суммы.', by: 'менеджер', status: 'не_начато' });
  }

  if (track === 'llc_share' || track === 'convertible' || track === 'safe') {
    items.push({ id: 'investor_signing', title: 'Подписание с инвесторами', hint: 'Сопровождение сделки с каждым инвестором.', by: 'юрист', status: 'не_начато' });
  }

  items.push(
    { id: 'investor_support', title: 'Сопровождение инвесторов', hint: 'Команда ZAPUSK AI ведёт каждого инвестора до подписи.', by: 'менеджер', status: 'не_начато' },
    { id: 'close_deal', title: 'Закрытие сделки', hint: 'Фиксация финального состава инвесторов и суммы.', by: 'менеджер', status: 'не_начато' },
  );

  if (track === 'shareholding' || track === 'pre_ipo') {
    items.push({ id: 'secondary', title: 'Вторичный рынок', hint: 'Возможность инвесторам перепродавать акции.', by: 'юрист', status: 'не_начато' });
  }

  return {
    id: 'placement',
    title: 'Размещение и сделка',
    subtitle: 'Сопровождаем сделку до перевода средств и фиксации инвесторов',
    status: 'не_начато',
    unlocked: true,
    items,
  };
}

// ─── Контекст из project state ────────────────────────────────────────────

interface Context {
  isBrandNew: boolean;
  hasBasicProjectData: boolean;
  hasBrief: boolean;
  hasBriefMissing: boolean;
  hasInterview: boolean;
  hasMeetings: boolean;
  hasLeadsRunning: boolean;
  jobs: PackagingJob[];
}

function deriveContext(project: Project, jobs: PackagingJob[], options: JourneyOptions): Context {
  const brief = project.brief ?? null;
  const missing = brief?.missingData ? safeArray(brief.missingData) : [];
  const missingByCat = brief?.missingByCategory ? safeRecord(brief.missingByCategory) : {};
  const totalMissing = Object.values(missingByCat).flatMap((v) => Array.isArray(v) ? v : []).length || missing.length;

  // Sprint 28: hasBasicProjectData — заполнены ли базовые поля проекта.
  // Без этого AI не может даже черновик брифа собрать.
  const hasBasicProjectData = Boolean(
    project.industry && project.stage && (project.raiseAmount || project.minCheck),
  );

  const filesCount = project.files?.length ?? 0;
  const jobsCount = jobs.length;

  return {
    isBrandNew: !brief && filesCount === 0 && jobsCount === 0,
    hasBasicProjectData,
    hasBrief: Boolean(brief),
    hasBriefMissing: totalMissing > 0,
    hasInterview: Boolean(brief?.interviewAnswers && brief.interviewAnswers.length > 4),
    hasMeetings: (options.meetingsCount ?? 0) > 0,
    hasLeadsRunning: options.leadsLaunched ?? false,
    jobs,
  };
}

function safeArray(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function safeRecord(raw: string): Record<string, unknown> {
  try { const v = JSON.parse(raw); return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
}

/** Маппинг packaging job'ов в человеческий статус пункта. */
function jobStatus(ctx: Context, outputTypes: string[]): ItemStatus {
  const relevant = ctx.jobs.filter((j) => outputTypes.includes(j.outputType));
  if (relevant.length === 0) return 'не_начато';
  // Сначала ищем «готово» — succeeded с completedBy (закрыто специалистом).
  const closed = relevant.find((j) => j.status === 'succeeded' && j.completedBy);
  if (closed) return 'готово';
  // Awaiting manager — на проверке у команды ZAPUSK AI.
  const awaiting = relevant.find((j) => j.status === 'awaiting_manager');
  if (awaiting) return 'на_проверке';
  // Auto-succeeded (AI fast-path без manager review) — на проверке.
  const success = relevant.find((j) => j.status === 'succeeded');
  if (success) return 'на_проверке';
  // mock/failed — в работе.
  return 'в_работе';
}

// ─── Stage status & gating helpers ────────────────────────────────────────

function lockStage(stage: Stage, hint: string) {
  stage.unlocked = false;
  stage.lockHint = hint;
  for (const item of stage.items) item.status = 'заблокировано';
}

function isStageDone(stage: Stage | undefined): boolean {
  if (!stage) return false;
  if (!stage.unlocked) return false;
  // Stage готов, когда все items готовы (или на проверке — близко к готово).
  return stage.items.every((i) => i.status === 'готово' || i.status === 'на_проверке');
}

function computeStageStatus(stage: Stage): ItemStatus {
  if (!stage.unlocked) return 'заблокировано';
  const items = stage.items;
  if (items.length === 0) return 'не_начато';
  if (items.every((i) => i.status === 'готово')) return 'готово';
  if (items.some((i) => i.status === 'в_работе' || i.status === 'на_проверке')) {
    // Если хотя бы один на проверке, но всё остальное готово — стадия "на проверке".
    if (items.every((i) => i.status === 'готово' || i.status === 'на_проверке')) return 'на_проверке';
    return 'в_работе';
  }
  if (items.some((i) => i.status === 'ожидает_информацию')) return 'ожидает_информацию';
  return 'не_начато';
}

function primaryCtaFor(stage: Stage, ctx: Context): { label: string } | undefined {
  if (!stage.unlocked) return undefined;
  switch (stage.id) {
    case 'brief':
      if (!ctx.hasBrief) return { label: 'Заполнить бриф' };
      if (ctx.hasBriefMissing) return { label: 'Продолжить бриф' };
      return { label: 'Открыть бриф' };
    case 'packaging':
      return stage.status === 'готово' ? { label: 'Посмотреть материалы' } : { label: 'Сформировать упаковку' };
    case 'legal':
      return stage.status === 'не_начато' ? { label: 'Выбрать формат' } : { label: 'Подготовить юр. структуру' };
    case 'ai_leads':
      return ctx.hasLeadsRunning ? { label: 'Посмотреть лиды' } : { label: 'Запустить AI-лиды' };
    case 'meetings':
      return ctx.hasMeetings ? { label: 'Разобрать переговоры' } : { label: 'Провести встречу' };
    case 'placement':
      return stage.status === 'готово' ? { label: 'Открыть размещение' } : { label: 'Подготовить размещение' };
  }
}

// ─── Высокоуровневые метрики ──────────────────────────────────────────────

export interface JourneyMetrics {
  /** 0..100 — общая готовность к привлечению инвестиций. */
  readiness: number;
  totalItems: number;
  doneItems: number;
  inProgressItems: number;
  needsActionItems: number;
}

export function computeJourneyMetrics(build: TrackBuild): JourneyMetrics {
  const items = build.stages.flatMap((s) => s.items);
  const total = items.length;
  let done = 0;
  let inProgress = 0;
  let needsAction = 0;

  // Вес статусов: «готово» = 1, «на_проверке» = 0.85, «в_работе» = 0.45,
  // «ожидает_информацию» = 0.2, «не_начато» / «заблокировано» = 0.
  let weighted = 0;
  for (const item of items) {
    switch (item.status) {
      case 'готово':
        done += 1;
        weighted += 1;
        break;
      case 'на_проверке':
        inProgress += 1;
        weighted += 0.85;
        break;
      case 'в_работе':
        inProgress += 1;
        weighted += 0.45;
        break;
      case 'ожидает_информацию':
        needsAction += 1;
        weighted += 0.2;
        break;
      default:
        break;
    }
  }
  const readiness = total === 0 ? 0 : Math.round((weighted / total) * 100);
  return { readiness, totalItems: total, doneItems: done, inProgressItems: inProgress, needsActionItems: needsAction };
}

/** Что требуется от команды проекта (производное от items.status === 'ожидает_информацию'). */
export function whatTeamMustDo(build: TrackBuild): StageItem[] {
  return build.stages.flatMap((s) => s.items).filter((i) => i.status === 'ожидает_информацию');
}

/** Что прямо сейчас делают AI и специалисты (in_progress + на_проверке). */
export function whatsHappeningNow(build: TrackBuild): StageItem[] {
  return build.stages.flatMap((s) => s.items).filter((i) => i.status === 'в_работе' || i.status === 'на_проверке');
}
