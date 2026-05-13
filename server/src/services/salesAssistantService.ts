import { prisma } from '../db.js';
import { aiClient } from '../ai/client.js';
import { SALES_ASSISTANT_SYSTEM } from '../ai/salesAssistantPrompt.js';

export interface AnalyzeInput {
  transcript: string;       // полный transcript встречи на момент ручного обновления
  recentContext?: string;   // последние N символов разговора
  previousAdvice?: unknown;
  previousSpinStage?: SpinStage | null;
  adviceHistory?: unknown[];
  projectId?: string | null;
}

export type SpinStage = 'S' | 'P' | 'I' | 'N';
export type Tone = 'SOFT' | 'CONTROL' | 'CLOSE';
export type DealControl = 'LOW' | 'MEDIUM' | 'HIGH';
export type Engagement = 'active' | 'passive' | 'disengaged';

export interface AssistantCard {
  // Sprint 12 structured mini-brief
  situation: string;
  riskOrMissed: string | null;
  whatToDo: string[];
  whatNotToDo: string[];
  mainQuestion: string;
  backupQuestions: string[];
  selfSaleQuestions: string[];
  miniPitch: string | null;
  conversationObjective: string;
  conversationDirection: string;
  dealNextStep: string | null;
  spinStage: SpinStage;
  spinGaps: SpinStage[];
  tone: Tone;
  dealControlLevel: DealControl;
  engagementSignal: Engagement;
  confidence: number; // 0..100
  objection: string | null;

  // Legacy aliases (kept so older UI / history consumers keep working)
  risk: string | null;
  recommendation: string;
  suggestedPhrase: string;
  nextStep: string | null;

  source: 'ai' | 'mock';
  provider: 'anthropic' | 'openai' | 'mock';
  model: string;
  fellBackToMock: boolean;
}

type CoreCard = Omit<AssistantCard, 'source' | 'provider' | 'model' | 'fellBackToMock'>;

const SALES_ASSISTANT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    situation: { type: 'string' },
    riskOrMissed: { type: ['string', 'null'] },
    whatToDo: { type: 'array', items: { type: 'string' } },
    whatNotToDo: { type: 'array', items: { type: 'string' } },
    mainQuestion: { type: 'string' },
    backupQuestions: { type: 'array', items: { type: 'string' } },
    selfSaleQuestions: { type: 'array', items: { type: 'string' } },
    miniPitch: { type: ['string', 'null'] },
    conversationObjective: { type: 'string' },
    conversationDirection: { type: 'string' },
    dealNextStep: { type: ['string', 'null'] },
    spinStage: { type: 'string', enum: ['S', 'P', 'I', 'N'] },
    spinGaps: { type: 'array', items: { type: 'string', enum: ['S', 'P', 'I', 'N'] } },
    tone: { type: 'string', enum: ['SOFT', 'CONTROL', 'CLOSE'] },
    dealControlLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    engagementSignal: { type: 'string', enum: ['active', 'passive', 'disengaged'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    objection: { type: ['string', 'null'] },
  },
  required: [
    'situation',
    'riskOrMissed',
    'whatToDo',
    'whatNotToDo',
    'mainQuestion',
    'backupQuestions',
    'selfSaleQuestions',
    'miniPitch',
    'conversationObjective',
    'conversationDirection',
    'dealNextStep',
    'spinStage',
    'spinGaps',
    'tone',
    'dealControlLevel',
    'engagementSignal',
    'confidence',
    'objection',
  ],
} satisfies Record<string, unknown>;

