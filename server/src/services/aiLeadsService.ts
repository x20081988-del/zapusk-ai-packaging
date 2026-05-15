export type AILeadStatus = 'HOT' | 'NEW' | 'WAITING' | 'CONTACTED';
export type AILeadChannel = 'AI_CALL' | 'TELEGRAM' | 'WHATSAPP' | 'AVITO' | 'FOLLOW_UP';
export type BriefingState = 'draft' | 'in_progress' | 'ready';

export interface AILeadInvestor {
  name: string;
  phone: string;
  checkRange: string;
  decisionWindow: string;
  profile: string;
}

export interface AILeadCommunication {
  id: string;
  channel: AILeadChannel;
  at: string;
  title: string;
  body: string;
  outcome: string;
}

export interface AILead {
  id: string;
  status: AILeadStatus;
  receivedAt: string;
  title: string;
  investor: AILeadInvestor;
  tags: string[];
  aiSummary: string;
  whatHappened: {
    summary: string;
    interest: string;
    objections: string[];
    sent: string[];
    nextStep: string;
  };
  audio: {
    label: string;
    durationSec: number;
    url?: string;
  };
  communications: AILeadCommunication[];
}

export interface BriefingBreakdownItem {
  label: string;
  percent: number;
  state: 'complete' | 'partial' | 'missing';
}

export interface BriefingReadiness {
  state: BriefingState;
  percent: number;
  criticalReady: boolean;
  extracted: Array<{ label: string; value: string; confidence: number }>;
  missing: Array<{ category: string; question: string; critical: boolean }>;
  breakdown: BriefingBreakdownItem[];
}

export interface InvestorStrategy {
  positioning: string;
  keyTriggers: string[];
  icpInvestors: string[];
}

export interface AILeadKpis {
  totalLeads: number;
  activeToday: number;
  avgCheck: string;
  callsToday: number;
  messagesSent: number;
}

export interface LeadReplacementPolicy {
  title: string;
  minimumTargetLeads: number;
  description: string;
  replacementTriggers: string[];
  contactAttempts: number;
  disclaimers: string[];
}

// Sprint 27 — mode разделяет «реальный пустой кабинет», «реальный кабинет с
// лидами» и «демо-витрину Главснаб». UI решает по mode, что показывать.
// • empty — active кабинет, leads ещё не запущены (или их 0 в БД)
// • live  — active кабинет, есть реальные лиды (когда сделаем persistence)
// • demo  — demo workspace или /demo/* showcase, мок-данные легитимны
export type AILeadsMode = 'empty' | 'live' | 'demo';

export interface AILeadsDashboard {
  mode: AILeadsMode;
  projectId: string | null;
  projectName: string;
  onboarding: {
    title: string;
    description: string;
    cta: string;
    launchEnabled: boolean;
    launchLabel: string;
  };
  readiness: BriefingReadiness;
  strategy: InvestorStrategy;
  kpis: AILeadKpis;
  replacementPolicy: LeadReplacementPolicy;
  leads: AILead[];
}

export interface LeadProviderOptions {
  /** true = пользователь в demo workspace (Sprint 24) — можно показать mock-лиды. */
  demoMode?: boolean;
}

export interface LeadProvider {
  getDashboard(
    project: ProjectForAILeads | null,
    options?: LeadProviderOptions,
  ): Promise<AILeadsDashboard>;
}

export interface AICommunicationProvider {
  listCommunications(leadId: string): Promise<AILeadCommunication[]>;
}

export interface TranscriptProvider {
  getRecordingTranscript(leadId: string): Promise<string | null>;
}

export interface LeadReplacementPolicyProvider {
  getPolicy(): LeadReplacementPolicy;
}

export interface ProjectForAILeads {
  id: string;
  name: string;
  industry: string | null;
  stage: string | null;
  raiseAmount: number | null;
  minCheck: number | null;
  equityOffered: number | null;
  files: Array<{ id: string; category: string }>;
  brief: {
    version: number;
    businessSummary: string | null;
    monetization: string | null;
    keyMetrics: string | null;
    investmentAsk: string | null;
    missingData: string | null;
    missingByCategory: string | null;
    napkin: string | null;
  } | null;
}

