// Seed data for strong public demo cases. "Венский ветер" is seeded directly
// in seed.ts because it has a hand-tuned full brief. The cases below add the
// two other demo transformations used by the client-facing showcase.

export interface DemoBrief {
  businessSummary: string;
  monetization: string;
  keyMetrics: Record<string, string>;
  investmentAsk: string;
  strengths: string[];
  weaknesses: string[];
  missingData: string[];
  missingByCategory: {
    financial: string[];
    market: string[];
    team: string[];
    deal: string[];
    unit_econ: string[];
    risks: string[];
  };
  napkin: {
    whatIs: string;
    howMakesMoney: string;
    howMuchNeeded: string;
    whatFor: string;
    investorReturn: string;
    whyNow: string;
    mainRisks: string[];
    whatIsHidden: string[];
  };
}

export interface DemoProject {
  name: string;
  inn: string | null;
  website: string;
  industry: string;
  legalStatus: string;
  stage: string;
  raiseAmount: number;
  currency: string;
  minCheck: number;
  equityOffered: number;
  investorType: string;
  status: string;
  brief: DemoBrief;
}

// Sprint 62.P10 — демо AI-переговоры. Заполняют разделы «AI-разбор
// переговоров» (ConversationAnalysis) и «Встречи» (SalesSession) для
// демо-фаундера реалистичным контентом без вызова LLM. Привязываются к
// демо-проектам по name и сохраняются с createdById=демо-фаундер, чтобы
// быть видимыми в его кабинете (listAnalyses/listSessions фильтруют по
// createdById OR project.userId).
export interface DemoScoreBreakdown {
  rapport: number;
  spin: number;
  nextStepFixation: number;
  objectionHandling: number;
  clarity: number;
  confidence: number;
}

export interface DemoAnalysisCard {
  summary: string;
  spinStage: 'S' | 'P' | 'I' | 'N';
  conversationQuality: number;
  investorInterest: string;
  investorConcerns: string[];
  mistakes: string[];
  whatWorked: string[];
  nextBestAction: string;
  followUpMessage: string;
  probabilityScore: number;
  recommendedMaterials: string[];
  managerAdvice: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  aiScore: number;
  aiScoreBreakdown: DemoScoreBreakdown;
  provider: 'mock';
  model: string;
  fellBackToMock: boolean;
}

export interface DemoNegotiation {
  projectName: string;
  investorName: string;
  durationSec: number;
  transcript: string;
  card: DemoAnalysisCard;
}

export interface DemoMeeting {
  projectName: string;
  investorName: string;
  investorPhone: string | null;
  durationMin: number;
  transcript: string;
  summary: string;
  investorInterest: string;
  checkRange: string;
  objections: string[];
  risks: string[];
  materialsToSend: string[];
  nextStep: string;
  followUpMessage: string;
  probabilityScore: number;
  investorType: string;
  tone: 'hot' | 'warm' | 'cold';
  outcome: 'success' | 'failed' | 'followup' | 'unknown';
}

// Sprint 62.P11 — готовые материалы упаковки для showcase-проектов. Каждая
// строка рендерится в блоке «Материалы проекта от ZAPUSK AI» (AIPackagingHistory)
// как завершённый артефакт. provider/tool/outputType взяты из
// DEFAULT_TEMPLATE_ORCHESTRATION (web/src/lib/aiProviders.ts), чтобы лейблы и
// бейджи совпадали с реальным pipeline.
export interface DemoPackagingJob {
  projectName: string;
  templateKey: string;
  provider: string;
  tool: string;
  model: string | null;
  outputType: string;
  resultPreview: string;
  managerComment: string | null;
  previewUrl: string | null;
}

