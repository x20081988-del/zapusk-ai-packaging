// Sprint 62.P14 — AI Outreach Engine reframed as a Signal Engine (демо, MOCK-ONLY).
//
// Рамка продукта: не «кому написать», а «почему стоит написать этому человеку
// именно сейчас». Главный объект системы — Signal (конкретный повод начать
// коммуникацию), НЕ Investor / Contact / Lead.
//
// Инварианты (перенесены из внешнего «TG-BOT + Outreach», Python/Telethon,
// который живёт отдельно и в этот репозиторий не входит):
//   • MOCK-ONLY (CLAUDE.md 5a): нет реального Telegram, чтения чатов, баз и токенов.
//   • Агент сам не пишет: готовит черновик, отправляет человек руками.
//   • Нет доказательств, что человек инвестор → не называем его инвестором.
//   • Нет сигнала → нет холодного аутрича. Черновик всегда привязан к signal_id.
//   • Скоринг — качественный (high/medium/low/unknown fit), не точная вероятность.
//   • Стиль черновика: короткий русский, кавычки «ёлочки», без буквы «е-с-точками»,
//     без длинного тире, без обещаний доходности / иксов / ликвидности.

// ── типы контакта (дисциплина: не путать инвестора и фаундера) ──────────────
export type ContactType =
  | 'investor'
  | 'fund'
  | 'founder'
  | 'partner'
  | 'media'
  | 'expert'
  | 'past_relationship'
  | 'unknown';

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  investor: 'инвестор',
  fund: 'фонд',
  founder: 'фаундер',
  partner: 'партнёр',
  media: 'медиа / канал',
  expert: 'эксперт',
  past_relationship: 'прошлый контакт',
  unknown: 'не подтверждён',
};

export function contactTypeTone(t: ContactType): 'ai' | 'zapusk' | 'info' | 'neutral' | 'warning' {
  if (t === 'investor' || t === 'fund') return 'ai';
  if (t === 'founder') return 'zapusk';
  if (t === 'partner' || t === 'expert') return 'info';
  if (t === 'past_relationship') return 'warning';
  return 'neutral';
}

// ── типы сигнала (повод) ────────────────────────────────────────────────────
export type SignalType =
  | 'discussing_investments'
  | 'seeking_projects'
  | 'seeking_lp'
  | 'pre_ipo'
  | 'ipo_ma_funds'
  | 'seeking_capital'
  | 'seeking_partners'
  | 'invested_similar'
  | 'relevant_chat'
  | 'topic_comment'
  | 'past_zoom'
  | 'long_silence'
  | 'agreed_call'
  | 'we_didnt_reply';

export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  discussing_investments: 'обсуждает инвестиции',
  seeking_projects: 'ищет проекты',
  seeking_lp: 'ищет LP',
  pre_ipo: 'обсуждает pre-IPO',
  ipo_ma_funds: 'пишет про IPO / M&A / фонды',
  seeking_capital: 'ищет капитал',
  seeking_partners: 'ищет партнёров',
  invested_similar: 'инвестировал в похожую компанию',
  relevant_chat: 'в релевантном чате',
  topic_comment: 'комментарий в нужной теме',
  past_zoom: 'уже был на Zoom',
  long_silence: 'давно не было контакта',
  agreed_call: 'была договорённость созвониться',
  we_didnt_reply: 'писал последним, мы не ответили',
};

// ── источник сигнала ────────────────────────────────────────────────────────
export type SignalSource =
  | 'telegram_chat'
  | 'channel_comment'
  | 'investor_base'
  | 'past_dialog'
  | 'zoom_history'
  | 'crm'
  | 'manual';

export const SOURCE_LABEL: Record<SignalSource, string> = {
  telegram_chat: 'Telegram-чат',
  channel_comment: 'комментарий в канале',
  investor_base: 'база инвесторов',
  past_dialog: 'прошлый диалог',
  zoom_history: 'история Zoom',
  crm: 'CRM',
  manual: 'вручную',
};

export type Confidence = 'high' | 'medium' | 'low';
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'высокая',
  medium: 'средняя',
  low: 'низкая',
};
export function confidenceTone(c: Confidence): 'success' | 'warning' | 'neutral' {
  return c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'neutral';
}

// откуда контакт: уже в базе vs новый.
export type Origin = 'existing_base' | 'new_contact';