class ContractLeadReplacementPolicy implements LeadReplacementPolicyProvider {
  getPolicy(): LeadReplacementPolicy {
    return {
      title: 'Минимум 50 целевых лидов',
      minimumTargetLeads: 50,
      description: 'Если контакт не подтверждает интерес или не выходит на связь, такой лид заменяется. Это гарантия количества целевых лидов, а не гарантия инвестиций.',
      contactAttempts: 5,
      replacementTriggers: [
        'инвестор не отвечает после серии касаний',
        'не подтверждает интерес к инвестициям',
        'отказывается от инвестиций',
        'не выходит на связь 7 дней',
        'контакт ошибочный или повторный',
      ],
      disclaimers: [
        'не гарантируем факт инвестирования',
        'не гарантируем доходность проекта',
        'передаём только квалифицированный интерес и контекст общения',
      ],
    };
  }
}

class MockAILeadsProvider implements LeadProvider {
  private policy = new ContractLeadReplacementPolicy();

  async getDashboard(
    project: ProjectForAILeads | null,
    options: LeadProviderOptions = {},
  ): Promise<AILeadsDashboard> {
    const readiness = buildReadiness(project);
    const demoMode = Boolean(options.demoMode);
    // Sprint 27 — mock-лиды и demo-KPI остаются ТОЛЬКО для demo workspace
    // (Sprint 24) и /demo/* витрин. Реальный active кабинет получает пустое
    // состояние: leads=[], kpis=0/0/0. Никаких fake-completed states в боевом
    // кабинете.
    const leads = demoMode ? mockLeads(project?.name ?? 'ваш проект') : [];
    const mode: AILeadsMode = demoMode ? 'demo' : 'empty';

    return {
      mode,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'Проект не выбран',
      onboarding: this.onboardingFor(mode, readiness),
      readiness,
      strategy: buildStrategy(project),
      kpis: demoMode
        ? { totalLeads: leads.length, activeToday: 7, avgCheck: '2,8 млн ₽', callsToday: 43, messagesSent: 128 }
        : { totalLeads: 0, activeToday: 0, avgCheck: '—', callsToday: 0, messagesSent: 0 },
      replacementPolicy: this.policy.getPolicy(),
      leads,
    };
  }

  private onboardingFor(mode: AILeadsMode, readiness: BriefingReadiness) {
    if (mode === 'demo') {
      return {
        title: readiness.criticalReady ? 'AI начал поиск инвесторов' : 'Подготовьте AI к поиску инвесторов',
        description: readiness.criticalReady
          ? 'AI-агенты используют ваш бриф, investor profile и сценарии коммуникации, чтобы ежедневно приводить заинтересованных инвесторов.'
          : 'AI изучит материалы проекта, подготовит сценарии коммуникации и начнёт привлекать инвесторов после завершения briefing.',
        cta: readiness.criticalReady ? 'Запустить AI-привлечение инвесторов' : 'Заполнить бриф',
        launchEnabled: readiness.criticalReady,
        launchLabel: readiness.criticalReady
          ? 'Запустить AI-привлечение инвесторов'
          : 'Запуск AI-лидов станет доступен после завершения briefing',
      };
    }
    // empty / live: честная коммуникация — мы ничего не делаем, пока не дойдём
    // до этапа AI-leads в pipeline проекта. Никаких «43 звонка сегодня».
    return {
      title: readiness.criticalReady ? 'Готовы запустить AI-лидогенерацию' : 'AI-лидогенерация откроется позже',
      description: readiness.criticalReady
        ? 'Бриф готов. После согласования упаковки и юридической части мы запустим AI-каналы — звонки, мессенджеры, follow-up.'
        : 'Заполните бриф проекта — без него AI не сможет квалифицировать инвесторов и презентовать сделку.',
      cta: readiness.criticalReady ? 'Запросить запуск у менеджера' : 'Заполнить бриф',
      launchEnabled: false,
      launchLabel: readiness.criticalReady
        ? 'Запуск AI-лидов согласовывает менеджер после готовности упаковки'
        : 'Запуск AI-лидов откроется после завершения брифа и упаковки',
    };
  }
}