export async function analyzeSalesTurn(input: AnalyzeInput): Promise<AssistantCard> {
  const projectContext = await loadProjectContext(input.projectId ?? undefined);
  const recentContext = input.recentContext?.trim() || tail(input.transcript, 6_000);
  const previousAdvice = formatAdvice(input.previousAdvice);
  const adviceHistory = formatAdviceHistory(input.adviceHistory);

  const user = [
    'Режим работы: live AI co-pilot переговоров с инвестором. Это НЕ summary встречи.',
    'Сформируй structured mini-brief для текущего момента. Каждый блок 1-3 строки, не больше.',
    'Не повторяй previousAdvice и предыдущий mainQuestion дословно. Если этап S уже закрыт — двигай в P/I/N.',
    '',
    'Контекст проекта:',
    projectContext,
    '',
    input.previousSpinStage ? `Предыдущий SPIN-этап: ${input.previousSpinStage}` : 'Предыдущий SPIN-этап: не задан',
    '',
    previousAdvice ? `Предыдущая подсказка, которую нельзя просто повторить:\n${previousAdvice}` : 'Предыдущая подсказка: нет',
    '',
    adviceHistory ? `История последних подсказок:\n${adviceHistory}` : 'История подсказок: нет',
    '',
    recentContext ? `Последний контекст разговора:\n${recentContext}` : 'Последний контекст разговора: нет',
    '',
    `Полный transcript встречи на текущий момент:\n${input.transcript}`,
    '',
    [
      'Задача:',
      '1. Определи spinStage и какие spinGaps ещё открыты в разговоре.',
      '2. Оцени engagementSignal и dealControlLevel по transcript.',
      '3. Если перескочили этап — верни на нужный вопрос через mainQuestion.',
      '4. Дай 2-4 backupQuestions на случай, если основной не пошёл.',
      '5. Если S/P или passive — добавь 1-2 selfSaleQuestions; иначе [].',
      '6. miniPitch — только если виден сигнал интереса в transcript; иначе null.',
      '7. whatToDo: 1-2 действия. whatNotToDo: 1-3 пункта.',
      '8. conversationObjective — цель именно текущего этапа. conversationDirection — куда ведём дальше.',
      '9. dealNextStep — конкретный шаг сделки, если уже уместно (диапазон чека, дата встречи).',
      'Верни строго JSON без markdown.',
    ].join('\n'),
  ].join('\n');

  const ai = await aiClient.generateJson({
    system: SALES_ASSISTANT_SYSTEM,
    user,
    feature: 'sales_assistant.analyze',
    modelRoute: 'main',
    maxTokens: 1_400,
    temperature: 0.35,
    jsonSchema: {
      name: 'sales_assistant_card',
      description: 'Live sales assistant structured mini-brief for a founder-investor conversation.',
      schema: SALES_ASSISTANT_RESPONSE_SCHEMA,
      strict: true,
    },
  });

  let parsed: Partial<AssistantCard> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<AssistantCard>;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.situation || !parsed.mainQuestion) {
    const card = heuristicCard(input);
    return { ...card, source: 'mock', provider: ai.provider, model: ai.model, fellBackToMock: true };
  }

  const stage = normalizeStage(parsed.spinStage);
  const tone = normalizeTone(parsed.tone);
  const control = normalizeControl(parsed.dealControlLevel);
  const engagement = normalizeEngagement(parsed.engagementSignal);
  const whatToDo = arrStrings(parsed.whatToDo, 4);
  const whatNotToDo = arrStrings(parsed.whatNotToDo, 4);
  const backupQuestions = arrStrings(parsed.backupQuestions, 6);
  const selfSaleQuestions = arrStrings(parsed.selfSaleQuestions, 4);
  const mainQuestion = String(parsed.mainQuestion ?? '').trim() || '—';
  const spinGaps = arrStages(parsed.spinGaps, stage);
  const conversationObjective = String(parsed.conversationObjective ?? '').trim() || defaultObjective(stage);
  const conversationDirection = String(parsed.conversationDirection ?? '').trim() || defaultDirection(stage);

  const card: CoreCard = {
    situation: String(parsed.situation),
    riskOrMissed: nullableString(parsed.riskOrMissed),
    whatToDo: whatToDo.length ? whatToDo : ['Сделай следующий шаг по SPIN.'],
    whatNotToDo,
    mainQuestion,
    backupQuestions,
    selfSaleQuestions,
    miniPitch: nullableString(parsed.miniPitch),
    conversationObjective,
    conversationDirection,
    dealNextStep: nullableString(parsed.dealNextStep),
    spinStage: stage,
    spinGaps,
    tone,
    dealControlLevel: control,
    engagementSignal: engagement,
    confidence: clampConfidence(parsed.confidence),
    objection: nullableString(parsed.objection),

    // legacy aliases
    risk: nullableString(parsed.riskOrMissed),
    recommendation: whatToDo[0] ?? '—',
    suggestedPhrase: mainQuestion,
    nextStep: nullableString(parsed.dealNextStep),
  };

  return {
    ...card,
    source: ai.provider === 'mock' ? 'mock' : 'ai',
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock,
  };
}