export const DEMO_PACKAGING_JOBS: DemoPackagingJob[] = [
  // ——— Luce Silva ———
  {
    projectName: 'Luce Silva', templateKey: 'cloud_design', provider: 'claude_design', tool: 'claude-design-pdf',
    model: 'claude-opus', outputType: 'pitch_deck',
    resultPreview: 'Инвестиционная презентация Luce Silva — 14 слайдов: рынок премиального света, продукт, юнит-экономика, команда, условия раунда.',
    managerComment: 'Презентация собрана и проверена командой ZAPUSK AI, готова к показу инвестору.',
    previewUrl: 'https://luce-silva.zapusk.tech/deck',
  },
  {
    projectName: 'Luce Silva', templateKey: 'one_pager', provider: 'lovable', tool: 'lovable-web',
    model: null, outputType: 'one_pager',
    resultPreview: 'Тизер / one-pager Luce Silva — одностраничник с ключевыми метриками и условиями сделки для первого касания.',
    managerComment: null,
    previewUrl: 'https://luce-silva.zapusk.tech/one-pager',
  },
  {
    projectName: 'Luce Silva', templateKey: 'lovable_landing', provider: 'lovable', tool: 'lovable-web',
    model: null, outputType: 'landing',
    resultPreview: 'Посадочная страница Luce Silva — инвестиционный лендинг с AEO-разметкой, формой интереса и расчётом доходности.',
    managerComment: 'Лендинг опубликован, AI-видимость включена.',
    previewUrl: 'https://luce-silva.zapusk.tech/',
  },
  {
    projectName: 'Luce Silva', templateKey: 'financial', provider: 'claude', tool: 'claude-opus',
    model: 'claude-opus', outputType: 'financial_model',
    resultPreview: 'Финансовая модель Luce Silva — P&L, cash flow, 3 сценария и расчёт IRR/доли инвестора.',
    managerComment: null,
    previewUrl: 'https://luce-silva.zapusk.tech/finmodel',
  },
  {
    projectName: 'Luce Silva', templateKey: 'investor_faq', provider: 'openai', tool: 'gpt-5.5',
    model: 'gpt-5.5', outputType: 'faq',
    resultPreview: 'Investor FAQ Luce Silva — снятие 12 типовых возражений: возвратность, риски, выход, конкуренты.',
    managerComment: null,
    previewUrl: 'https://luce-silva.zapusk.tech/faq',
  },
  {
    projectName: 'Luce Silva', templateKey: 'investment_summary', provider: 'openai', tool: 'gpt-4.1',
    model: 'gpt-4.1', outputType: 'investor_summary',
    resultPreview: 'Юридическая структура и условия сделки Luce Silva — investor memo: форма участия, доля, защита инвестора.',
    managerComment: 'Юридический блок согласован, договорная структура описана.',
    previewUrl: 'https://luce-silva.zapusk.tech/legal',
  },

  // ——— Венский ветер ———
  {
    projectName: 'Венский ветер', templateKey: 'cloud_design', provider: 'claude_design', tool: 'claude-design-pdf',
    model: 'claude-opus', outputType: 'pitch_deck',
    resultPreview: 'Инвестиционная презентация «Венский ветер» — сеть кофеен, экономика точки, план масштабирования.',
    managerComment: 'Презентация готова к показу инвестору.',
    previewUrl: 'https://venskiy-veter.zapusk.tech/deck',
  },
  {
    projectName: 'Венский ветер', templateKey: 'financial', provider: 'claude', tool: 'claude-opus',
    model: 'claude-opus', outputType: 'financial_model',
    resultPreview: 'Финансовая модель «Венский ветер» — экономика сети, окупаемость точки, сценарии роста.',
    managerComment: null,
    previewUrl: 'https://venskiy-veter.zapusk.tech/finmodel',
  },
  {
    projectName: 'Венский ветер', templateKey: 'calculator_spec', provider: 'claude', tool: 'claude-code',
    model: 'claude-code', outputType: 'calculator',
    resultPreview: 'Калькулятор инвестора «Венский ветер» — интерактивный расчёт доли и доходности по сумме чека.',
    managerComment: null,
    previewUrl: 'https://venskiy-veter.zapusk.tech/calculator',
  },
  {
    projectName: 'Венский ветер', templateKey: 'lovable_landing', provider: 'lovable', tool: 'lovable-web',
    model: null, outputType: 'landing',
    resultPreview: 'Посадочная страница «Венский ветер» — инвестиционный лендинг сети кофеен с AEO-разметкой.',
    managerComment: 'Лендинг опубликован.',
    previewUrl: 'https://venskiy-veter.zapusk.tech/',
  },
  {
    projectName: 'Венский ветер', templateKey: 'investor_faq', provider: 'openai', tool: 'gpt-5.5',
    model: 'gpt-5.5', outputType: 'faq',
    resultPreview: 'FAQ инвестора «Венский ветер» — ответы по рискам сетевого ритейла, возвратности и выходу.',
    managerComment: null,
    previewUrl: 'https://venskiy-veter.zapusk.tech/faq',
  },

  // ——— Планета 60 ———
  {
    projectName: 'Планета 60', templateKey: 'one_pager', provider: 'lovable', tool: 'lovable-web',
    model: null, outputType: 'one_pager',
    resultPreview: 'Инвестиционный тизер «Планета 60» — одностраничник для первого касания с инвестором.',
    managerComment: null,
    previewUrl: 'https://planeta60.zapusk.tech/teaser',
  },
  {
    projectName: 'Планета 60', templateKey: 'cloud_design', provider: 'claude_design', tool: 'claude-design-pdf',
    model: 'claude-opus', outputType: 'pitch_deck',
    resultPreview: 'Pitch deck «Планета 60» — презентация проекта, рынок, продукт, условия раунда.',
    managerComment: 'Презентация собрана командой ZAPUSK AI.',
    previewUrl: 'https://planeta60.zapusk.tech/deck',
  },
  {
    projectName: 'Планета 60', templateKey: 'financial', provider: 'claude', tool: 'claude-opus',
    model: 'claude-opus', outputType: 'financial_model',
    resultPreview: 'Financial model «Планета 60» — P&L, сценарии и расчёт доходности инвестора.',
    managerComment: null,
    previewUrl: 'https://planeta60.zapusk.tech/finmodel',
  },
  {
    projectName: 'Планета 60', templateKey: 'calculator_spec', provider: 'claude', tool: 'claude-code',
    model: 'claude-code', outputType: 'calculator',
    resultPreview: 'Unit-экономика «Планета 60» — модель экономики на единицу и драйверы маржи.',
    managerComment: null,
    previewUrl: 'https://planeta60.zapusk.tech/unit-economics',
  },
  {
    projectName: 'Планета 60', templateKey: 'ai_visibility_report', provider: 'openai', tool: 'gpt-4.1',
    model: 'gpt-4.1', outputType: 'ai_visibility_report',
    resultPreview: 'AI discoverability report «Планета 60» — готовность материалов к AI-поиску и answer engines.',
    managerComment: null,
    previewUrl: 'https://planeta60.zapusk.tech/ai-visibility',
  },

  // ——— НеоГемовет ———
  {
    projectName: 'НеоГемовет', templateKey: 'cloud_design', provider: 'claude_design', tool: 'claude-design-pdf',
    model: 'claude-opus', outputType: 'pitch_deck',
    resultPreview: 'Инвестиционная презентация «НеоГемовет» — рынок ветеринарной биофармы, продукт, патент, условия раунда 150 млн ₽.',
    managerComment: 'Презентация собрана и проверена командой ZAPUSK AI.',
    previewUrl: 'https://neogemovet-invest.ru/deck',
  },
  {
    projectName: 'НеоГемовет', templateKey: 'one_pager', provider: 'lovable', tool: 'lovable-web',
    model: null, outputType: 'one_pager',
    resultPreview: 'One-pager «НеоГемовет» — одностраничник: универсальный кровезаменитель, стадия MVP, спрос ветклиник.',
    managerComment: null,
    previewUrl: 'https://neogemovet-invest.ru/one-pager',
  },
  {
    projectName: 'НеоГемовет', templateKey: 'financial', provider: 'claude', tool: 'claude-opus',
    model: 'claude-opus', outputType: 'financial_model',
    resultPreview: 'Financial model «НеоГемовет» — P&L, путь к регистрации, сценарии выручки и расчёт доли инвестора (25%).',
    managerComment: null,
    previewUrl: 'https://neogemovet-invest.ru/finmodel',
  },
  {
    projectName: 'НеоГемовет', templateKey: 'investment_summary', provider: 'openai', tool: 'gpt-4.1',
    model: 'gpt-4.1', outputType: 'investor_summary',
    resultPreview: 'Market overview «НеоГемовет» — объём рынка ветеринарных трансфузий, конкурент Перфторан, барьеры входа.',
    managerComment: null,
    previewUrl: 'https://neogemovet-invest.ru/market',
  },
  {
    projectName: 'НеоГемовет', templateKey: 'investor_faq', provider: 'openai', tool: 'gpt-5.5',
    model: 'gpt-5.5', outputType: 'faq',
    resultPreview: 'Legal structure memo «НеоГемовет» — форма участия инвестора, статус патента/НИР, регистрационные риски.',
    managerComment: 'Юридический блок описан, патент и НИР подтверждены.',
    previewUrl: 'https://neogemovet-invest.ru/legal',
  },
];