export const leadProvider: LeadProvider = new MockAILeadsProvider();

function buildReadiness(project: ProjectForAILeads | null): BriefingReadiness {
  if (!project) {
    return {
      state: 'draft',
      percent: 12,
      criticalReady: false,
      extracted: [],
      missing: [
        { category: 'project', question: 'Создайте проект и загрузите исходные материалы', critical: true },
        { category: 'investment_offer', question: 'Укажите сумму привлечения и минимальный чек', critical: true },
      ],
      breakdown: breakdown(10, 0, 0, 0),
    };
  }

  const missingFromBrief = parseJsonArray(project.brief?.missingData).slice(0, 5);
  const hasBrief = Boolean(project.brief);
  const hasFiles = project.files.length > 0;
  const legal = project.name && (project.industry || project.stage) ? 100 : project.name ? 70 : 20;
  const finance = score([
    Boolean(project.raiseAmount),
    Boolean(project.minCheck),
    Boolean(project.equityOffered),
    Boolean(project.brief?.investmentAsk),
    Boolean(project.brief?.keyMetrics),
  ]);
  const marketing = score([
    Boolean(project.industry),
    hasFiles,
    Boolean(project.brief?.businessSummary),
    Boolean(project.brief?.monetization),
  ]);
  const offer = score([
    Boolean(project.raiseAmount),
    Boolean(project.minCheck),
    Boolean(project.equityOffered),
    Boolean(project.brief?.napkin),
  ]);
  const percent = Math.round((legal + finance + marketing + offer) / 4);
  const criticalReady = hasBrief && finance >= 60 && offer >= 60;

  const missing = [
    ...(!project.minCheck ? [{ category: 'investment_offer', question: 'Минимальный чек инвестора', critical: true }] : []),
    ...(!project.raiseAmount ? [{ category: 'finance', question: 'Сумма раунда', critical: true }] : []),
    ...(!project.equityOffered ? [{ category: 'investment_offer', question: 'Структура сделки и доля', critical: true }] : []),
    ...(!project.brief?.keyMetrics ? [{ category: 'unit_econ', question: 'Юнит-экономика, LTV/CAC и маржинальность', critical: false }] : []),
    ...missingFromBrief.map((question) => ({ category: 'brief', question, critical: false })),
  ].slice(0, 7);

  return {
    state: criticalReady ? 'ready' : hasFiles || hasBrief ? 'in_progress' : 'draft',
    percent,
    criticalReady,
    extracted: [
      { label: 'Название проекта', value: project.name, confidence: 98 },
      { label: 'Отрасль', value: project.industry ?? 'не найдена', confidence: project.industry ? 86 : 28 },
      { label: 'Стадия', value: project.stage ?? 'не найдена', confidence: project.stage ? 74 : 22 },
      { label: 'Сумма раунда', value: project.raiseAmount ? `${formatMoney(project.raiseAmount)} ₽` : 'не найдена', confidence: project.raiseAmount ? 82 : 18 },
      { label: 'Минимальный чек', value: project.minCheck ? `${formatMoney(project.minCheck)} ₽` : 'не найден', confidence: project.minCheck ? 79 : 18 },
    ],
    missing,
    breakdown: breakdown(legal, finance, marketing, offer),
  };
}

function buildStrategy(project: ProjectForAILeads | null): InvestorStrategy {
  const projectName = project?.name ?? 'проекта';
  return {
    positioning: `AI будет продавать ${projectName} через понятную инвестору связку: сумма входа, логика возврата капитала, контроль рисков и следующий шаг к созвону.`,
    keyTriggers: ['cashflow', 'дивиденды', 'рост', 'pre-IPO', 'недвижимость', 'AI', 'экспорт', 'контроль рисков'],
    icpInvestors: [
      'частные инвесторы с чеком от 1 млн ₽',
      'предприниматели с действующим бизнесом',
      'инвесторы, которые уже покупали доли / займы / недвижимость',
      'партнёры, которым нужен понятный cashflow и прозрачный контроль',
    ],
  };
}