// приоритет повода (из экспорта реальных сигналов, Sprint 62.P16).
export type Priority = 'high' | 'medium' | 'low';
export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'высокий приоритет',
  medium: 'средний приоритет',
  low: 'низкий приоритет',
};
export function priorityTone(p: Priority): 'danger' | 'warning' | 'neutral' {
  return p === 'high' ? 'danger' : p === 'medium' ? 'warning' : 'neutral';
}

// ── воронка Zoom Pipeline ───────────────────────────────────────────────────
export type PipelineStage =
  | 'signal'
  | 'outreach'
  | 'reply'
  | 'zoom_scheduled'
  | 'zoom_done'
  | 'follow_up'
  | 'deal';

export const PIPELINE_ORDER: PipelineStage[] = [
  'signal', 'outreach', 'reply', 'zoom_scheduled', 'zoom_done', 'follow_up', 'deal',
];
export const PIPELINE_LABEL: Record<PipelineStage, string> = {
  signal: 'Сигнал',
  outreach: 'Аутрич',
  reply: 'Ответ',
  zoom_scheduled: 'Zoom назначен',
  zoom_done: 'Zoom проведён',
  follow_up: 'Фоллоу-ап',
  deal: 'Сделка / партнёрство',
};

// ── главный объект: Signal ──────────────────────────────────────────────────
export interface Signal {
  id: string;
  contactName: string;
  contactType: ContactType;
  signalType: SignalType;
  signalSource: SignalSource;
  // 5 вопросов карточки:
  signalText: string;          // 1. что произошло (как есть)
  whyFound: string;            // доказательство, почему сигнал засекли
  whyImportant: string;        // 2. почему это важно
  whyRelevant: string;         // 3. почему релевантно конкретному проекту
  actionRecommendation: string;// 4. что стоит сделать
  riskOfError: string;         // 5. какой риск ошибки
  nextStep: string;
  draftMessage?: string;       // черновик строится ОТ сигнала; нет повода писать как человеку → нет черновика
  confidence: Confidence;
  handle?: string;             // для deep-link; нет @ → не строим
  origin: Origin;
  projectFit: boolean;         // подходит ли под проект (для фильтра Project fit)
  pipelineStage: PipelineStage;
  ballOnOurSide?: boolean;     // мяч на нашей стороне (follow-up)
  whenToFollowUp?: string;     // когда писать повторно
  // Sprint 62.P16 — поля из экспорта реальных сигналов. В Safe Demo Mode
  // sourceLink/handle не показываются; sourceTitle уже обобщён в demo-файле.
  sourceTitle?: string;        // название источника (реальное в Owner / обобщённое в Demo)
  sourceLink?: string;         // ссылка на сообщение — ТОЛЬКО Owner Mode
  priority?: Priority;
}

// ── фильтры Signals Feed ────────────────────────────────────────────────────
export type SignalFilter =
  | 'all'
  | 'investors'
  | 'existing_base'
  | 'new_contacts'
  | 'telegram'
  | 'past_relationship'
  | 'follow_up'
  | 'project_fit';

export const FILTER_LABEL: Record<SignalFilter, string> = {
  all: 'Все',
  investors: 'Только инвесторы',
  existing_base: 'Существующая база',
  new_contacts: 'Новые контакты',
  telegram: 'Telegram-сигналы',
  past_relationship: 'Прошлые отношения',
  follow_up: 'Фоллоу-ап',
  project_fit: 'Подходит проекту',
};

const FOLLOW_UP_TYPES: SignalType[] = ['we_didnt_reply', 'agreed_call', 'long_silence', 'past_zoom'];

export function matchesFilter(s: Signal, f: SignalFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'investors': return s.contactType === 'investor' || s.contactType === 'fund';
    case 'existing_base': return s.origin === 'existing_base';
    case 'new_contacts': return s.origin === 'new_contact';
    case 'telegram': return s.signalSource === 'telegram_chat' || s.signalSource === 'channel_comment';
    case 'past_relationship':
      return s.contactType === 'past_relationship' || FOLLOW_UP_TYPES.includes(s.signalType);
    case 'follow_up':
      return Boolean(s.ballOnOurSide) || FOLLOW_UP_TYPES.includes(s.signalType);
    case 'project_fit': return s.projectFit;
  }
}

// deep-link на чат. Только при наличии @handle. Отправляет человек, авто-отправки нет.
export function chatDeepLink(handle: string | undefined, draft: string | undefined): string | null {
  if (!handle || !draft) return null;
  return `https://t.me/${handle}?text=${encodeURIComponent(draft)}`;
}