export const DEMO_NEGOTIATIONS: DemoNegotiation[] = [
  {
    projectName: 'НеоГемовет',
    investorName: 'Инвестор Д.',
    durationSec: 512,
    transcript:
      'Инвестор: Добрый день. Я посмотрел тизер по кровезаменителю, но хочу понять, на каком этапе проект.\n' +
      'Менеджер: Здравствуйте. Патент и результаты НИР уже выкуплены у разработчиков, сейчас фокус на регистрации препарата и подготовке производства.\n' +
      'Инвестор: А регистрация — это сколько по времени и деньгам? Для меня это главный риск.\n' +
      'Менеджер: Согласен, это ключевой этап. Бюджет регистрации и сроки заложены в финмодель, могу выслать с независимой оценкой проекта.\n' +
      'Инвестор: Хорошо. А кто покупатель в итоге — клиники?\n' +
      'Менеджер: Да, ветеринарные клиники и ветфарм-дистрибьюторы. У проекта есть готовая база ветклиник.\n' +
      'Инвестор: Чек у меня может быть до пяти миллионов. Пришлите материалы, посмотрю с коллегой.',
    card: {
      summary:
        'Инвестор предметно интересуется кейсом ветеринарного кровезаменителя. Главный фокус — регуляторный риск регистрации. Менеджер корректно подсветил, что патент и НИР уже выкуплены, и предложил финмодель с независимой оценкой.',
      spinStage: 'N',
      conversationQuality: 82,
      investorInterest: 'Высокий: инвестор сам обозначил чек до 5 млн ₽ и попросил материалы.',
      investorConcerns: ['Сроки и бюджет регистрации препарата', 'Реалистичность канала сбыта через клиники'],
      mistakes: [
        'Не зафиксирована конкретная дата следующего контакта — «посмотрю с коллегой» осталось без срока',
        'Не уточнён опыт инвестора в биофарме/долгих проектах — это влияет на подачу горизонта',
      ],
      whatWorked: [
        'Сразу снят главный страх: патент и НИР выкуплены, ИС защищена',
        'Возражение про регистрацию переведено в плоскость «есть финмодель и независимая оценка»',
        'Назван понятный покупатель — клиники и дистрибьюторы с готовой базой',
      ],
      nextBestAction: 'Выслать тизер, финмодель и независимую оценку сегодня; предложить созвон с научным руководителем через 3 дня.',
      followUpMessage:
        'Спасибо за разговор! Прикладываю тизер, финмодель и независимую оценку проекта НеоГемовет. Предлагаю короткий созвон с научным руководителем в четверг, чтобы снять вопросы по регистрации. Удобно в 11:00?',
      probabilityScore: 64,
      recommendedMaterials: ['Тизер проекта (One Pager)', 'Финансовая модель', 'Независимая оценка проекта', 'FAQ для инвесторов'],
      managerAdvice: 'Для биофармы инвестору важен горизонт и регуляторика — подкрепляйте каждый этап документом из Data Room и всегда фиксируйте дату следующего шага.',
      sentiment: 'positive',
      aiScore: 81,
      aiScoreBreakdown: { rapport: 84, spin: 78, nextStepFixation: 70, objectionHandling: 86, clarity: 85, confidence: 83 },
      provider: 'mock',
      model: 'demo-seed',
      fellBackToMock: true,
    },
  },
  {
    projectName: 'Венский ветер',
    investorName: 'Инвестор А.',
    durationSec: 438,
    transcript:
      'Инвестор: Здравствуйте, видел вашу площадку для свадеб. Красиво, но свадьбы — это сезон, как с деньгами зимой?\n' +
      'Менеджер: Добрый день. Да, основной сезон май–октябрь, но мы прорабатываем зимнюю загрузку: корпоративы, фотосессии.\n' +
      'Инвестор: А окупаемость какая?\n' +
      'Менеджер: В базовом сценарии при ста свадьбах за сезон окупаемость около двух сезонов, инвестору идёт 70% прибыли до возврата.\n' +
      'Инвестор: Звучит интересно, но мне кажется, что строительство затянется.\n' +
      'Менеджер: Понимаю опасение. Давайте я покажу смету и календарный план — там видно резерв по срокам.\n' +
      'Инвестор: Давайте. Чек до двух миллионов рассматриваю.',
    card: {
      summary:
        'Инвестор заинтересован премиальной свадебной площадкой, но держит два возражения: сезонность и риск затягивания стройки. Менеджер ответил по окупаемости и механике возврата, предложил смету с резервом по срокам.',
      spinStage: 'I',
      conversationQuality: 74,
      investorInterest: 'Средне-высокий: рассматривает чек до 2 млн ₽, но не снял до конца возражение по срокам.',
      investorConcerns: ['Сезонность выручки (зимняя загрузка)', 'Риск задержки строительства'],
      mistakes: [
        'Возражение «строительство затянется» закрыто обещанием показать смету, но без конкретного буфера в словах',
        'Не задан вопрос про прошлый инвест-опыт инвестора в недвижимости/стройке',
      ],
      whatWorked: [
        'Чётко названа механика возврата: 70% прибыли инвестору до окупаемости',
        'Сезонность не спрятана, сразу предложены форматы зимней загрузки',
        'Инвестор сам обозначил размер чека — сигнал интереса',
      ],
      nextBestAction: 'Выслать финмодель и календарный план строительства с выделенным резервом по срокам; назначить встречу с фаундером.',
      followUpMessage:
        'Спасибо за интерес к «Венскому ветру»! Прикладываю финмодель и календарный план с резервом по срокам строительства. Предлагаю встречу с фаундером на следующей неделе — покажем площадку и воронку бронирований. Когда удобно?',
      probabilityScore: 57,
      recommendedMaterials: ['Финансовая модель', 'Презентация (Pitch Deck)', 'Календарный план строительства'],
      managerAdvice: 'Когда инвестор называет риск сроков — отвечайте цифрой буфера, а не обещанием «покажу». Конкретика снимает возражение быстрее.',
      sentiment: 'positive',
      aiScore: 73,
      aiScoreBreakdown: { rapport: 80, spin: 70, nextStepFixation: 66, objectionHandling: 68, clarity: 79, confidence: 75 },
      provider: 'mock',
      model: 'demo-seed',
      fellBackToMock: true,
    },
  },
];