async function loadProjectContext(projectId?: string): Promise<string> {
  if (!projectId) return '— проект не выбран, работай как универсальный AI Sales Assistant Zapusk';
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true },
  });
  if (!project) return '— проект не найден';
  const napkin = safeParse(project.brief?.napkin, {});
  return [
    `Проект: ${project.name}`,
    `Отрасль: ${project.industry ?? 'не указана'} · Стадия: ${project.stage ?? 'не указана'}`,
    `Раунд: ${project.raiseAmount ?? 'не указано'} ${project.currency} за ${project.equityOffered ?? '—'}% · Min чек: ${project.minCheck ?? 'не указано'} ${project.currency}`,
    `Бизнес: ${project.brief?.businessSummary ?? '—'}`,
    `Монетизация: ${project.brief?.monetization ?? '—'}`,
    `Доход инвестора: ${(napkin as { investorReturn?: string }).investorReturn ?? '—'}`,
  ].join('\n');
}

function safeParse(raw: string | null | undefined, fallback: unknown) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function tail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

function formatAdvice(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 2_000);
  if (typeof raw !== 'object') return String(raw).slice(0, 2_000);
  const advice = raw as Partial<AssistantCard>;
  const main = advice.mainQuestion ?? advice.suggestedPhrase;
  const todo = Array.isArray(advice.whatToDo) ? advice.whatToDo.join(' · ') : advice.recommendation;
  return [
    advice.situation ? `Ситуация: ${advice.situation}` : '',
    todo ? `Что делать: ${todo}` : '',
    main ? `Что сказать: ${main}` : '',
    advice.spinStage ? `SPIN: ${advice.spinStage}` : '',
    advice.dealNextStep ?? advice.nextStep ? `Next step: ${advice.dealNextStep ?? advice.nextStep}` : '',
  ].filter(Boolean).join('\n').slice(0, 2_000);
}