// Sprint 35 P1 — demo leads больше НЕ содержат реальных телефонов, имён и
// ссылок на external CRM (aicallscloud.ru). Это синтетические данные с тем же
// shape, что и реальный feed, но без PII: маскированные телефоны, синтетические
// имена «Инвестор А/Б/В…», recording URL ведёт на локальный demo-asset.
// На UI присутствует пометка «Это демонстрационные данные, не реальные лиды».
function mockLeads(projectName: string): AILead[] {
  const now = Date.now();
  // Локальная заглушка. Если в /public/demo-assets/recordings/{id}.wav файла
  // нет — плеер просто не воспроизведёт, без 404 на внешний сервис.
  const recording = (id: string) => `/demo-assets/recordings/${id}.wav`;

  type Seed = {
    id: string;
    status: AILeadStatus;
    minutesAgo: number;
    name: string;
    phone: string;
    check: string;
    horizon: string;
    profile: string;
    tags: string[];
    summary: string;
    detail: string;
    objection?: string;
    nextStep: string;
    sent: string[];
    recordingId: string;
    durationSec: number;
  };

  const seeds: Seed[] = [
    {
      id: 'lead-victor', status: 'HOT', minutesAgo: 6,
      name: 'Инвестор А.', phone: '+7 9** ***-**-22',
      check: 'от 1 млн ₽', horizon: 'в течение недели', profile: 'готов к взаимодействию',
      tags: ['HOT', 'READY FOR CALL'],
      summary: 'Предложение заинтересовало, готов перейти к звонку со специалистом.',
      detail: 'Подтвердил интерес и комфортный чек. Решение готов принять в течение недели.',
      nextStep: 'Согласовать время созвона с фаундером',
      sent: ['короткое резюме сделки', 'инвестиционное предложение'],
      recordingId: '661a66bd-9c5d-4e97-8294-b9edd9af9a90', durationSec: 168,
    },
    {
      id: 'lead-tatiana', status: 'HOT', minutesAgo: 22,
      name: 'Инвестор Б.', phone: '+7 9** ***-**-41',
      check: 'от 1 млн ₽', horizon: '1-2 недели', profile: 'готова к взаимодействию',
      tags: ['HOT', 'QUALIFIED'],
      summary: 'Подтвердила интерес. Хочет понять условия и порядок выплат до созвона.',
      detail: 'Готова обсуждать условия в горизонте двух недель. Спрашивает про дивидендный сценарий.',
      nextStep: 'Отправить условия и предложить Zoom',
      sent: ['условия сделки', 'FAQ инвестора'],
      recordingId: '11faebc3-9d1e-4256-960a-8389fc9f1e0d', durationSec: 184,
    },
    {
      id: 'lead-alexey', status: 'HOT', minutesAgo: 41,
      name: 'Инвестор В.', phone: '+7 9** ***-**-64',
      check: 'от 1 млн ₽', horizon: 'до 30 дней', profile: 'ждёт звонок специалиста',
      tags: ['HOT', 'AWAITING CALL'],
      summary: 'Интерес подтверждён, ожидает звонок специалиста для уточнения деталей сделки.',
      detail: 'AI зафиксировал готовность. Контакт открыт к звонку без дополнительных материалов до созвона.',
      nextStep: 'Назначить звонок специалиста в течение 24 часов',
      sent: ['короткий teaser'],
      recordingId: 'd2a0157d-8e93-418f-87c7-a864832665b7', durationSec: 152,
    },
    {
      id: 'lead-ilya', status: 'WAITING', minutesAgo: 73,
      name: 'Инвестор Г.', phone: '+7 9** ***-**-03',
      check: '1-5 млн ₽', horizon: 'до 30 дней', profile: 'просит сначала материалы',
      tags: ['MATERIALS REQUESTED', 'WARM'],
      summary: 'Интерес подтверждён. Сначала хочет изучить материалы, дальше готов обсуждать.',
      detail: 'Готов к диалогу после получения презентации и one-pager. Диапазон чека выше базового.',
      nextStep: 'Отправить пакет материалов и follow-up через 2 дня',
      sent: ['презентация', 'one-pager', 'follow-up план'],
      recordingId: '71863075-3bcf-4ee1-9089-58fc7e2a8252', durationSec: 198,
    },
    {
      id: 'lead-unknown-30d', status: 'WAITING', minutesAgo: 110,
      name: 'Без имени · уточняется', phone: '+7 9** ***-**-92',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'просит сначала материалы',
      tags: ['MATERIALS REQUESTED'],
      summary: 'Заинтересовался предложением, запросил пакет материалов перед обсуждением.',
      detail: 'Готов к дальнейшему взаимодействию после изучения материалов.',
      nextStep: 'Отправить материалы и зафиксировать контакт-имя',
      sent: ['презентация', 'инвестиционное предложение'],
      recordingId: 'bec44e43-40ba-45cc-9003-de5401263d1d', durationSec: 142,
    },
    {
      id: 'lead-unknown-guarantees', status: 'WAITING', minutesAgo: 148,
      name: 'Без имени · уточняется', phone: '+7 9** ***-**-90',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'интересуют гарантии',
      tags: ['GUARANTEES', 'AWAITING CALL'],
      summary: 'Заинтересовался предложением. Хочет обсудить гарантии со специалистом.',
      objection: 'Просит подробно разобрать гарантии и обязательства сторон.',
      detail: 'Готов к звонку со специалистом. Базовый чек подходит, но решение зависит от ответов по защите капитала.',
      nextStep: 'Назначить звонок и проговорить блок гарантий',
      sent: ['блок гарантий', 'юридическое резюме'],
      recordingId: '26721cca-9aa4-49cf-9d53-b2add193934d', durationSec: 176,
    },
    {
      id: 'lead-evgeny', status: 'NEW', minutesAgo: 195,
      name: 'Инвестор Д.', phone: '+7 9** ***-**-73',
      check: '1,5 млн ₽', horizon: 'в начале весны', profile: 'готов в ближайшее время',
      tags: ['QUALIFIED', 'WARM'],
      summary: 'Подтвердил чек 1,5 млн ₽. Готов к диалогу ближе к началу весны.',
      detail: 'Срок указан конкретно — комфортно для долгосрочного планирования.',
      nextStep: 'Поставить напоминание и обновить материалы к сезону',
      sent: ['резюме сделки'],
      recordingId: '27b663ac-13f1-4ea9-a055-afb92da195b4', durationSec: 158,
    },
    {
      id: 'lead-mikhail', status: 'WAITING', minutesAgo: 247,
      name: 'Инвестор Е.', phone: '+7 9** ***-**-11',
      check: '1 млн ₽', horizon: 'в начале весны', profile: 'вопросы по конфиденциальности',
      tags: ['CONFIDENTIALITY', 'WARM'],
      summary: 'Интерес подтверждён. Беспокоят вопросы конфиденциальности проекта.',
      objection: 'Хочет понять, как защищена информация по проекту и его участникам.',
      detail: 'Готов к взаимодействию после ответов по NDA и обращению с данными.',
      nextStep: 'Отправить блок NDA и расписать конфиденциальность',
      sent: ['NDA шаблон', 'политика обращения с данными'],
      recordingId: '97450f75-0cf0-43f4-8df3-869b2643a0be', durationSec: 191,
    },
    {
      id: 'lead-german', status: 'HOT', minutesAgo: 312,
      name: 'Инвестор Ж.', phone: '+7 9** ***-**-72',
      check: '1 млн ₽', horizon: '1-2 недели', profile: 'согласовал слот на 28.02 11:00',
      tags: ['HOT', 'SCHEDULED'],
      summary: 'Согласовал конкретный слот для созвона: 28.02, первая половина дня, 11:00.',
      detail: 'Один из самых горячих лидов — слот зафиксирован, чек подтверждён.',
      nextStep: 'Подтвердить созвон 28.02 в 11:00 и подготовить материалы',
      sent: ['календарное приглашение', 'короткое резюме сделки'],
      recordingId: '2194b766-5848-4074-8e1b-39e7f5529c5b', durationSec: 207,
    },
    {
      id: 'lead-kostroma', status: 'WAITING', minutesAgo: 388,
      name: 'Без имени · уточняется', phone: '+7 9** ***-**-31',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'хочет обсудить договор',
      tags: ['CONTRACT REVIEW', 'TIMEZONE'],
      summary: 'Заинтересовался. Из Костромы, знает Главснаб. Хочет проговорить договор инвестирования.',
      objection: 'Сомневается в гарантиях, требует разбор договора инвестирования.',
      detail: 'Контактен. Учесть разницу часовых поясов +8: сейчас не в городе. Знаком с экосистемой Главснаба.',
      nextStep: 'Отправить договор, согласовать звонок с учётом часового пояса',
      sent: ['договор инвестирования', 'кейс Главснаба'],
      recordingId: '58e85dc8-d2f5-4b91-8660-52ccc10ff11e', durationSec: 224,
    },
    {
      id: 'lead-vitaly', status: 'NEW', minutesAgo: 456,
      name: 'Инвестор З.', phone: '+7 9** ***-**-52',
      check: '1 млн ₽', horizon: '1 месяц', profile: 'готов к взаимодействию',
      tags: ['QUALIFIED'],
      summary: 'Подтвердил интерес и базовый чек 1 млн ₽ с горизонтом одного месяца.',
      detail: 'Стандартный профиль квалифицированного лида: чек подтверждён, срок понятен, готов общаться.',
      nextStep: 'Отправить материалы и поставить follow-up через 5 дней',
      sent: ['презентация', 'one-pager'],
      recordingId: '8a56aa3b-379b-420a-993c-5b42c3120ed2', durationSec: 165,
    },
  ];

  return seeds.map((seed) => ({
    id: seed.id,
    status: seed.status,
    receivedAt: new Date(now - seed.minutesAgo * 60_000).toISOString(),
    title: `Квалифицированный лид · ${seed.name}`,
    investor: {
      name: seed.name,
      phone: seed.phone,
      checkRange: seed.check,
      decisionWindow: seed.horizon,
      profile: seed.profile,
    },
    tags: seed.tags,
    aiSummary: seed.summary,
    whatHappened: {
      summary: seed.detail,
      interest: seed.profile,
      objections: seed.objection ? [seed.objection] : [],
      sent: seed.sent,
      nextStep: seed.nextStep,
    },
    audio: {
      label: `Запись AI-разговора · ${seed.name}`,
      durationSec: seed.durationSec,
      url: recording(seed.recordingId),
    },
    communications: communicationsFor(seed, projectName, now),
  }));
}