// ── Investor Fit (отдельный экран, не главный) ──────────────────────────────
// Качественная оценка похожести на целевого инвестора проекта. НЕ точная вероятность.
export type FitLevel = 'high_fit' | 'medium_fit' | 'low_fit' | 'unknown';
export const FIT_LABEL: Record<FitLevel, string> = {
  high_fit: 'высокая',
  medium_fit: 'средняя',
  low_fit: 'низкая',
  unknown: 'неизвестно',
};
export function fitTone(f: FitLevel): 'success' | 'zapusk' | 'warning' | 'neutral' {
  if (f === 'high_fit') return 'success';
  if (f === 'medium_fit') return 'zapusk';
  if (f === 'low_fit') return 'warning';
  return 'neutral';
}

export interface InvestorFit {
  id: string;
  contactName: string;
  contactType: ContactType;
  fit: FitLevel;
  explanation: string;
  matchingTopics: string[];
  similarInvestors: string[];
  riskOfError: string;
}

export interface InvestorICP {
  projectName: string;
  summary: string;
  traits: string[];
  topThemes: string[];
}

export const PROJECT_ICP: InvestorICP = {
  projectName: 'НеоГемовет',
  summary:
    'Целевой инвестор проекта — ангел или небольшой фонд из MedTech / ветеринарного комьюнити с чеком 1-3 млн, который уже заходил в смежные сделки и принимает решение за 2-4 недели.',
  traits: [
    'Чек 1-3 млн рублей',
    'Решение за 2-4 недели',
    'Опыт в MedTech или ветеринарии',
    'Уже инвестировал в смежные проекты',
  ],
  topThemes: ['MedTech', 'ветеринарная диагностика', 'импортозамещение реагентов', 'private equity ранних стадий'],
};

// ── Ядро продукта: обучение на реальных сделках проекта ──────────────────────
// Модель учится не только на тех, кто инвестировал, но и на тех, кто отказался,
// и строит модель инвестиционного решения именно для этого проекта. Это и есть
// то, что сложно повторить конкурентам. Цифры — синтетика для демо.
export interface DealLearning {
  dealsAnalyzed: number;
  invested: number;
  declined: number;
  questions: string[];   // на какие вопросы отвечает модель
  patterns: string[];    // что модель уже выявила
  lookalikeCount: number;// сколько контактов с похожим профилем найдено
}

export const DEAL_LEARNING: DealLearning = {
  dealsAnalyzed: 34,
  invested: 9,
  declined: 25,
  questions: [
    'Кто чаще всего инвестирует в подобные проекты?',
    'Какие темы и сигналы предшествуют инвестиции?',
    'Какие контакты чаще доходят до Zoom?',
    'Какие типы инвесторов регулярно отказываются?',
  ],
  patterns: [
    'Инвестировавшие почти всегда заходили после доказанного опыта в смежной нише.',
    'Отказы чаще приходили от фондов вне MedTech и при чеке выше 3 млн.',
    'До Zoom доходят контакты с активным обсуждением темы за 7-14 дней до захода.',
  ],
  lookalikeCount: 7,
};

// ── Learning Engine: какие сигналы реально конвертируются ───────────────────
// Относительные исторические показатели по демо-касаниям (НЕ прогноз по человеку).
export interface SignalPerformance {
  signalType: SignalType;
  replyRate: number;       // 0..100, относительно
  zoomRate: number;
  investmentRate: number;
  noise: 'low' | 'medium' | 'high';
}