function formatAdviceHistory(raw: unknown[] | undefined): string {
  if (!raw?.length) return '';
  return raw
    .slice(-6)
    .map((item, index) => {
      const formatted = formatAdvice(item);
      return formatted ? `${index + 1}. ${formatted}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6_000);
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function normalizeStage(raw: unknown): SpinStage {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'P' || s === 'I' || s === 'N') return s;
  return 'S';
}

function normalizeTone(raw: unknown): Tone {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'CONTROL' || t === 'CLOSE') return t;
  return 'SOFT';
}

function normalizeControl(raw: unknown): DealControl {
  const v = String(raw ?? '').toUpperCase();
  if (v === 'HIGH' || v === 'MEDIUM') return v;
  return 'LOW';
}

function normalizeEngagement(raw: unknown): Engagement {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'active' || v === 'disengaged') return v;
  return 'passive';
}

function clampConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 40;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function arrStrings(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s): s is string => Boolean(s))
    .slice(0, max);
}

function arrStages(raw: unknown, current: SpinStage): SpinStage[] {
  const order: SpinStage[] = ['S', 'P', 'I', 'N'];
  if (!Array.isArray(raw)) return defaultGapsFor(current);
  const filtered = raw
    .map((v) => String(v ?? '').toUpperCase())
    .filter((v): v is SpinStage => v === 'S' || v === 'P' || v === 'I' || v === 'N');
  const unique = Array.from(new Set(filtered));
  unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return unique;
}

function defaultGapsFor(current: SpinStage): SpinStage[] {
  // Stages strictly AFTER current are open by default.
  const order: SpinStage[] = ['S', 'P', 'I', 'N'];
  const idx = order.indexOf(current);
  return order.slice(idx + 1);
}

function nullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function defaultObjective(stage: SpinStage): string {
  switch (stage) {
    case 'S': return 'Раскрыть мотивацию и критерий принятия решения';
    case 'P': return 'Найти конкретную dissatisfaction в текущем портфеле';
    case 'I': return 'Усилить implication через упущенную возможность';
    case 'N': return 'Зафиксировать комфортный диапазон чека';
  }
}

function defaultDirection(stage: SpinStage): string {
  switch (stage) {
    case 'S': return 'Двигаемся от знакомства к Problem';
    case 'P': return 'Углубляем проблему и переходим в Implication';
    case 'I': return 'Подводим к Need-Payoff и деньгам';
    case 'N': return 'Закрепляем next step и дату следующей встречи';
  }
}

// Deterministic fallback so the cockpit still moves when no AI key is available.
// Reads simple cues — keywords like "дорого", "подумаю", "не сейчас" jump us into
// objection-handling; questions about money push us into N+CLOSE.
function heuristicCard(input: AnalyzeInput): CoreCard {
  const text = `${input.recentContext ?? ''}\n${input.transcript}`.toLowerCase();
  const hits = (re: RegExp) => re.test(text);

  let stage: SpinStage = 'S';
  let tone: Tone = 'SOFT';
  let control: DealControl = 'LOW';
  let engagement: Engagement = 'passive';
  let confidence = 38;
  let situation = 'Инвестор раскрывает контекст. Идёт фаза знакомства, фиксируй интересы.';
  let whatToDo: string[] = ['Задай открытый вопрос про текущий портфель и горизонт инвестиций.'];
  let whatNotToDo: string[] = ['Не уходи в монолог про проект — сначала раскрой инвестора.'];
  let mainQuestion = 'Скажите, во что сейчас инвестируете и какой горизонт обычно вам комфортен?';
  let backupQuestions: string[] = [
    'Какие проекты сейчас в вашем портфеле кажутся самыми удачными?',
    'Что для вас важно при выборе нового проекта — доходность, срок или управляемость?',
    'Как вы обычно принимаете решение: один или с партнёром / семьёй?',
  ];
  let selfSaleQuestions: string[] = [
    'Что вас вообще зацепило в этой теме?',
    'Почему решили подключиться и пообщаться?',
  ];
  let miniPitch: string | null = null;
  let objective = defaultObjective(stage);
  let direction = defaultDirection(stage);
  let dealNextStep: string | null = 'Получить 2-3 факта о текущем портфеле инвестора';
  let objection: string | null = null;
  let riskOrMissed: string | null = null;

  if (hits(/расскажите|кто вы|что вы делаете|чем зани/)) {
    stage = 'S'; tone = 'SOFT'; confidence = 42;
    situation = 'Инвестор просит представить проект. Это вход, не уходи в монолог.';
    whatToDo = ['Короткий питч 30-40 сек.', 'В конце — встречный вопрос инвестору.'];
    whatNotToDo = ['Не пересказывай весь deck — это убивает диалог.'];
    mainQuestion = 'Если коротко, мы делаем X для Y. Прежде чем погрузимся — что вам было бы интереснее в первую очередь: экономика, команда, рынок?';
    backupQuestions = [
      'Какой угол вам ближе — продукт, юнит-экономика или рынок?',
      'С каких проектов вы обычно начинаете знакомство — цифры или команда?',
    ];
    dealNextStep = 'Завершить мини-питч встречным вопросом';
    objective = 'Завести разговор и узнать, что для инвестора важнее в первую очередь';
    direction = 'От мини-питча к выявлению критериев инвестора (S → P)';
  }

  if (hits(/проблем|сложн|не получает|тяжел|не устраив|просад|падает/)) {
    stage = 'P'; tone = 'CONTROL'; control = 'MEDIUM'; engagement = 'active'; confidence = 52;
    situation = 'Инвестор начал говорить о неудовлетворённости в своём портфеле.';
    whatToDo = ['Углубляй Problem конкретной цифрой или сегментом.', 'Не уходи в продажу проекта.'];
    whatNotToDo = ['Не предлагай решение до того, как Problem прозвучит явно.'];
    mainQuestion = 'А в вашем случае — где сейчас основная просадка по доходности идёт?';
    backupQuestions = [
      'Что больше всего разочаровало в последних сделках?',
      'Какой проект из портфеля сейчас вызывает больше всего вопросов?',
      'Что бы вы хотели сейчас иметь в портфеле, но не можете найти?',
    ];
    selfSaleQuestions = ['Что бы вы изменили в текущем портфеле, если бы могли?'];
    dealNextStep = 'Получить конкретику по проблеме до перехода в Implication';
    objective = 'Найти конкретную dissatisfaction в текущем портфеле';
    direction = 'От обозначенной проблемы — к её последствиям (P → I)';
  }

  if (hits(/упуст|можно было|если бы|разрыв|ожидал|планировал|год назад|должен был/)) {
    stage = 'I'; tone = 'CONTROL'; control = 'MEDIUM'; engagement = 'active'; confidence = 60;
    situation = 'Инвестор сам оценивает упущенные возможности — момент для Implication.';
    whatToDo = ['Усиливай через конкретный сценарий «ожидание vs факт».', 'Не дави — пусть он сам признает последствие.'];
    whatNotToDo = ['Не переходи в N до того, как Implication прозвучит явно.'];
    mainQuestion = 'А если бы такая сделка была год назад — это закрыло бы тот разрыв, который вы сейчас описываете?';
    backupQuestions = [
      'Если этот разрыв сохранится ещё год — как это повлияет на ваш план?',
      'Что для вас будет показателем, что новая сделка реально закрыла этот вопрос?',
    ];
    selfSaleQuestions = [];
    dealNextStep = 'Подвести к Need-Payoff: «такое решение для вас приоритет?»';
    objective = 'Усилить implication через упущенную возможность';
    direction = 'От признанного последствия — к выгоде и деньгам (I → N)';
  }

  if (hits(/сколько|какой возврат|какая доходность|когда вернёт|через сколько|чек|оценк|ирр|irr|x\d/)) {
    stage = 'N'; tone = 'CLOSE'; control = 'HIGH'; engagement = 'active'; confidence = 70;
    situation = 'Инвестор задаёт прямые вопросы про деньги. Можно идти на Close.';
    whatToDo = ['Дай конкретный ответ цифрами.', 'Спроси про комфортный диапазон чека.'];
    whatNotToDo = ['Не открывай новые темы — закрепляй сделку.'];
    mainQuestion = 'Базовый сценарий — окупаемость 2 сезона, x4 за 3 года при минимальном чеке от 1 млн ₽. Какой диапазон сейчас вам комфортен, чтобы зайти без перегруза?';
    backupQuestions = [
      'Какие два показателя вам критично проверить, чтобы принять решение?',
      'Когда вам было бы удобно вернуться к разговору с цифрами в руках?',
    ];
    selfSaleQuestions = [];
    miniPitch = 'Коротко: мы зашли в нишу X с дефицитом Y, базовый сценарий — окупаемость 2 сезона, x4 за 3 года. Сейчас закрываем раунд на N млн. Хотите посмотреть финмодель и обсудить, какой диапазон чека вам комфортен?';
    dealNextStep = 'Зафиксировать диапазон чека и дату следующей встречи';
    objective = 'Зафиксировать комфортный диапазон чека';
    direction = 'От цифр — к фиксации next step и дате созвона';
  }

  if (hits(/подумаю|подумать|потом|позже|сейчас не готов/)) {
    objection = 'I will think';
    stage = 'P'; tone = 'CONTROL'; control = 'LOW'; engagement = 'disengaged'; confidence = 28;
    situation = 'Инвестор уходит в «подумаю» — теряем контроль над next step.';
    whatToDo = ['Не отпускай в неопределённость.', 'Уточни, что конкретно надо понять для решения.'];
    whatNotToDo = ['Не соглашайся с «подумаю» без конкретного списка вопросов.'];
    mainQuestion = 'Скажите, что именно вы хотите понять или проверить, чтобы принять решение?';
    backupQuestions = [
      'Какие открытые вопросы по проекту у вас остались?',
      'Что должно появиться в материалах, чтобы вам было удобно принять решение?',
      'Когда вам комфортно вернуться к разговору — на этой неделе или на следующей?',
    ];
    dealNextStep = 'Получить от инвестора список конкретных открытых вопросов';
    riskOrMissed = 'Без конкретики next step встреча закончится без продвижения сделки';
    objective = 'Перевести «подумаю» в конкретный список вопросов и дату';
    direction = 'От ухода — обратно в Problem и фиксированный follow-up';
  }

  if (hits(/дорого|чек большой|много|сейчас не могу|не сейчас|нет таких/)) {
    objection = 'Too expensive / not now';
    stage = 'N'; tone = 'CLOSE'; control = 'MEDIUM'; engagement = 'passive'; confidence = 35;
    situation = 'Инвестор не проходит по чеку. Не дави — перенацель на комфортный диапазон.';
    whatToDo = ['Зафиксируй отказ по текущему проекту, но не закрывай разговор.', 'Подбери альтернативу под чек.'];
    whatNotToDo = ['Не уговаривай и не снижай ценность проекта.'];
    mainQuestion = 'Понял вас. Тогда давайте отталкиваться от комфортного — какой диапазон сейчас был бы спокойный, чтобы начать?';
    backupQuestions = [
      'А есть проект в портфеле, который сейчас по чеку для вас был бы как раз?',
      'Что обычно для вас является комфортным чеком на первое касание?',
    ];
    selfSaleQuestions = [];
    dealNextStep = 'Подобрать вариант под обозначенный чек';
    objective = 'Зафиксировать комфортный диапазон чека без давления';
    direction = 'От возражения «дорого» — к альтернативному проекту под чек';
  }

  if (hits(/риск|опасно|сомнев|не уверен|боюсь|ликвид/)) {
    riskOrMissed = riskOrMissed ?? 'Инвестор обозначает страх — не игнорируй';
    if (stage === 'S') stage = 'P';
    tone = 'CONTROL';
    whatToDo = ['Назови риск своими словами.', 'Дай конкретный митигатор из проекта.'];
    whatNotToDo = ['Не обесценивай страх инвестора.'];
    mainQuestion = 'Согласен, риск есть. Конкретно по этому риску в проекте есть [митигатор] — как вы оцениваете его достаточность?';
    backupQuestions = [
      'Какой сценарий выхода был бы для вас наиболее спокойным?',
      'Что должно быть в проекте, чтобы этот риск перестал быть блокером?',
    ];
  }

  // SPIN gaps default — everything STRICTLY before current is considered done,
  // everything AFTER is open. AI overrides this; mock keeps it deterministic.
  const spinGaps = defaultGapsFor(stage);

  const core: CoreCard = {
    situation,
    riskOrMissed,
    whatToDo,
    whatNotToDo,
    mainQuestion,
    backupQuestions,
    selfSaleQuestions,
    miniPitch,
    conversationObjective: objective,
    conversationDirection: direction,
    dealNextStep,
    spinStage: stage,
    spinGaps,
    tone,
    dealControlLevel: control,
    engagementSignal: engagement,
    confidence,
    objection,
    risk: riskOrMissed,
    recommendation: whatToDo[0] ?? '—',
    suggestedPhrase: mainQuestion,
    nextStep: dealNextStep,
  };

  return avoidRepeatedAdvice(core, input);
}

function avoidRepeatedAdvice(card: CoreCard, input: AnalyzeInput): CoreCard {
  const previous = `${formatAdvice(input.previousAdvice)}\n${formatAdviceHistory(input.adviceHistory)}`.toLowerCase();
  if (!previous || !card.mainQuestion || !previous.includes(card.mainQuestion.toLowerCase())) return card;

  if (card.spinStage === 'S') {
    const stage: SpinStage = 'P';
    const main = 'А где в текущем портфеле вы видите главный разрыв: доходность, срок возврата или управляемость риска?';
    return {
      ...card,
      spinStage: stage,
      tone: 'CONTROL',
      spinGaps: defaultGapsFor(stage),
      situation: 'Контекст уже раскрыт, пора искать конкретную неудовлетворённость.',
      whatToDo: ['Перейди от знакомства к проблеме.', 'Попроси назвать слабое место в портфеле.'],
      whatNotToDo: ['Не возвращайся к общим вопросам — это потеря темпа.'],
      mainQuestion: main,
      suggestedPhrase: main,
      recommendation: 'Перейди от знакомства к проблеме.',
      backupQuestions: [
        'Какой из ваших проектов сейчас вызывает больше всего сомнений?',
        'Что для вас сейчас не закрывает текущий портфель?',
      ],
      selfSaleQuestions: ['Что бы вы хотели иметь в портфеле, но пока не нашли?'],
      dealNextStep: 'Получить одну конкретную проблему инвестора',
      nextStep: 'Получить одну конкретную проблему инвестора',
      conversationObjective: defaultObjective(stage),
      conversationDirection: defaultDirection(stage),
    };
  }

  if (card.spinStage === 'P') {
    const stage: SpinStage = 'I';
    const main = 'Если этот разрыв сохранится ещё год, как это повлияет на ваш план по доходности?';
    return {
      ...card,
      spinStage: stage,
      tone: 'CONTROL',
      spinGaps: defaultGapsFor(stage),
      situation: 'Проблема уже обозначена, теперь важно показать её последствия.',
      whatToDo: ['Усиль implication через сценарий потерь.', 'Не дави, дай ему самому признать последствие.'],
      whatNotToDo: ['Не уходи в продажу проекта раньше времени.'],
      mainQuestion: main,
      suggestedPhrase: main,
      recommendation: 'Усиль implication через сценарий потерь.',
      backupQuestions: [
        'Если ничего не менять — как это будет выглядеть через 2-3 года?',
        'Какой результат вы ожидали изначально и сколько до него сейчас не хватает?',
      ],
      selfSaleQuestions: [],
      dealNextStep: 'Получить признание последствия от самого инвестора',
      nextStep: 'Получить признание последствия от самого инвестора',
      conversationObjective: defaultObjective(stage),
      conversationDirection: defaultDirection(stage),
    };
  }

  if (card.spinStage === 'I') {
    const stage: SpinStage = 'N';
    const main = 'Если проект закрывает именно этот разрыв, какой чек вам было бы комфортно рассмотреть первым шагом?';
    return {
      ...card,
      spinStage: stage,
      tone: 'CLOSE',
      dealControlLevel: 'HIGH',
      spinGaps: defaultGapsFor(stage),
      situation: 'Инвестор уже понимает последствия, можно переводить разговор к выгоде и условиям.',
      whatToDo: ['Свяжи выгоду проекта с его задачей.', 'Уточни комфортный чек.'],
      whatNotToDo: ['Не открывай новые темы — закрепляй на деньгах.'],
      mainQuestion: main,
      suggestedPhrase: main,
      recommendation: 'Свяжи выгоду проекта с его задачей и уточни чек.',
      backupQuestions: [
        'Если по-другому сформулировать — какой результат от этой сделки был бы для вас «ок»?',
        'Что должно произойти после нашего разговора, чтобы вы зашли в проект?',
      ],
      selfSaleQuestions: [],
      dealNextStep: 'Зафиксировать диапазон чека',
      nextStep: 'Зафиксировать диапазон чека',
      conversationObjective: defaultObjective(stage),
      conversationDirection: defaultDirection(stage),
    };
  }

  const main = 'Давайте зафиксируем следующий шаг: какие два показателя вам нужно проверить, чтобы принять решение?';
  return {
    ...card,
    tone: 'CLOSE',
    dealControlLevel: 'HIGH',
    spinGaps: [],
    situation: 'Разговор уже в деньгах, не возвращайся к общему питчу.',
    whatToDo: ['Закрепи следующий шаг: дата, материалы и критерий решения.'],
    whatNotToDo: ['Не давай новых обещаний — фиксируй то, что уже обсуждали.'],
    mainQuestion: main,
    suggestedPhrase: main,
    recommendation: 'Закрепи следующий шаг: дата, материалы, критерий решения.',
    backupQuestions: [
      'Что нужно от меня к следующей встрече, чтобы решение можно было закрыть?',
      'Какая дата на этой неделе вам комфортна для следующего звонка?',
    ],
    selfSaleQuestions: [],
    dealNextStep: 'Назначить дату следующего контакта и критерии решения',
    nextStep: 'Назначить дату следующего контакта и критерии решения',
    conversationObjective: 'Зафиксировать дату следующего контакта и критерии решения',
    conversationDirection: 'Закрепляем next step встречи и материалы',
  };
}