function communicationsFor(seed: { id: string; minutesAgo: number; sent: string[] }, projectName: string, now: number): AILeadCommunication[] {
  const base = now - seed.minutesAgo * 60_000;
  return [
    {
      id: `${seed.id}-call`,
      channel: 'AI_CALL',
      at: new Date(base).toISOString(),
      title: 'AI-звонок',
      body: `AI коротко презентовал ${projectName}, проверил опыт инвестиций и подтвердил комфортный чек.`,
      outcome: 'контакт подтвердил интерес',
    },
    {
      id: `${seed.id}-tg`,
      channel: 'TELEGRAM',
      at: new Date(base + 14 * 60_000).toISOString(),
      title: 'Сообщение в мессенджер',
      body: `Отправлены: ${seed.sent.join(', ')}.`,
      outcome: 'материалы доставлены',
    },
    {
      id: `${seed.id}-follow`,
      channel: 'FOLLOW_UP',
      at: new Date(base + 36 * 60_000).toISOString(),
      title: 'Follow-up',
      body: 'AI зафиксировал next step и поставил напоминание на повторное касание.',
      outcome: 'ожидаем ответа инвестора',
    },
  ];
}

// Legacy lead() helper removed — mockLeads() now builds AILeads directly from
// production-shaped seeds with real recording URLs.

function score(items: boolean[]): number {
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}

function breakdown(legal: number, finance: number, marketing: number, offer: number): BriefingBreakdownItem[] {
  return [
    { label: 'Юридический блок', percent: legal, state: stateFor(legal) },
    { label: 'Финансы', percent: finance, state: stateFor(finance) },
    { label: 'Маркетинг', percent: marketing, state: stateFor(marketing) },
    { label: 'Investment offer', percent: offer, state: stateFor(offer) },
  ];
}

function stateFor(percent: number): BriefingBreakdownItem['state'] {
  if (percent >= 85) return 'complete';
  if (percent >= 45) return 'partial';
  return 'missing';
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}
