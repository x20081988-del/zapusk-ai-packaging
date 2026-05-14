import type { Project, InvestmentTrack, PackagingJob } from './api';

// Sprint 21 — «Путь привлечения инвестиций».
//
// Каждый проект выбирает один из 6 форматов привлечения инвестиций. Под
// формат система строит набор этапов (юр. упаковка, маркетинговая упаковка,
// подготовка к инвесторам, генерация инвесторов, размещение и сделка). Для
// каждого этапа — список пунктов (Stage Items) с двумя источниками статуса:
//   • статус из реальных данных проекта (файлы, бриф, packagingJob'ы)
//   • человеческий handover-флаг (AI собрал черновик / специалист проверяет)
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
  id: string;
  title: string;
  /** Зачем нужен этап — 1 строка под заголовком. */
  subtitle: string;
  items: StageItem[];
}

export interface TrackBuild {
  track: InvestmentTrack;
  trackLabel: string;
  trackHint: string;
  stages: Stage[];
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
  'ожидает_информацию': 'Ждём данные',
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

/**
 * Собирает путь привлечения инвестиций для проекта.
 * Учитывает выбранный трек + актуальное состояние проекта (файлы, бриф, job'ы).
 */
export function buildInvestmentJourney(project: Project, jobs: PackagingJob[] = []): TrackBuild {
  const track = project.investmentTrack ?? 'packaging_only';
  const ctx = deriveContext(project, jobs);

  const stages: Stage[] = [];
  // Юр. упаковка зависит от трека. Для «только_упаковка» полностью скрываем.
  const legal = buildLegalStage(track, ctx);
  if (legal) stages.push(legal);

  stages.push(buildPackagingStage(ctx));
  stages.push(buildInvestorPrepStage(ctx));

  // Генерация инвесторов и размещение — только если трек подразумевает реальное привлечение.
  if (track !== 'packaging_only') {
    stages.push(buildInvestorGenStage(ctx));
    stages.push(buildPlacementStage(track, ctx));
  }

  return {
    track,
    trackLabel: trackLabel(track),
    trackHint: trackHint(track),
    stages,
  };
}

// ─── Stage builders ───────────────────────────────────────────────────────

function buildLegalStage(track: InvestmentTrack, ctx: Context): Stage | null {
  if (track === 'packaging_only') return null;

  const items: StageItem[] = [];

  // Общие для всех инвестиционных треков
  items.push({
    id: 'legal_structure',
    title: 'Структура сделки',
    hint: 'Юрист готовит описание формата привлечения и распределения долей.',
    by: 'юрист',
    status: ctx.hasInvestmentTerms ? 'на_проверке' : 'в_работе',
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
    items,
  };
}

function buildPackagingStage(ctx: Context): Stage {
  return {
    id: 'packaging',
    title: 'Маркетинговая упаковка',
    subtitle: 'Материалы, которые увидят инвесторы',
    items: [
      {
        id: 'positioning',
        title: 'Позиционирование проекта',
        hint: 'Бриф + бизнес на салфетке — основа всей упаковки.',
        by: 'AI',
        status: !ctx.hasBrief ? 'ожидает_информацию'
          : ctx.hasBriefMissing ? 'в_работе'
          : 'готово',
      },
      {
        id: 'pitch_deck',
        title: 'Инвестиционная презентация',
        hint: 'Деки в формате PDF и веб-страницы.',
        by: 'AI',
        status: jobStatus(ctx, ['pitch_deck', 'pitch_structure'], 'команда_упаковки'),
      },
      {
        id: 'financial_model',
        title: 'Финансовая модель',
        hint: 'AI-черновик → проверяет финансовый аналитик.',
        by: 'аналитик',
        status: jobStatus(ctx, ['financial_model', 'calculator'], 'аналитик'),
      },
      {
        id: 'landing',
        title: 'Посадочная страница',
        hint: 'Лендинг с investor blocks и AI Discoverability.',
        by: 'команда_упаковки',
        status: jobStatus(ctx, ['landing'], 'команда_упаковки'),
      },
      {
        id: 'one_pager',
        title: 'Ванпейджер',
        hint: 'Одностраничник для рассылки инвестору.',
        by: 'команда_упаковки',
        status: jobStatus(ctx, ['one_pager'], 'команда_упаковки'),
      },
      {
        id: 'investor_faq',
        title: 'Investor FAQ',
        hint: 'Готовые ответы на 12-15 ключевых вопросов.',
        by: 'AI',
        status: jobStatus(ctx, ['faq'], 'менеджер'),
      },
    ],
  };
}

function buildInvestorPrepStage(ctx: Context): Stage {
  return {
    id: 'investor_prep',
    title: 'Подготовка к инвесторам',
    subtitle: 'Готовим основателя и материалы к разговору с инвесторами',
    items: [
      {
        id: 'founder_interview',
        title: 'Интервью с основателем',
        hint: 'Зафиксировать историю, цифры, мотивацию.',
        by: 'менеджер',
        status: ctx.hasInterview ? 'готово' : 'ожидает_информацию',
      },
      {
        id: 'sales_prep',
        title: 'AI-подготовка к встречам',
        hint: 'Live co-pilot по SPIN + эмоциональный слой.',
        by: 'AI',
        status: jobStatus(ctx, ['sales_assistant'], 'менеджер'),
      },
      {
        id: 'objections',
        title: 'Работа с возражениями инвесторов',
        hint: 'AI разбор переговоров после каждой встречи.',
        by: 'AI',
        status: ctx.hasMeetings ? 'в_работе' : 'не_начато',
      },
      {
        id: 'ai_discoverability',
        title: 'AI Discoverability',
        hint: 'Видимость материалов проекта в AI search engines.',
        by: 'AI',
        status: jobStatus(ctx, ['ai_visibility_report'], 'команда_упаковки'),
      },
    ],
  };
}

function buildInvestorGenStage(ctx: Context): Stage {
  return {
    id: 'investor_gen',
    title: 'Работа с инвесторами',
    subtitle: 'Привлекаем поток инвесторов и квалифицируем интерес',
    items: [
      { id: 'ai_leads', title: 'AI-лиды', hint: 'AI звонит и квалифицирует инвесторов из базы.', by: 'AI', status: ctx.hasLeadsRunning ? 'в_работе' : 'не_начато' },
      { id: 'pr', title: 'PR и статьи', hint: 'Публикации в профильных медиа.', by: 'PR_специалист', status: 'не_начато' },
      { id: 'bloggers', title: 'Работа с блогерами', hint: 'Эфиры и обзоры у тематических авторов.', by: 'PR_специалист', status: 'не_начато' },
      { id: 'streams', title: 'Прямые эфиры', hint: 'Эфир по базе инвесторов с фаундером.', by: 'менеджер', status: 'не_начато' },
      { id: 'investor_clubs', title: 'Инвестклубы', hint: 'Презентации проекта в закрытых клубах инвесторов.', by: 'менеджер', status: 'не_начато' },
      { id: 'investor_base', title: 'Работа с базой инвесторов', hint: 'Холодные касания и follow-up по тёплым контактам.', by: 'менеджер', status: 'не_начато' },
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
    items,
  };
}

// ─── Контекст из project state ────────────────────────────────────────────

interface Context {
  hasBrief: boolean;
  hasBriefMissing: boolean;
  hasInterview: boolean;
  hasInvestmentTerms: boolean;
  hasMeetings: boolean;
  hasLeadsRunning: boolean;
  jobs: PackagingJob[];
}

function deriveContext(project: Project, jobs: PackagingJob[]): Context {
  const brief = project.brief ?? null;
  const missing = brief?.missingData ? safeArray(brief.missingData) : [];
  const missingByCat = brief?.missingByCategory ? safeRecord(brief.missingByCategory) : {};
  const totalMissing = Object.values(missingByCat).flatMap((v) => Array.isArray(v) ? v : []).length || missing.length;
  return {
    hasBrief: Boolean(brief),
    hasBriefMissing: totalMissing > 0,
    hasInterview: Boolean(brief?.interviewAnswers && brief.interviewAnswers.length > 4),
    hasInvestmentTerms: false, // TODO: подключить project.investorTerms когда схема будет полная
    hasMeetings: false, // TODO: SalesSession lookup; для MVP — false (это просто не_начато)
    hasLeadsRunning: false, // TODO: signal с AI Leads dashboard
    jobs,
  };
}

function safeArray(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function safeRecord(raw: string): Record<string, unknown> {
  try { const v = JSON.parse(raw); return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
}

/** Маппинг succeeded packaging job'ов в человеческий статус пункта. */
function jobStatus(ctx: Context, outputTypes: string[], _reviewer: Handover): ItemStatus {
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

  // Вес статусов в processed формат: «готово» = 1, «на_проверке» = 0.85,
  // «в_работе» = 0.45, «ожидает_информацию» = 0.2, «не_начато»/«заблокировано» = 0.
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
        // не_начато / заблокировано: 0
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
