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

export interface AILeadsDashboard {
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

export interface LeadProvider {
  getDashboard(project: ProjectForAILeads | null): Promise<AILeadsDashboard>;
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

  async getDashboard(project: ProjectForAILeads | null): Promise<AILeadsDashboard> {
    const readiness = buildReadiness(project);
    const leads = mockLeads(project?.name ?? 'ваш проект');
    return {
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'Проект не выбран',
      onboarding: {
        title: readiness.criticalReady ? 'AI начал поиск инвесторов' : 'Подготовьте AI к поиску инвесторов',
        description: readiness.criticalReady
          ? 'AI-агенты используют ваш бриф, investor profile и сценарии коммуникации, чтобы ежедневно приводить заинтересованных инвесторов.'
          : 'AI изучит материалы проекта, подготовит сценарии коммуникации и начнёт привлекать инвесторов после завершения briefing.',
        cta: readiness.criticalReady ? 'Запустить AI-привлечение инвесторов' : 'Заполнить бриф',
        launchEnabled: readiness.criticalReady,
        launchLabel: readiness.criticalReady
          ? 'Запустить AI-привлечение инвесторов'
          : 'Запуск AI-лидов станет доступен после завершения briefing',
      },
      readiness,
      strategy: buildStrategy(project),
      kpis: {
        totalLeads: leads.length,
        activeToday: 7,
        avgCheck: '2,8 млн ₽',
        callsToday: 43,
        messagesSent: 128,
      },
      replacementPolicy: this.policy.getPolicy(),
      leads,
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

function mockLeads(projectName: string): AILead[] {
  const now = Date.now();
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  return [
    lead('lead-001', 'HOT', 7, 'Алексей Морозов', '+7 921 440-18-03', '1-5 млн ₽', 'в течение 14 дней', 'готов инвестировать', projectName, [
      'AI заинтересовал инвестора понятной окупаемостью и контролем рисков.',
      'Инвестор попросил короткие материалы и готов к Zoom на этой неделе.',
      'Возражение: хочет увидеть юридическую структуру сделки.',
    ], ['one-pager', 'финансовая модель', 'короткое резюме сделки']),
    lead('lead-002', 'NEW', 18, 'Марина Котова', '+7 985 120-44-91', 'от 1 млн ₽', '30 дней', 'интерес к дивидендам', projectName, [
      'Инвестор пришла из базы предпринимателей, интересуется регулярными выплатами.',
      'AI объяснил сценарий cashflow и отправил презентацию.',
      'Нужно уточнить, комфортен ли формат доли вместо займа.',
    ], ['презентация', 'FAQ инвестора']),
    lead('lead-003', 'WAITING', 34, 'Игорь Самойлов', '+7 911 803-77-12', '500 тыс - 1 млн ₽', 'после изучения', 'просит кейсы', projectName, [
      'Инвестор запросил кейсы похожих проектов и примеры выплат.',
      'AI отправил teaser и договорился вернуться после изучения.',
      'Следующее касание назначено на завтра утром.',
    ], ['тизер', 'кейсы', 'follow-up']),
    lead('lead-004', 'CONTACTED', 58, 'Екатерина Громова', '+7 916 444-20-18', '3-7 млн ₽', 'в течение 30 дней', 'интерес к pre-IPO', projectName, [
      'Инвестор смотрит private equity и pre-IPO сделки.',
      'AI сфокусировал разговор на росте стоимости доли и прозрачной отчётности.',
      'Просит Zoom с фаундером и документы по структуре владения.',
    ], ['pitch deck', 'юридическая структура']),
    lead('lead-005', 'HOT', 76, 'Руслан Шайхутдинов', '+7 937 220-91-54', 'от 5 млн ₽', '10 дней', 'готов к созвону', projectName, [
      'Инвестор прямо спросил, как зайти в сделку и кто контролирует деньги.',
      'AI отработал риск через отчётность и предложил созвон с командой.',
      'Нужно отправить календарь и подтвердить минимальный чек.',
    ], ['календарь', 'инвестиционное резюме']),
    lead('lead-006', 'NEW', 93, 'Ольга Воронова', '+7 999 551-31-07', '1-2 млн ₽', '45 дней', 'интерес к AI', projectName, [
      'Инвестор реагирует на AI/tech угол и хочет понять масштабируемость.',
      'AI отправил ссылку на посадочную и короткое описание модели.',
      'Следующий шаг: показать юнит-экономику и рынок.',
    ], ['посадочная', 'one-pager']),
    lead('lead-007', 'WAITING', 125, 'Дмитрий Егоров', '+7 903 118-09-64', 'от 1 млн ₽', 'не раньше месяца', 'сомнение по рискам', projectName, [
      'Инвестор заинтересован, но опасается сроков возврата.',
      'AI зафиксировал возражение и отправил блок рисков.',
      'Если не ответит 7 дней, контакт попадёт в замену.',
    ], ['risk FAQ']),
    lead('lead-008', 'CONTACTED', 164, 'Анна Белова', '+7 926 480-77-30', '1-5 млн ₽', 'после Zoom', 'просит Zoom', projectName, [
      'Инвестор попросила не присылать много файлов до разговора.',
      'AI согласовал формат: 20 минут, экономика и next step.',
      'Команде нужно выбрать слот.',
    ], ['краткий teaser']),
    lead('lead-009', 'NEW', 212, 'Павел Романов', '+7 921 770-42-70', '500 тыс - 1,5 млн ₽', '30 дней', 'не ответил', projectName, [
      'AI дозвонился, инвестор попросил написать в мессенджер.',
      'Отправлено короткое сообщение и презентация.',
      'Пока нет подтверждения интереса, в работе follow-up.',
    ], ['Telegram follow-up']),
    lead('lead-010', 'HOT', 246, 'Сергей Ким', '+7 985 991-28-02', 'от 10 млн ₽', 'в течение недели', 'готов инвестировать', projectName, [
      'Инвестор имеет опыт в займах и долях, интересуется контролем денег.',
      'AI сразу перевёл разговор в структуру сделки и next step.',
      'Нужен звонок с фаундером и финмодель.',
    ], ['финансовая модель', 'deck']),
    lead('lead-011', 'WAITING', 310, 'Наталья Соколова', '+7 916 008-45-90', '1-3 млн ₽', 'после материалов', 'запросила материалы', projectName, [
      'Инвестор запросила материалы без звонка.',
      'AI уточнил, какие критерии она будет проверять.',
      'Отправлены презентация, FAQ и follow-up вопрос.',
    ], ['презентация', 'FAQ', 'follow-up']),
    lead('lead-012', 'CONTACTED', 385, 'Владимир Орлов', '+7 981 204-16-33', 'от 1 млн ₽', '60 дней', 'интерес к экспорту', projectName, [
      'Инвестор ищет проекты с экспортным или региональным расширением.',
      'AI показал сценарий роста и попросил подтвердить чек.',
      'Ответ ожидается после изучения рынка.',
    ], ['рынок', 'стратегия роста']),
  ].map((item, index) => ({
    ...item,
    receivedAt: minutesAgo([7, 18, 34, 58, 76, 93, 125, 164, 212, 246, 310, 385][index] ?? 10),
  }));
}

function lead(
  id: string,
  status: AILeadStatus,
  _minutesAgo: number,
  name: string,
  phone: string,
  checkRange: string,
  decisionWindow: string,
  profile: string,
  projectName: string,
  facts: string[],
  sent: string[],
): AILead {
  const channelPlan: AILeadCommunication[] = [
    {
      id: `${id}-call`,
      channel: 'AI_CALL',
      at: new Date(Date.now() - 52 * 60_000).toISOString(),
      title: 'AI-звонок',
      body: `AI коротко презентовал ${projectName}, проверил опыт инвестиций и комфортный чек.`,
      outcome: 'контакт подтвердил интерес',
    },
    {
      id: `${id}-tg`,
      channel: 'TELEGRAM',
      at: new Date(Date.now() - 41 * 60_000).toISOString(),
      title: 'Telegram сообщение',
      body: 'Отправлен короткий teaser и вопрос о критериях принятия решения.',
      outcome: 'сообщение доставлено',
    },
    {
      id: `${id}-follow`,
      channel: 'FOLLOW_UP',
      at: new Date(Date.now() - 25 * 60_000).toISOString(),
      title: 'Follow-up',
      body: 'AI зафиксировал next step и предложил слот для разговора с командой.',
      outcome: 'ожидаем подтверждение',
    },
  ];

  return {
    id,
    status,
    receivedAt: new Date().toISOString(),
    title: 'Новый квалифицированный лид',
    investor: { name, phone, checkRange, decisionWindow, profile },
    aiSummary: facts[0] ?? 'AI заинтересовал инвестора предложением проекта.',
    whatHappened: {
      summary: facts[1] ?? 'Инвестор запросил материалы и готов обсудить проект после изучения.',
      interest: profile,
      objections: facts[2] ? [facts[2]] : [],
      sent,
      nextStep: status === 'HOT' ? 'Назначить созвон с фаундером' : 'Дождаться ответа и сделать follow-up',
    },
    audio: {
      label: 'Запись AI-разговора',
      durationSec: 140 + id.charCodeAt(id.length - 1) * 2,
    },
    communications: channelPlan,
  };
}

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