export const SIGNAL_PERFORMANCE: SignalPerformance[] = [
  { signalType: 'invested_similar',        replyRate: 72, zoomRate: 48, investmentRate: 21, noise: 'low' },
  { signalType: 'we_didnt_reply',          replyRate: 64, zoomRate: 33, investmentRate: 12, noise: 'low' },
  { signalType: 'agreed_call',             replyRate: 61, zoomRate: 44, investmentRate: 15, noise: 'low' },
  { signalType: 'discussing_investments',  replyRate: 38, zoomRate: 19, investmentRate: 7,  noise: 'medium' },
  { signalType: 'past_zoom',               replyRate: 55, zoomRate: 30, investmentRate: 14, noise: 'low' },
  { signalType: 'topic_comment',           replyRate: 24, zoomRate: 9,  investmentRate: 3,  noise: 'high' },
  { signalType: 'relevant_chat',           replyRate: 18, zoomRate: 6,  investmentRate: 2,  noise: 'high' },
  { signalType: 'ipo_ma_funds',            replyRate: 14, zoomRate: 4,  investmentRate: 1,  noise: 'high' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — синтетика. Имена, @handle, тексты вымышлены. Никаких реальных людей.
// Демо имитирует, что система уже анализирует Telegram-чаты, каналы, базу,
// историю диалогов, Zoom и CRM — и показывает не людей, а поводы.
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNALS: Signal[] = [
  {
    id: 'sig-001',
    contactName: 'Кирилл',
    contactType: 'investor',
    signalType: 'discussing_investments',
    signalSource: 'telegram_chat',
    signalText: 'Несколько раз поднимал тему инвестиций в MedTech и private equity.',
    whyFound: 'За 7 дней 3 раза писал про медицинские компании и private equity в двух чатах.',
    whyImportant: 'Активный интерес к MedTech прямо сейчас — окно для тёплого захода, пока тема в фокусе.',
    whyRelevant: 'НеоГемовет — это MedTech: ветеринарная диагностика с понятной B2B-моделью.',
    actionRecommendation: 'Написать мягкое сообщение, предложить 15 минут Zoom без давления.',
    riskOfError: 'Нет подтверждения, что он инвестирует в ранние стадии — мог говорить как наблюдатель.',
    nextStep: 'Отправить черновик, при ответе предложить слот Zoom.',
    draftMessage:
      'Кирилл, увидел вашу мысль про инвестиции в MedTech. У нас сейчас как раз есть проект в этой логике - ветеринарная диагностика с понятной B2B-моделью. Если интересно, могу коротко показать, как мы его упаковываем под инвесторов.',
    confidence: 'high',
    handle: 'kirill_mt_demo',
    origin: 'new_contact',
    projectFit: true,
    pipelineStage: 'signal',
  },
  {
    id: 'sig-002',
    contactName: 'Анна',
    contactType: 'founder',
    signalType: 'seeking_capital',
    signalSource: 'channel_comment',
    signalText: 'В комментарии написала, что ищет капитал на масштабирование.',
    whyFound: 'Комментарий под постом про раунды: прямо спросила, где искать деньги на рост.',
    whyImportant: 'Это не инвестор, а фаундер с активной болью — потенциальный клиент Zapusk AI.',
    whyRelevant: 'Zapusk AI помогает с упаковкой и выходом к инвесторам — ровно её задача.',
    actionRecommendation: 'Предложить диагностику инвестиционной упаковки, не продавать в лоб.',
    riskOfError: 'Возможно, ищет грант или кредит, а не equity — оффер может не подойти.',
    nextStep: 'Уточнить, какой тип денег нужен, прежде чем предлагать формат.',
    draftMessage:
      'Анна, увидел ваш комментарий про поиск капитала на рост. Мы в Zapusk помогаем фаундерам собрать инвестиционную упаковку и дойти до инвесторов. Если хотите, разберу за 15 минут, что у вас сейчас сильно, а что мешает заходу.',
    confidence: 'medium',
    handle: 'anna_founder_demo',
    origin: 'new_contact',
    projectFit: false,
    pipelineStage: 'signal',
  },
  {
    id: 'sig-003',
    contactName: 'Дмитрий',
    contactType: 'past_relationship',
    signalType: 'past_zoom',
    signalSource: 'zoom_history',
    signalText: 'Был Zoom, после него 120 дней тишины. Мяч на нашей стороне.',
    whyFound: 'В истории Zoom: созвон 120 дней назад, последнее действие за нами, продолжения не было.',
    whyImportant: 'Тёплый контакт остывает — реактивация сейчас дешевле нового захода.',
    whyRelevant: 'Ранее обсуждали участие в сделках через Zapusk, тема прямо релевантна.',
    actionRecommendation: 'Реактивация: напомнить о прошлом разговоре, предложить короткую сверку.',
    riskOfError: 'Контакт мог остыть или сменить фокус — заход может остаться без ответа.',
    nextStep: 'Написать сегодня, пока повод ещё свежий в памяти.',
    draftMessage:
      'Дмитрий, привет. Вспомнил наш прошлый разговор по сделкам через Zapusk. Мы сейчас сильно продвинулись в AI-инфраструктуре для привлечения капитала, и мне кажется, это может быть релевантно вашей логике. Давай коротко сверимся на 15 минут?',
    confidence: 'medium',
    handle: 'dmitry_demo',
    origin: 'existing_base',
    projectFit: true,
    pipelineStage: 'follow_up',
    ballOnOurSide: true,
    whenToFollowUp: 'Сегодня',
  },
  {
    id: 'sig-004',
    contactName: 'Мария В.',
    contactType: 'investor',
    signalType: 'invested_similar',
    signalSource: 'investor_base',
    signalText: 'В базе помечена сделка в ветеринарной диагностике в прошлом году.',
    whyFound: 'Запись в базе инвесторов: участие в раунде смежного ветдиагностического стартапа.',
    whyImportant: 'Доказанный опыт в нашей нише — самый сильный тип сигнала по конверсии.',
    whyRelevant: 'НеоГемовет — та же ниша, что и её прошлая сделка.',
    actionRecommendation: 'Зайти предметно: показать отличие от её прошлой сделки.',
    riskOfError: 'Могла закрыть аллокацию в нишу на этот год — тайминг под вопросом.',
    nextStep: 'Ответила тепло — предложить слот Zoom на этой неделе.',
    draftMessage:
      'Мария, помню вашу сделку в ветдиагностике. У нас есть НеоГемовет в этой же логике, но со своей линейкой реагентов и первыми клиниками на пилоте. Покажу за 15 минут, чем отличаемся?',
    confidence: 'high',
    handle: 'maria_vc_demo',
    origin: 'existing_base',
    projectFit: true,
    pipelineStage: 'reply',
  },
  {
    id: 'sig-005',
    contactName: 'Канал «PE Daily»',
    contactType: 'media',
    signalType: 'ipo_ma_funds',
    signalSource: 'channel_comment',
    signalText: 'Канал регулярно публикует разборы IPO, M&A и новых фондов.',
    whyFound: 'Высокая частота постов про фонды и сделки в релевантной нам теме.',
    whyImportant: 'Полезный источник сигналов и инфоповодов, но это не человек.',
    whyRelevant: 'Через комментарии канала можно ловить активных инвесторов по теме.',
    actionRecommendation: 'Мониторить и собирать сигналы из комментариев. Не писать как человеку.',
    riskOfError: 'Ошибка рамки: попытка «написать каналу» как контакту — это не аутрич.',
    nextStep: 'Поставить канал в мониторинг тем, разбирать комментаторов.',
    confidence: 'low',
    origin: 'new_contact',
    projectFit: false,
    pipelineStage: 'signal',
  },
  {
    id: 'sig-006',
    contactName: 'Сергей',
    contactType: 'investor',
    signalType: 'we_didnt_reply',
    signalSource: 'past_dialog',
    signalText: 'Написал последним 9 дней назад, мы не ответили.',
    whyFound: 'В прошлом диалоге его сообщение без нашего ответа, 9 дней назад.',
    whyImportant: 'Мяч на нашей стороне и контакт ещё тёплый — упускать нельзя.',
    whyRelevant: 'Ранее интересовался сделками Zapusk в близкой теме.',
    actionRecommendation: 'Извиниться за паузу коротко и вернуть разговор в конструктив.',
    riskOfError: 'Пауза могла снизить интерес — заход стоит делать без давления.',
    nextStep: 'Ответить сегодня, закрыть открытый вопрос из его сообщения.',
    draftMessage:
      'Сергей, виноват за паузу. Возвращаюсь к вашему вопросу: да, формат участия мы обкатали и можем показать на цифрах. Удобно созвониться на 15 минут на этой неделе?',
    confidence: 'high',
    handle: 'sergey_demo',
    origin: 'existing_base',
    projectFit: true,
    pipelineStage: 'outreach',
    ballOnOurSide: true,
    whenToFollowUp: 'Сегодня',
  },
  {
    id: 'sig-007',
    contactName: 'Ольга С.',
    contactType: 'fund',
    signalType: 'long_silence',
    signalSource: 'crm',
    signalText: 'Последний контакт 299 дней назад, с тех пор тишина.',
    whyFound: 'В CRM медиана тишины по контакту 299 дней, активности нет.',
    whyImportant: 'Холодный контакт: повод слабый, заход требует нового триггера.',
    whyRelevant: 'Синдикат на ранних стадиях — теоретически в зоне интереса проекта.',
    actionRecommendation: 'Не реактивировать вслепую. Дождаться свежего сигнала по теме.',
    riskOfError: 'Заход без нового повода выглядит как холодная рассылка.',
    nextStep: 'Оставить в мониторинге, поднять при появлении тематического сигнала.',
    confidence: 'low',
    handle: 'olga_fund_demo',
    origin: 'existing_base',
    projectFit: false,
    pipelineStage: 'signal',
  },
  {
    id: 'sig-008',
    contactName: 'Андрей',
    contactType: 'investor',
    signalType: 'past_zoom',
    signalSource: 'zoom_history',
    signalText: 'Zoom проведён, обсуждали участие, ждём решения.',
    whyFound: 'В истории Zoom: созвон 6 дней назад, договорились вернуться с деталями.',
    whyImportant: 'Горячая стадия: решение близко, важен аккуратный follow-up.',
    whyRelevant: 'Обсуждали конкретно НеоГемовет и формат входа.',
    actionRecommendation: 'Прислать обещанные детали и мягко обозначить следующий шаг.',
    riskOfError: 'Передавить с дедлайном — можно спугнуть на финальной стадии.',
    nextStep: 'Отправить материалы из договорённостей, предложить срок ответа без давления.',
    draftMessage:
      'Андрей, как договорились, собрал детали по НеоГемовет одним файлом. Посмотрите на удобной неделе, и подскажите, что ещё нужно для решения с вашей стороны.',
    confidence: 'high',
    handle: 'andrey_demo',
    origin: 'existing_base',
    projectFit: true,
    pipelineStage: 'zoom_done',
  },
];

export const INVESTOR_FIT: InvestorFit[] = [
  {
    id: 'fit-001',
    contactName: 'Мария В.',
    contactType: 'investor',
    fit: 'high_fit',
    explanation: 'Доказанная сделка в ветдиагностике, активна в профильных чатах, чек в нашем диапазоне.',
    matchingTopics: ['ветеринарная диагностика', 'MedTech', 'B2B-модели'],
    similarInvestors: ['Ангелы из «Ветбизнес РФ»', 'Синдикат MedTech раннего входа'],
    riskOfError: 'Аллокация в нишу на год могла быть уже закрыта.',
  },
  {
    id: 'fit-002',
    contactName: 'Кирилл',
    contactType: 'investor',
    fit: 'high_fit',
    explanation: 'Регулярно обсуждает MedTech и private equity, пересекается в тех же чатах.',
    matchingTopics: ['MedTech', 'private equity'],
    similarInvestors: ['Активные комментаторы PE-чатов по медицине'],
    riskOfError: 'Не подтверждён опыт сделок на ранних стадиях.',
  },
  {
    id: 'fit-003',
    contactName: 'Сергей',
    contactType: 'investor',
    fit: 'medium_fit',
    explanation: 'Интересовался сделками Zapusk, но прямого профиля по нише пока не видно.',
    matchingTopics: ['привлечение капитала', 'сделки Zapusk'],
    similarInvestors: ['Инвесторы прошлых сделок Zapusk'],
    riskOfError: 'Интерес мог быть к инфраструктуре, а не к конкретной нише проекта.',
  },
  {
    id: 'fit-004',
    contactName: 'Дмитрий',
    contactType: 'past_relationship',
    fit: 'medium_fit',
    explanation: 'Был тёплый Zoom и предметное обсуждение, но давно нет активности.',
    matchingTopics: ['сделки через Zapusk'],
    similarInvestors: ['Контакты из прошлых раундов'],
    riskOfError: 'За 120 дней фокус мог сместиться.',
  },
  {
    id: 'fit-005',
    contactName: 'Ольга С.',
    contactType: 'fund',
    fit: 'low_fit',
    explanation: 'Формально синдикат ранних стадий, но 299 дней тишины и нет тематических сигналов.',
    matchingTopics: ['ранние раунды'],
    similarInvestors: [],
    riskOfError: 'Совпадение только по формальному типу, без поведенческих доказательств.',
  },
  {
    id: 'fit-006',
    contactName: 'Анна',
    contactType: 'founder',
    fit: 'unknown',
    explanation: 'Это фаундер, ищет капитал для себя. Как инвестор проекта не квалифицируется.',
    matchingTopics: [],
    similarInvestors: [],
    riskOfError: 'Ошибка рамки: принять фаундера за инвестора.',
  },
];