export const DEMO_MEETINGS: DemoMeeting[] = [
  {
    projectName: 'Luce Silva',
    investorName: 'Инвестор К.',
    investorPhone: null,
    durationMin: 12,
    transcript:
      'Инвестор: Посмотрел посадочную страницу Luce Silva — сделано сильно. Расскажите про экономику.\n' +
      'Менеджер: Спасибо! Средний чек свадьбы около 725 тысяч, прибыль с мероприятия около 500 тысяч. Сезон — 75–150 свадеб.\n' +
      'Инвестор: А что с бронированиями до открытия?\n' +
      'Менеджер: Это ключевой вопрос, воронку предзаказа сейчас собираем — могу показать текущие LOI.\n' +
      'Инвестор: Хорошо. Мне нравится упаковка, готов зайти на конвертируемом займе. Чек до трёх миллионов.',
    summary:
      'Инвестор высоко оценил упаковку Luce Silva и готов входить через конвертируемый заём с чеком до 3 млн ₽. Сильный сигнал, но воронка предзаказа ещё не подтверждена документально.',
    investorInterest: 'Высокий — сам предложил инструмент сделки (конвертируемый заём).',
    checkRange: 'до 3 000 000 ₽',
    objections: ['Нет подтверждённой воронки бронирований до открытия'],
    risks: ['Сезонность спроса', 'Отсутствие подтверждённых предоплат'],
    materialsToSend: ['Финансовая модель', 'Условия сделки (term sheet)', 'Текущие LOI по бронированиям'],
    nextStep: 'Выслать term sheet по конвертируемому займу и текущие LOI; назначить встречу с фаундером.',
    followUpMessage:
      'Спасибо за разговор! Готовлю term sheet по конвертируемому займу и подборку текущих LOI. Предлагаю встречу с фаундером, чтобы обсудить структуру. Когда вам удобно на этой неделе?',
    probabilityScore: 72,
    investorType: 'growth',
    tone: 'hot',
    outcome: 'followup',
  },
  {
    projectName: 'НеоГемовет',
    investorName: 'Инвестор М.',
    investorPhone: null,
    durationMin: 16,
    transcript:
      'Инвестор: Тема искусственной крови амбициозная. Но я в фарме осторожен — где гарантии, что дойдёте до регистрации?\n' +
      'Менеджер: Понимаю. Патент и НИР уже выкуплены, есть независимая оценка и дорожная карта с этапами регистрации.\n' +
      'Инвестор: А конкуренты? Перфторан же есть.\n' +
      'Менеджер: Да, в Data Room есть обзор конкурентов, включая Перфторан и зарубежные аналоги — мы показываем отличия по применению.\n' +
      'Инвестор: Ок, мне нужно время подумать и обсудить с партнёром. Пришлите Data Room.',
    summary:
      'Инвестор с опытом в фарме осторожен по регуляторному риску и спрашивает про конкурентов. Менеджер отработал через выкупленный патент, независимую оценку и обзор конкурентов в Data Room. Решение отложено до обсуждения с партнёром.',
    investorInterest: 'Средний — интерес есть, но требуется верификация с партнёром.',
    checkRange: 'не зафиксирован',
    objections: ['Сомнения в прохождении регистрации', 'Конкуренция с Перфтораном и аналогами'],
    risks: ['Длинный регуляторный путь', 'Технологический переход НИР → производство'],
    materialsToSend: ['Data Room (полный доступ)', 'Дорожная карта регистрации', 'Обзор конкурентов'],
    nextStep: 'Выслать доступ к Data Room и дорожную карту; договориться о звонке с партнёром инвестора через неделю.',
    followUpMessage:
      'Спасибо за встречу! Открываю доступ к Data Room и прикладываю дорожную карту регистрации и обзор конкурентов. Предлагаю созвон с вашим партнёром на следующей неделе — ответим на вопросы по регуляторике. Когда удобно?',
    probabilityScore: 41,
    investorType: 'strategic',
    tone: 'warm',
    outcome: 'followup',
  },
];

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Luce Silva',
    inn: null,
    website: 'https://lucesilva-invest.ru/',
    industry: 'Премиальная свадебная площадка · оранжерея в лесу · кейтеринг',
    legalStatus: 'Проект на стадии упаковки',
    stage: 'early_revenue',
    raiseAmount: 66_000_000,
    currency: 'RUB',
    minCheck: 1_000_000,
    equityOffered: 49,
    investorType: 'private',
    status: 'ready',
    brief: {
      businessSummary:
        'Luce Silva — премиальная стеклянная оранжерея для свадеб в Москве и Подмосковье. Платформа ZAPUSK AI переупаковала исходный материал Forrest Wedding в инвесторский кейс с понятной сделкой, финансовой моделью, посадочной страницей и тизером.',
      monetization:
        'Средний чек свадьбы около 725 тыс. ₽: площадка, кухня, сервис и техника. Прибыль с мероприятия около 500 тыс. ₽, сезонная модель 75-150 свадеб.',
      keyMetrics: {
        revenue: 'Потенциал выручки: 54-109 млн ₽ за сезон',
        growth: 'Масштабирование через новые площадки и сетевой формат',
        unit_econ: 'Около 500 тыс. ₽ прибыли с одной свадьбы',
        customers: '75-150 свадеб за сезон в базовом коридоре',
        margin: 'Высокая маржинальность за счёт площадки + кейтеринга + сервиса',
      },
      investmentAsk:
        'Привлекается 66 млн ₽. Предложение инвестору: 49% доли, дивиденды до 70% прибыли до окупаемости, целевая окупаемость 1-2 сезона.',
      strengths: [
        'Сильная визуальная упаковка: презентация, тизер, посадочная страница и финмодель говорят одним языком',
        'Понятная экономика для частного инвестора: чек, маржа, сезон, окупаемость',
        'Дефицитная ниша премиальных природных свадебных площадок',
        'Готовый комплект материалов можно сразу показывать инвестору',
      ],
      weaknesses: [
        'Сезонность свадебного спроса',
        'CAPEX и сроки открытия требуют аккуратного контроля',
        'Нужна подтверждённая воронка бронирований до сезона',
      ],
      missingData: [
        'Сколько бронирований и предоплат подтверждено на первый сезон?',
        'Какие партнёрства с event-агентствами уже закреплены?',
        'Какая юридическая структура сделки и владения площадкой?',
      ],
      missingByCategory: {
        financial: ['Подтвердить CAPEX-смету и календарь оплат', 'Разделить маржу площадки, кухни и сервиса'],
        market: ['Подтвердить спрос на премиальные природные площадки по Москве', 'Сравнить с 5 ближайшими конкурентами'],
        team: ['Показать роли команды запуска и операционного управления'],
        deal: ['Закрепить условия доли, дивидендов и выхода инвестора'],
        unit_econ: ['Показать чувствительность прибыли к 75 / 100 / 150 свадьбам'],
        risks: ['Сезонность', 'Сроки строительства', 'Зависимость от партнёрских продаж'],
      },
      napkin: {
        whatIs: 'Премиальная стеклянная оранжерея для свадеб в лесу: площадка, кухня, сервис и оформление в одном продукте.',
        howMakesMoney: 'Средний чек около 725 тыс. ₽, прибыль с одной свадьбы около 500 тыс. ₽.',
        howMuchNeeded: '66 000 000 ₽',
        whatFor: 'Площадка и конструкции, инженерия, кухня, благоустройство, маркетинг и запуск продаж',
        investorReturn: '49% доли, до 70% прибыли до окупаемости, целевой возврат за 1-2 сезона при базовой загрузке.',
        whyNow: 'Рынок свадеб уходит в частные природные локации, а качественных площадок в премиум-сегменте мало.',
        mainRisks: ['Сезонность', 'Сроки запуска площадки', 'Недостаток подтверждённых бронирований'],
        whatIsHidden: ['Детальная смета CAPEX', 'Договоры с площадкой и подрядчиками', 'Воронка предзаказов'],
      },
    },
  },
  {
    name: 'Планета 60',
    inn: null,
    website: 'https://planeta-60-invest.lovable.app/',
    industry: 'Развлекательный центр · семейный досуг · инвестиционная недвижимость',
    legalStatus: 'Проект на стадии упаковки',
    stage: 'scaling',
    raiseAmount: 60_000_000,
    currency: 'RUB',
    minCheck: 1_000_000,
    equityOffered: 35,
    investorType: 'private',
    status: 'ready',
    brief: {
      businessSummary:
        'Планета 60 — инвестиционный кейс развлекательного проекта. Платформа ZAPUSK AI превратила исходную презентацию в понятную инвесторскую упаковку: презентацию, one-pager, посадочную страницу и финансовую модель.',
      monetization:
        'Основная модель: входной поток семейной аудитории, мероприятия, дополнительные сервисы и повторные визиты. Инвестиционный акцент — загрузка, средний чек и окупаемость площадки.',
      keyMetrics: {
        revenue: 'Выручка строится на посещаемости, среднем чеке и дополнительных услугах',
        growth: 'Потенциал масштабирования через новые локации и партнёрские каналы',
        unit_econ: 'Ключевые драйверы: трафик, средний чек, загрузка выходных и праздников',
        customers: 'Семьи с детьми, школьные группы, корпоративные и праздничные мероприятия',
        margin: 'Маржа зависит от аренды, ФОТ, маркетинга и загрузки смен',
      },
      investmentAsk:
        'Привлекается 60 млн ₽ на запуск и масштабирование. Для инвестора важны сценарии загрузки, срок окупаемости и понятная схема возврата.',
      strengths: [
        'Наглядная трансформация из сырой презентации в комплект для инвестора',
        'Есть готовая посадочная страница и короткий one-pager',
        'Модель понятна частному инвестору: площадка, поток, средний чек, окупаемость',
      ],
      weaknesses: [
        'Нужна точная разбивка CAPEX и OPEX',
        'Показатели посещаемости требуют подтверждения фактами или аналогами',
        'Сезонность и зависимость от локации нужно раскрыть сильнее',
      ],
      missingData: [
        'Какая точная структура CAPEX и арендных условий?',
        'Какие фактические показатели посещаемости есть по текущей площадке?',
        'Как устроен возврат инвестора: дивиденды, выкуп доли или смешанная схема?',
      ],
      missingByCategory: {
        financial: ['CAPEX / OPEX по статьям', 'Сценарии выручки и окупаемости'],
        market: ['Размер локального рынка семейных развлечений', 'Конкуренты в радиусе локации'],
        team: ['Операционная команда и роли в запуске'],
        deal: ['Схема возврата инвестора и юридическая структура'],
        unit_econ: ['Средний чек, повторные визиты, загрузка по дням недели'],
        risks: ['Локация', 'Сезонность', 'Операционная сложность'],
      },
      napkin: {
        whatIs: 'Развлекательный проект для семейной аудитории с инвестиционной упаковкой под частного инвестора.',
        howMakesMoney: 'Посещения, мероприятия, дополнительные сервисы и повторные визиты.',
        howMuchNeeded: '60 000 000 ₽',
        whatFor: 'Запуск площадки, оборудование, маркетинг, операционный резерв и упаковка продаж',
        investorReturn: 'Возврат через прибыль проекта и рост стоимости доли после выхода на плановую загрузку.',
        whyNow: 'Семейный досуг остаётся устойчивым сегментом, а инвестору нужен понятный объект с видимой операционной моделью.',
        mainRisks: ['Локация', 'Загрузка', 'Рост операционных расходов'],
        whatIsHidden: ['Фактическая посещаемость', 'Детальная экономика смен', 'Условия сделки'],
      },
    },
  },
  {
    // Sprint 62.P10 — второй showcase-проект из инвест-таблицы (Data Room).
    // НеоГемовет — ветеринарный универсальный кровезаменитель (искусственная
    // кровь). Биофарма-кейс: патент и НИР выкуплены у разработчиков, дальше —
    // регистрация и выход на рынок ветклиник. Данные собраны из структуры
    // Data Room (тизер, pitch deck, финмодель, независимая оценка, патент).
    name: 'НеоГемовет',
    inn: null,
    website: 'https://neogemovet-invest.ru/',
    industry: 'Ветеринарная биофарма · универсальный кровезаменитель · искусственная кровь',
    legalStatus: 'OOO «НеоГемовет»',
    stage: 'mvp',
    raiseAmount: 150_000_000,
    currency: 'RUB',
    minCheck: 3_000_000,
    equityOffered: 25,
    investorType: 'private',
    status: 'ready',
    brief: {
      businessSummary:
        'НеоГемовет — российский проект универсального кровезаменителя (искусственной крови) для ветеринарии. Препарат переносит кислород и применяется при кровопотере у животных, где донорская кровь дефицитна и плохо хранится. Патент и результаты НИР выкуплены у разработчиков; платформа ZAPUSK AI упаковала научный материал в инвесторский кейс: тизер, pitch deck, финмодель и независимую оценку.',
      monetization:
        'Продажа препарата ветеринарным клиникам и дистрибьюторам ветфармы. Модель — производство и оптовая отгрузка по сети ветклиник, с последующим выходом в смежные сегменты. Выручка масштабируется по мере регистрации и расширения дистрибуции.',
      keyMetrics: {
        revenue: 'Выручка после регистрации препарата и старта отгрузок дистрибьюторам',
        growth: 'Масштабирование через сеть ветклиник и ветфарм-дистрибьюторов',
        unit_econ: 'Высокая маржинальность фарм-продукта при выходе на серийное производство',
        customers: 'Ветеринарные клиники, ветфарм-дистрибьюторы, профильные сети',
        margin: 'Маржа определяется себестоимостью производства и регистрационными затратами',
      },
      investmentAsk:
        'Привлекается 150 млн ₽ на регистрацию препарата, запуск производства и вывод на рынок. Предложение инвестору: 25% доли, минимальный чек 3 млн ₽. Возврат — через прибыль проекта и рост стоимости доли после регистрации и старта продаж.',
      strengths: [
        'Защищённая интеллектуальная собственность: патент и НИР выкуплены у разработчиков',
        'Дефицитный рынок: донорская ветеринарная кровь плохо хранится и ограничена в доступе',
        'Есть независимая оценка проекта и проработанный Data Room для инвестора',
        'Понятный канал сбыта — действующая база ветклиник и дистрибьюторов',
      ],
      weaknesses: [
        'Регуляторный путь: регистрация ветпрепарата требует времени и затрат',
        'Технологический риск перехода от НИР к серийному производству',
        'Длинный горизонт до выручки по сравнению с непрофильными проектами',
      ],
      missingData: [
        'Какой план и сроки регистрации препарата, на каком этапе сейчас?',
        'Какая себестоимость единицы при серийном производстве?',
        'Какие объёмы законтрактованы или подтверждены ветклиниками и дистрибьюторами?',
      ],
      missingByCategory: {
        financial: ['Бюджет регистрации и CAPEX производства по статьям', 'Сценарии выручки после старта продаж'],
        market: ['Объём рынка ветеринарных кровезаменителей в РФ', 'Сравнение с Перфтораном и зарубежными аналогами'],
        team: ['Научная и производственная команда, роли и компетенции'],
        deal: ['Структура сделки, права на ИС и схема возврата инвестора'],
        unit_econ: ['Себестоимость дозы, цена отгрузки, маржа на единицу'],
        risks: ['Регуляторика', 'Производственный переход', 'Сроки клинических испытаний'],
      },
      napkin: {
        whatIs: 'Универсальный кровезаменитель для ветеринарии: переносит кислород, заменяет дефицитную донорскую кровь животных.',
        howMakesMoney: 'Производство и оптовые продажи препарата ветклиникам и ветфарм-дистрибьюторам.',
        howMuchNeeded: '150 000 000 ₽',
        whatFor: 'Регистрация препарата, запуск производства, клинические испытания и вывод на рынок',
        investorReturn: '25% доли, возврат через прибыль и рост стоимости доли после регистрации и старта продаж.',
        whyNow: 'Донорская ветеринарная кровь дефицитна и плохо хранится, а патент и НИР уже выкуплены — окно для вывода защищённого продукта.',
        mainRisks: ['Регуляторный путь регистрации', 'Переход от НИР к серийному производству', 'Сроки клинических испытаний'],
        whatIsHidden: ['План и сроки регистрации', 'Себестоимость единицы продукции', 'Законтрактованные объёмы сбыта'],
      },
    },
  },
];
