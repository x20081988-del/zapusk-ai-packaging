import { prisma } from '../db.js';
import { aiClient } from '../ai/client.js';
import { SALES_ASSISTANT_SYSTEM } from '../ai/salesAssistantPrompt.js';
import { MEETING_PREP_SYSTEM_FALLBACK } from '../ai/meetingPrepPrompt.js';
import {
  QUALIFICATION_SYSTEM_OVERLAY,
  formatQualificationContextBlock,
  isQualificationScriptKey,
  type QualificationScriptKey,
} from '../ai/qualificationPrompts.js';
import {
  retrieveKnowledgeForTranscript,
  formatKnowledgeForPrompt,
  formatKnowledgeForUi,
} from './knowledgeService.js';

// Sprint 34Б.2 — prompt-engineering должен быть управляемым слоем платформы.
// `analyzeSalesTurn` теперь читает активный template `sales_gpt` из БД и
// использует его body как system-prompt. Если template отсутствует / выключен /
// пустой — громко в лог + AuditEvent + fallback на hardcoded SALES_ASSISTANT_SYSTEM.
// Это превращает prompt из «часть кода» в «настройку суперадмина без redeploy».
const SALES_PROMPT_TEMPLATE_KEY = 'sales_gpt';
const MEETING_PREP_TEMPLATE_KEY = 'sales_assistant.prepare_meeting';

export type SalesPromptSource = 'db' | 'fallback';

async function resolveSalesPrompt(): Promise<{ system: string; source: SalesPromptSource; templateId: string | null }> {
  try {
    // Sprint 34Б.2 — findFirst без active filter, чтобы различать «нет
    // template вообще» vs «template есть, но выключен».
    const tpl = await prisma.promptTemplate.findFirst({
      where: { key: SALES_PROMPT_TEMPLATE_KEY },
    });
    if (tpl && tpl.active && tpl.body && tpl.body.trim().length > 200) {
      return { system: tpl.body, source: 'db', templateId: tpl.id };
    }
    const reason = !tpl
      ? 'not_found'
      : !tpl.active
        ? 'inactive'
        : (tpl.body?.trim().length ?? 0) <= 200
          ? 'body_too_short'
          : 'unknown';
    console.warn(
      `[sales-assistant] template "${SALES_PROMPT_TEMPLATE_KEY}" not usable (reason=${reason}) — ` +
      `falling back to hardcoded SALES_ASSISTANT_SYSTEM. ` +
      `Edit template via super-admin → /templates to control prompt without redeploy.`,
    );
    await prisma.auditEvent.create({
      data: {
        action: 'sales_prompt.fallback',
        targetType: 'PromptTemplate',
        targetId: tpl?.id ?? null,
        payload: JSON.stringify({
          key: SALES_PROMPT_TEMPLATE_KEY,
          reason,
          active: tpl?.active ?? null,
          bodyLen: tpl?.body?.length ?? 0,
        }),
      },
    }).catch((err) => console.warn('[sales-assistant] audit write failed:', err));
    return { system: SALES_ASSISTANT_SYSTEM, source: 'fallback', templateId: null };
  } catch (err) {
    console.warn(`[sales-assistant] template fetch failed, using hardcoded fallback:`, err);
    return { system: SALES_ASSISTANT_SYSTEM, source: 'fallback', templateId: null };
  }
}

async function resolveMeetingPrepPrompt(): Promise<{
  system: string;
  source: SalesPromptSource;
  templateId: string | null;
  version: number | null;
}> {
  try {
    const tpl = await prisma.promptTemplate.findFirst({
      where: { key: MEETING_PREP_TEMPLATE_KEY },
    });
    if (tpl && tpl.active && tpl.body && tpl.body.trim().length > 200) {
      return { system: tpl.body, source: 'db', templateId: tpl.id, version: tpl.version ?? null };
    }
    const reason = !tpl
      ? 'not_found'
      : !tpl.active
        ? 'inactive'
        : (tpl.body?.trim().length ?? 0) <= 200
          ? 'body_too_short'
          : 'unknown';
    console.warn(
      `[sales-assistant:prepare] template "${MEETING_PREP_TEMPLATE_KEY}" not usable (reason=${reason}) — ` +
      'falling back to hardcoded meeting prep prompt.',
    );
    await prisma.auditEvent.create({
      data: {
        action: 'sales_prep_prompt.fallback',
        targetType: 'PromptTemplate',
        targetId: tpl?.id ?? null,
        payload: JSON.stringify({
          key: MEETING_PREP_TEMPLATE_KEY,
          reason,
          active: tpl?.active ?? null,
          bodyLen: tpl?.body?.length ?? 0,
          version: tpl?.version ?? null,
        }),
      },
    }).catch((err) => console.warn('[sales-assistant:prepare] audit write failed:', err));
    return { system: MEETING_PREP_SYSTEM_FALLBACK, source: 'fallback', templateId: null, version: null };
  } catch (err) {
    console.warn(`[sales-assistant:prepare] template fetch failed, using hardcoded fallback:`, err);
    return { system: MEETING_PREP_SYSTEM_FALLBACK, source: 'fallback', templateId: null, version: null };
  }
}

export type AssistantDeskMode = 'meeting' | 'qualification';

export interface AnalyzeInput {
  transcript: string;       // полный transcript встречи на момент ручного обновления
  recentContext?: string;   // последние N символов разговора
  previousAdvice?: unknown;
  previousSpinStage?: SpinStage | null;
  adviceHistory?: unknown[];
  projectId?: string | null;
  // Sprint 38 — роль актора нужна для KB retrieval (visibility-фильтр,
  // raw vs redacted snippet). Передаётся route'ом из getActorRole(req).
  actorRole?: string;
  actorId?: string | null;
  // Sprint 41 P0.8 — workspaceStatus актора. demo workspace получает только
  // demo+synthetic KB; production — production+synthetic. Без этого demo-user
  // может случайно достать production-кейсы. Передаётся route'ом из
  // req.user.workspaceStatus.
  workspaceStatus?: string | null;
  // Sprint 51 — desk mode. 'meeting' = полная встреча с фаундером (default).
  // 'qualification' = первичный звонок инвестору с целью назначить Zoom.
  // Меняет system overlay и user context, но НЕ меняет JSON schema ответа.
  mode?: AssistantDeskMode;
  // Sprint 51 — какой скрипт квалификации использовать. Игнорируется в
  // режиме 'meeting'. Если 'qualification' но scriptKey не передан —
  // используем 'generic' (опираемся на projectContext / прошлые подсказки).
  scriptKey?: QualificationScriptKey | null;
}

// Sprint 38 — KB-источники, использованные в AI-подсказке. Возвращаем их
// в response, чтобы фронт мог нарисовать бейдж «опирается на N кейсов» и
// (для admin/manager) раскрыть snippets. Для founder фронт получает только
// title + sourceType + summary; raw snippet — null.
export interface UsedKnowledgeSource {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: 'global' | 'project';
  summary: string | null;
  snippet: string | null;
}

// Sprint 40 P0.6 — retrieval event meta-данные. Прокидываем наверх из
// сервиса, чтобы route мог записать единый audit-event с этой структурой.
// НЕ содержит chunk text / transcript / prompt — только metadata.
export interface KnowledgeRetrievalMeta {
  feature: string;
  sourceIds: string[];
  count: number;
  chunksScanned: number;
  totalChars: number;
}

export type SpinStage = 'S' | 'P' | 'I' | 'N';
export type Tone = 'SOFT' | 'CONTROL' | 'CLOSE';
export type DealControl = 'LOW' | 'MEDIUM' | 'HIGH';
export type Engagement = 'active' | 'passive' | 'disengaged';
// Sprint 13: emotional layer
export type InvestorState =
  | 'OPEN'
  | 'CURIOUS'
  | 'SKEPTICAL'
  | 'DEFENSIVE'
  | 'ENGAGED'
  | 'RATIONALIZING'
  | 'READY'
  | 'DISCONNECTED';
export type Momentum = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type ConversationTemperature = 'COLD' | 'WARM' | 'HOT';

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

  // Sprint 13: emotional layer
  emotionalState: string;
  whyBehavior: string;
  investorState: InvestorState;
  momentum: Momentum;
  momentumReason: string;
  conversationTemperature: ConversationTemperature;
  emotionalRisks: string[];
  toneShiftGuidance: string;

  // Legacy aliases (kept so older UI / history consumers keep working)
  risk: string | null;
  recommendation: string;
  suggestedPhrase: string;
  nextStep: string | null;

  source: 'ai' | 'mock';
  provider: 'anthropic' | 'openai' | 'mock';
  model: string;
  fellBackToMock: boolean;
  // Sprint 34Б.2 — откуда пришёл system-prompt:
  //   'db'       — активный template `sales_gpt` из суперадминки
  //   'fallback' — hardcoded SALES_ASSISTANT_SYSTEM (template отсутствует/выключен)
  promptSource: SalesPromptSource;
  promptTemplateId: string | null;
  // Sprint 38 — KB-источники, использованные при построении этой подсказки.
  // Founder получает только title+sourceType+summary; admin/manager — также snippet.
  usedKnowledgeSources: UsedKnowledgeSource[];
  // Sprint 40 — meta для audit-write (route пишет, не сам сервис, чтобы
  // recordAudit имел доступ к Request).
  knowledgeRetrievalMeta: KnowledgeRetrievalMeta;
  // Sprint 48A — детерминированные сигналы контекста, которые сервер
  // распознал до/после AI-ответа и использовал для safety-override карточки.
  contextSignals?: Array<'investor_requests_project_details'>;
}

type CoreCard = Omit<AssistantCard, 'source' | 'provider' | 'model' | 'fellBackToMock' | 'promptSource' | 'promptTemplateId' | 'usedKnowledgeSources' | 'knowledgeRetrievalMeta'>;

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
    // Sprint 13: emotional layer
    emotionalState: { type: 'string' },
    whyBehavior: { type: 'string' },
    investorState: {
      type: 'string',
      enum: ['OPEN', 'CURIOUS', 'SKEPTICAL', 'DEFENSIVE', 'ENGAGED', 'RATIONALIZING', 'READY', 'DISCONNECTED'],
    },
    momentum: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
    momentumReason: { type: 'string' },
    conversationTemperature: { type: 'string', enum: ['COLD', 'WARM', 'HOT'] },
    emotionalRisks: { type: 'array', items: { type: 'string' } },
    toneShiftGuidance: { type: 'string' },
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
    'emotionalState',
    'whyBehavior',
    'investorState',
    'momentum',
    'momentumReason',
    'conversationTemperature',
    'emotionalRisks',
    'toneShiftGuidance',
  ],
} satisfies Record<string, unknown>;

const PROJECT_DETAILS_TRANSITION_PHRASE = 'Да, понял, давайте тогда коротко по сути проекта...';

interface ProjectDetailsSignal {
  active: boolean;
  count: number;
  labels: string[];
  projectName: string | null;
}

function detectProjectDetailsRequest(input: AnalyzeInput): ProjectDetailsSignal {
  const text = `${input.recentContext ?? ''}\n${input.transcript}`.toLowerCase();
  const patterns: Array<{ label: string; re: RegExp }> = [
    { label: 'расскажите про проект', re: /расскаж(?:ите|и|ем|у|ать)?[\s\S]{0,80}?про\s+проект/giu },
    { label: 'дайте конкретику', re: /дайте\s+конкретик[уы]/giu },
    { label: 'мне нужна информация', re: /мне\s+нужн[аы]?\s+информац(?:ия|ии|ию)/giu },
    { label: 'говорить про проект', re: /говор(?:ить|ите|им|ю)[\s\S]{0,80}?про\s+проект/giu },
    { label: 'что за проект', re: /что\s+за\s+проект/giu },
    { label: 'покажите проект', re: /покаж(?:ите|и)[\s\S]{0,60}?проект/giu },
    { label: 'проект Delphi / DLFY', re: /проект\s+(?:delphi|dlfy|делфи|дэлфи|длфи)/giu },
  ];

  let count = 0;
  const labels = new Set<string>();
  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    const matches = text.match(pattern.re);
    if (matches?.length) {
      count += matches.length;
      labels.add(pattern.label);
    }
  }

  const projectNameMatch = text.match(/проект\s+(delphi|dlfy|делфи|дэлфи|длфи)/iu);
  const projectName = projectNameMatch?.[1]
    ? /dlfy|длфи/iu.test(projectNameMatch[1])
      ? 'DLFY'
      : 'Delphi'
    : null;

  return {
    active: count >= 2,
    count,
    labels: Array.from(labels),
    projectName,
  };
}

function formatProjectDetailsPromptRule(signal: ProjectDetailsSignal): string {
  if (!signal.active) {
    return [
      'Правило контекста:',
      `Если инвестор 2+ раза просит конкретику по проекту, презентацию, детали, цифры или говорит «расскажите про проект», НЕ продолжай абстрактный СПИН.`,
      `В этом случае признай запрос, перейди к короткому мини-питчу проекта фразой «${PROJECT_DETAILS_TRANSITION_PHRASE}», затем верни контроль уточняющим вопросом.`,
    ].join('\n');
  }

  return [
    'ВАЖНЫЙ ДЕТЕКТОР КОНТЕКСТА: investor_requests_project_details.',
    `Сработал сигнал: инвестор ${signal.count} раз просит конкретику по проекту${signal.projectName ? ` ${signal.projectName}` : ''}.`,
    `Нельзя продолжать абстрактный СПИН. Сейчас нужно признать запрос, перейти к краткому питчу проекта и начать mainQuestion с: «${PROJECT_DETAILS_TRANSITION_PHRASE}».`,
    'В whatNotToDo обязательно добавь: «Не продолжать задавать общие вопросы, инвестор уже просит конкретику».',
  ].join('\n');
}

function applyProjectDetailsOverride(card: CoreCard, signal: ProjectDetailsSignal): CoreCard {
  if (!signal.active) return card;

  const projectLabel = signal.projectName ? ` ${signal.projectName}` : '';
  const whatNotToDo = [
    'Не продолжать задавать общие вопросы, инвестор уже просит конкретику.',
    ...card.whatNotToDo.filter((line) => !/общие вопросы|конкретик|спин/i.test(line)),
  ].slice(0, 4);

  return {
    ...card,
    situation: `Инвестор несколько раз просит конкретику по проекту${projectLabel}. Сейчас он ждёт не новый общий вопрос, а короткое объяснение сути, цифр и условий.`,
    riskOrMissed: 'Если продолжить задавать абстрактные СПИН-вопросы, разговор будет выглядеть как уход от прямого запроса инвестора.',
    whatToDo: [
      'Признать запрос и перейти к мини-питчу проекта: что это, кому нужно, экономика, условия участия.',
      'Через 30-45 секунд вернуть контроль вопросом: что инвестору проверить первым — модель дохода, цифры или условия входа?',
    ],
    whatNotToDo,
    mainQuestion: PROJECT_DETAILS_TRANSITION_PHRASE,
    backupQuestions: [
      'Если коротко по проекту: сначала показать модель дохода, рынок или условия входа?',
      'Что вам важнее услышать первым: экономику проекта, команду или механику сделки?',
      ...card.backupQuestions.filter((q) => !/портфел|горизонт|интерес/i.test(q)),
    ].slice(0, 4),
    selfSaleQuestions: [],
    miniPitch: card.miniPitch ?? 'Коротко: объясните проект через 3 опоры — какую задачу решает, на чём зарабатывает, какие условия участия и следующий проверочный шаг для инвестора.',
    conversationObjective: 'Ответить на прямой запрос инвестора конкретикой по проекту и вернуть управляемый диалог.',
    conversationDirection: 'Мини-питч проекта → уточнить, какой блок инвестор хочет проверить глубже.',
    dealNextStep: card.dealNextStep ?? 'После мини-питча отправить материалы или назначить созвон по цифрам.',
    recommendation: 'Перейти к короткому мини-питчу проекта и затем вернуть контроль вопросом.',
    suggestedPhrase: PROJECT_DETAILS_TRANSITION_PHRASE,
    nextStep: card.nextStep ?? 'Дать конкретику по проекту и согласовать, какие материалы отправить.',
    confidence: Math.max(card.confidence, 82),
    contextSignals: ['investor_requests_project_details'],
  };
}

function applyProjectDetailsOverrideFast(card: FastAssistantCard, signal: ProjectDetailsSignal): FastAssistantCard {
  if (!signal.active) return card;

  return {
    ...card,
    mainQuestion: PROJECT_DETAILS_TRANSITION_PHRASE,
    backupQuestions: [
      'Что вам важнее услышать первым: экономику проекта, команду или условия входа?',
      'После короткого обзора вам удобнее посмотреть презентацию или сразу пройтись по цифрам?',
    ],
    selfSaleQuestions: [],
    spinStage: 'S',
    contextSignals: ['investor_requests_project_details'],
  };
}

// Sprint 51 — qualification overlay. Принимает базовый sales_gpt system и,
// если mode='qualification', добавляет QUALIFICATION_SYSTEM_OVERLAY с
// явной целью «закрыть на Zoom, не на сделку». В режиме 'meeting' возвращает
// исходный system без изменений — гарантия отсутствия регрессии.
function applyDeskMode(system: string, input: AnalyzeInput): string {
  if (input.mode !== 'qualification') return system;
  return `${system}\n\n${QUALIFICATION_SYSTEM_OVERLAY}`;
}

// Sprint 51 — qualification script block для user prompt. В режиме
// 'meeting' возвращает пустую строку (промпт остаётся прежним).
function qualificationContextLines(input: AnalyzeInput): string[] {
  if (input.mode !== 'qualification') return [];
  const key = isQualificationScriptKey(input.scriptKey) ? input.scriptKey : 'generic';
  return [formatQualificationContextBlock(key), ''];
}

export async function analyzeSalesTurn(input: AnalyzeInput): Promise<AssistantCard> {
  const projectContext = await loadProjectContext(input.projectId ?? undefined);
  const recentContext = input.recentContext?.trim() || tail(input.transcript, 6_000);
  const previousAdvice = formatAdvice(input.previousAdvice);
  const adviceHistory = formatAdviceHistory(input.adviceHistory);
  const projectDetailsSignal = detectProjectDetailsRequest(input);
  // Sprint 34Б.2 — system-prompt теперь из template `sales_gpt`. Изменения
  // в админке отражаются на следующем запросе AI, без deploy.
  const promptDecision = await resolveSalesPrompt();
  const deskMode: AssistantDeskMode = input.mode === 'qualification' ? 'qualification' : 'meeting';
  console.log(
    `[sales-assistant] mode=${deskMode} prompt source=${promptDecision.source} ` +
    `templateId=${promptDecision.templateId ?? 'none'} ` +
    `scriptKey=${deskMode === 'qualification' ? (input.scriptKey ?? 'generic') : '-'}`,
  );

  // Sprint 38 — Knowledge Base retrieval. Подмешиваем релевантный опыт ZAPUSK
  // в prompt: успешные продажи, objections, follow-up, кейсы. Project isolation
  // и role-based visibility гарантируются knowledgeService.
  // Retrieval не падает при пустой KB — просто возвращает sources=[] и
  // блок «Релевантный опыт» в prompt не появляется.
  const knowledge = await retrieveKnowledgeForTranscript(input.transcript, {
    projectId: input.projectId ?? null,
    role: input.actorRole ?? 'FOUNDER',
    topN: 5,
    feature: 'sales_assistant.analyze',
    // Sprint 41 P0.6 — full mode: широкий candidate set + hybrid rerank.
    mode: 'full',
    // Sprint 41 P0.8 — environment-filter из workspaceStatus.
    environment: workspaceToEnvironment(input.workspaceStatus),
  });
  // Sprint 40 P0.5 — full analyze: до 4000 символов (Sprint 41 P0.6 поднял с 2500
  // ради hybrid'ного шире-canditate'а; top-result-dominance проверка не даст
  // prompt'у наполниться шумом).
  const knowledgeBlock = formatKnowledgeForPrompt(knowledge, input.actorRole ?? 'FOUNDER', { charBudget: 4000 });
  const knowledgeForUi = formatKnowledgeForUi(knowledge, input.actorRole ?? 'FOUNDER');
  const knowledgeRetrievalMeta: KnowledgeRetrievalMeta = {
    feature: 'sales_assistant.analyze',
    sourceIds: knowledge.sources.map((s) => s.sourceId),
    count: knowledge.sources.length,
    chunksScanned: knowledge.totalChunksScanned,
    totalChars: knowledgeBlock.length,
  };
  if (knowledge.sources.length > 0) {
    console.log(`[sales-assistant] kb sources=${knowledge.sources.length} scanned=${knowledge.totalChunksScanned}`);
  }

  const user = [
    deskMode === 'qualification'
      ? 'Режим работы: первичный звонок инвестору (qualification). Цель — назначить Zoom-встречу с экспертом + узнать чек/срок/критерии. См. system overlay.'
      : 'Режим работы: live AI co-pilot переговоров с инвестором. Это НЕ summary встречи.',
    'Сформируй structured mini-brief для текущего момента. Каждый блок 1-3 строки, не больше.',
    'Не повторяй previousAdvice и предыдущий mainQuestion дословно. Если этап S уже закрыт — двигай в P/I/N.',
    '',
    ...qualificationContextLines(input),
    'Контекст проекта:',
    projectContext,
    '',
    // Sprint 38 — knowledge block. Вставляется ПОСЛЕ project context и ПЕРЕД
    // SPIN-history, чтобы AI «знал» команду до того, как смотрит на текущий
    // разговор. Если KB пустая — блок пропускается.
    ...(knowledgeBlock
      ? ['Релевантный опыт ZAPUSK (используй как контекст, не цитируй дословно):', knowledgeBlock, '']
      : []),
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
    formatProjectDetailsPromptRule(projectDetailsSignal),
    '',
    [
      'Задача:',
      '1. Определи spinStage и какие spinGaps ещё открыты в разговоре.',
      '2. Оцени engagementSignal и dealControlLevel по transcript (учитывай длину ответов, встречные вопросы, эмоциональные слова, защитные реакции, уход в «подумаю»).',
      '3. Sprint 13 — эмоциональный слой: определи investorState, conversationTemperature, momentum (с прошлой реплики). Напиши emotionalState (что эмоционально происходит), whyBehavior (почему он так отвечает), momentumReason (что сдвинуло динамику), emotionalRisks (что может сломать сделку прямо сейчас), toneShiftGuidance (как изменить стиль).',
      '4. Если перескочили этап — верни на нужный вопрос через mainQuestion.',
      '5. Дай 2-4 backupQuestions на случай, если основной не пошёл.',
      '6. Если S/P или passive — добавь 1-2 selfSaleQuestions; иначе [].',
      '7. miniPitch — только если виден сигнал интереса в transcript; иначе null.',
      '8. whatToDo: 1-2 действия. whatNotToDo: 1-3 пункта.',
      '9. conversationObjective — цель именно текущего этапа. conversationDirection — куда ведём дальше.',
      '10. dealNextStep — конкретный шаг сделки, если уже уместно (диапазон чека, дата встречи).',
      'Верни строго JSON без markdown.',
    ].join('\n'),
  ].join('\n');

  const ai = await aiClient.generateJson({
    system: applyDeskMode(promptDecision.system, input),
    user,
    feature: 'sales_assistant.analyze',
    modelRoute: 'main',
    maxTokens: 2_400,
    temperature: 0.35,
    jsonSchema: {
      name: 'sales_assistant_card',
      description: 'Live sales assistant structured mini-brief for a founder-investor conversation.',
      schema: SALES_ASSISTANT_RESPONSE_SCHEMA,
      strict: true,
    },
    projectId: input.projectId ?? null,
    actorId: input.actorId ?? null,
    requestType: 'sales_assistant_full_json',
  });

  let parsed: Partial<AssistantCard> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<AssistantCard>;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.situation || !parsed.mainQuestion) {
    const card = applyProjectDetailsOverride(heuristicCard(input), projectDetailsSignal);
    return {
      ...card,
      source: 'mock',
      provider: ai.provider,
      model: ai.model,
      fellBackToMock: true,
      promptSource: promptDecision.source,
      promptTemplateId: promptDecision.templateId,
      usedKnowledgeSources: knowledgeForUi,
      knowledgeRetrievalMeta,
    };
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
  // Sprint 13 emotional layer
  const investorState = normalizeInvestorState(parsed.investorState);
  const momentum = normalizeMomentum(parsed.momentum);
  const conversationTemperature = normalizeTemperature(parsed.conversationTemperature);
  const emotionalState = String(parsed.emotionalState ?? '').trim() || defaultEmotionalState(investorState);
  const whyBehavior = String(parsed.whyBehavior ?? '').trim() || defaultWhyBehavior(investorState);
  const momentumReason = String(parsed.momentumReason ?? '').trim() || defaultMomentumReason(momentum);
  const emotionalRisks = arrStrings(parsed.emotionalRisks, 4);
  const toneShiftGuidance = String(parsed.toneShiftGuidance ?? '').trim() || defaultToneShift(tone, investorState);

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

    // Sprint 13 emotional layer
    emotionalState,
    whyBehavior,
    investorState,
    momentum,
    momentumReason,
    conversationTemperature,
    emotionalRisks,
    toneShiftGuidance,

    // legacy aliases
    risk: nullableString(parsed.riskOrMissed),
    recommendation: whatToDo[0] ?? '—',
    suggestedPhrase: mainQuestion,
    nextStep: nullableString(parsed.dealNextStep),
  };
  const finalCard = applyProjectDetailsOverride(card, projectDetailsSignal);

  return {
    ...finalCard,
    source: ai.provider === 'mock' ? 'mock' : 'ai',
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock,
    promptSource: promptDecision.source,
    promptTemplateId: promptDecision.templateId,
    usedKnowledgeSources: knowledgeForUi,
    knowledgeRetrievalMeta,
  };
}

// Sprint 34В — двухэтапная генерация. Этап 1: ultra-fast tactical-only
// ответ за 1-3 секунды, чтобы фаундер на живой встрече сразу получил
// реплику. После рендера UI вызывает полный analyzeSalesTurn (этап 2) и
// догенерирует analytics.
export interface FastAssistantCard {
  mainQuestion: string;
  backupQuestions: string[];
  selfSaleQuestions: string[];
  spinStage: SpinStage;
  // Telemetry
  source: 'ai' | 'mock';
  provider: 'anthropic' | 'openai' | 'mock';
  model: string;
  fellBackToMock: boolean;
  promptSource: SalesPromptSource;
  promptTemplateId: string | null;
  // Sprint 38 — KB-источники (см. AssistantCard).
  usedKnowledgeSources: UsedKnowledgeSource[];
  // Sprint 40 — meta для retrieval audit-event.
  knowledgeRetrievalMeta: KnowledgeRetrievalMeta;
  contextSignals?: Array<'investor_requests_project_details'>;
}

const SALES_FAST_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mainQuestion: { type: 'string' },
    backupQuestions: { type: 'array', items: { type: 'string' } },
    selfSaleQuestions: { type: 'array', items: { type: 'string' } },
    spinStage: { type: 'string', enum: ['S', 'P', 'I', 'N'] },
  },
  required: ['mainQuestion', 'backupQuestions', 'selfSaleQuestions', 'spinStage'],
} as const;

export async function analyzeSalesTurnFast(input: AnalyzeInput): Promise<FastAssistantCard> {
  const projectContext = await loadProjectContext(input.projectId ?? undefined);
  const recentContext = input.recentContext?.trim() || tail(input.transcript, 6_000);
  const previousAdvice = formatAdvice(input.previousAdvice);
  const projectDetailsSignal = detectProjectDetailsRequest(input);
  const promptDecision = await resolveSalesPrompt();
  const deskMode: AssistantDeskMode = input.mode === 'qualification' ? 'qualification' : 'meeting';
  console.log(
    `[sales-assistant:fast] mode=${deskMode} prompt source=${promptDecision.source} ` +
    `scriptKey=${deskMode === 'qualification' ? (input.scriptKey ?? 'generic') : '-'}`,
  );

  // Sprint 38 — KB retrieval и для fast endpoint. На fast мы УЖЕ ограничены
  // 8s timeout'ом, поэтому keyword-retrieval (без AI-вызова) подходит идеально:
  // 100-200ms максимум, дальше уходит токеновый бюджет в OpenAI. Маленький
  // topN (3) чтобы prompt не разрастался.
  const knowledge = await retrieveKnowledgeForTranscript(input.transcript, {
    projectId: input.projectId ?? null,
    role: input.actorRole ?? 'FOUNDER',
    // Sprint 41 P0.6 — fast mode: 1-2 sources max, high-threshold-only.
    topN: 2,
    feature: 'sales_assistant.analyze_fast',
    mode: 'fast',
    environment: workspaceToEnvironment(input.workspaceStatus),
  });
  // Sprint 41 P0.6 — fast analyze: жёсткий 1200-character budget (раньше 1000).
  const knowledgeBlock = formatKnowledgeForPrompt(knowledge, input.actorRole ?? 'FOUNDER', { charBudget: 1200 });
  const knowledgeForUi = formatKnowledgeForUi(knowledge, input.actorRole ?? 'FOUNDER');
  const knowledgeRetrievalMeta: KnowledgeRetrievalMeta = {
    feature: 'sales_assistant.analyze_fast',
    sourceIds: knowledge.sources.map((s) => s.sourceId),
    count: knowledge.sources.length,
    chunksScanned: knowledge.totalChunksScanned,
    totalChars: knowledgeBlock.length,
  };

  const user = [
    deskMode === 'qualification'
      ? 'РЕЖИМ: УЛЬТРА-БЫСТРАЯ ПОДСКАЗКА ДЛЯ ПЕРВИЧНОГО ЗВОНКА. Цель — Zoom-слот с экспертом + чек/срок/критерии.'
      : 'РЕЖИМ: УЛЬТРА-БЫСТРАЯ ТАКТИЧЕСКАЯ ПОДСКАЗКА. Live AI co-pilot переговоров.',
    deskMode === 'qualification'
      ? 'Менеджер на первичном звонке. Дай ему реплику прямо сейчас, без аналитики.'
      : 'Фаундер на встрече. Дай ему реплику прямо сейчас, без аналитики.',
    'Не повторяй previousAdvice и предыдущий mainQuestion дословно.',
    '',
    ...qualificationContextLines(input),
    'Контекст проекта:',
    projectContext,
    '',
    ...(knowledgeBlock
      ? ['Релевантный опыт ZAPUSK (используй как контекст, не цитируй дословно):', knowledgeBlock, '']
      : []),
    input.previousSpinStage ? `Предыдущий SPIN-этап: ${input.previousSpinStage}` : 'Предыдущий SPIN-этап: не задан',
    '',
    previousAdvice ? `Предыдущая подсказка:\n${previousAdvice}` : 'Предыдущая подсказка: нет',
    '',
    `Последний контекст разговора:\n${recentContext}`,
    '',
    formatProjectDetailsPromptRule(projectDetailsSignal),
    '',
    [
      'Задача (только 4 поля):',
      '1. spinStage — текущий этап (S/P/I/N).',
      '2. mainQuestion — конкретная реплика, которую фаундер скажет инвестору ПРЯМО СЕЙЧАС.',
      '3. backupQuestions — 2-3 запасных вопроса.',
      '4. selfSaleQuestions — 1-2 self-sale вопроса (только если этап S/P или инвестор пассивен; иначе []).',
      'Верни строго JSON. Никакой аналитики, никаких объяснений.',
    ].join('\n'),
  ].join('\n');

  const ai = await aiClient.generateJson({
    system: applyDeskMode(promptDecision.system, input),
    user,
    feature: 'sales_assistant.analyze_fast',
    modelRoute: 'fast', // gpt-4o-mini / claude-haiku — ~1-3s типичный latency
    maxTokens: 600,
    temperature: 0.3,
    jsonSchema: {
      name: 'sales_assistant_fast',
      description: 'Ultra-fast tactical reply for live investor meeting.',
      schema: SALES_FAST_RESPONSE_SCHEMA,
      strict: true,
    },
    projectId: input.projectId ?? null,
    actorId: input.actorId ?? null,
    requestType: 'sales_assistant_fast_json',
  });

  let parsed: Partial<FastAssistantCard> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<FastAssistantCard>;
  } catch {
    parsed = null;
  }

  const mainQuestion = String(parsed?.mainQuestion ?? '').trim() || 'Расскажите подробнее о вашем интересе к проекту.';
  const backupQuestions = arrStrings(parsed?.backupQuestions, 4);
  const selfSaleQuestions = arrStrings(parsed?.selfSaleQuestions, 4);
  const stage = normalizeStage(parsed?.spinStage);

  return applyProjectDetailsOverrideFast({
    mainQuestion,
    backupQuestions: backupQuestions.length ? backupQuestions : ['Что для вас сейчас приоритет в инвестициях?'],
    selfSaleQuestions,
    spinStage: stage,
    source: ai.provider === 'mock' ? 'mock' : (parsed?.mainQuestion ? 'ai' : 'mock'),
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock || !parsed?.mainQuestion,
    promptSource: promptDecision.source,
    promptTemplateId: promptDecision.templateId,
    usedKnowledgeSources: knowledgeForUi,
    knowledgeRetrievalMeta,
  }, projectDetailsSignal);
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

// Sprint 41 P0.8 — маппинг workspaceStatus → KB environment.
//   • demo workspace → demo (получит demo + synthetic KB)
//   • остальные (active / approved / awaiting_payment / lead) → production
//     (получит production + synthetic).
// Это гарантирует, что demo-user никогда не достанет реальный production-кейс,
// а active-user не получит синтетику для тренировок.
function workspaceToEnvironment(ws: string | null | undefined): 'production' | 'demo' | 'synthetic' {
  if (ws === 'demo') return 'demo';
  return 'production';
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

function normalizeInvestorState(raw: unknown): InvestorState {
  const v = String(raw ?? '').toUpperCase();
  const allowed: InvestorState[] = ['OPEN', 'CURIOUS', 'SKEPTICAL', 'DEFENSIVE', 'ENGAGED', 'RATIONALIZING', 'READY', 'DISCONNECTED'];
  return (allowed as string[]).includes(v) ? (v as InvestorState) : 'OPEN';
}

function normalizeMomentum(raw: unknown): Momentum {
  const v = String(raw ?? '').toUpperCase();
  if (v === 'POSITIVE' || v === 'NEGATIVE') return v;
  return 'NEUTRAL';
}

function normalizeTemperature(raw: unknown): ConversationTemperature {
  const v = String(raw ?? '').toUpperCase();
  if (v === 'COLD' || v === 'HOT') return v;
  return 'WARM';
}

function defaultEmotionalState(state: InvestorState): string {
  switch (state) {
    case 'OPEN': return 'Инвестор спокойно слушает, без барьеров.';
    case 'CURIOUS': return 'Появилось любопытство — задаёт уточняющие вопросы.';
    case 'SKEPTICAL': return 'Инвестор анализирует, ищет подвох в цифрах.';
    case 'DEFENSIVE': return 'Появилась настороженность, инвестор закрывается.';
    case 'ENGAGED': return 'Инвестор эмоционально включён, ведёт диалог сам.';
    case 'RATIONALIZING': return 'Инвестор обосновывает свою осторожность логикой.';
    case 'READY': return 'Внутренне готов к решению, ждёт мягкого нажатия.';
    case 'DISCONNECTED': return 'Инвестор отстранился, отвечает формально.';
  }
}

function defaultWhyBehavior(state: InvestorState): string {
  switch (state) {
    case 'OPEN': return 'Знакомится с проектом, не торопится оценивать.';
    case 'CURIOUS': return 'Хочет понять, как это вписывается в его картину мира.';
    case 'SKEPTICAL': return 'Похоже, сравнивает с прошлым неудачным опытом.';
    case 'DEFENSIVE': return 'Защищается от ощущения давления — нужно снизить темп.';
    case 'ENGAGED': return 'Видит в проекте потенциал и хочет проверить детали.';
    case 'RATIONALIZING': return 'Ищет логичный повод не двигаться вперёд — нужен sense of safety.';
    case 'READY': return 'Уже принял внутреннее решение, ждёт чёткого предложения.';
    case 'DISCONNECTED': return 'Не видит связи проекта со своей задачей.';
  }
}

function defaultMomentumReason(momentum: Momentum): string {
  switch (momentum) {
    case 'POSITIVE': return 'Инвестор открылся после конкретных деталей.';
    case 'NEGATIVE': return 'После последнего хода менеджера температура просела.';
    case 'NEUTRAL': return 'Динамика ровная, без значимых сдвигов.';
  }
}

function defaultToneShift(tone: Tone, state: InvestorState): string {
  if (state === 'DEFENSIVE' || state === 'DISCONNECTED') {
    return 'Замедлись, дай инвестору больше говорить, не дави.';
  }
  if (state === 'RATIONALIZING') {
    return 'Не аргументируй цифрами — сначала уточни, что именно вызывает сомнение.';
  }
  if (state === 'READY') {
    return 'Пора мягко фиксировать next step — конкретный чек или дата.';
  }
  if (state === 'ENGAGED' && tone !== 'CLOSE') {
    return 'Можно переходить к более уверенному CONTROL tone.';
  }
  return 'Держи текущий темп, не торопись с переходом.';
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
  // Sprint 13: emotional defaults
  let investorState: InvestorState = 'OPEN';
  let momentum: Momentum = 'NEUTRAL';
  let conversationTemperature: ConversationTemperature = 'WARM';
  let emotionalState = 'Инвестор спокойно слушает, без барьеров.';
  let whyBehavior = 'Пока знакомится с проектом, не торопится оценивать.';
  let momentumReason = 'Разговор только начался, динамика ровная.';
  let emotionalRisks: string[] = [];
  let toneShiftGuidance = 'Держи SOFT, не торопись с переходом в продажу.';

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
    investorState = 'CURIOUS';
    conversationTemperature = 'WARM';
    momentum = 'NEUTRAL';
    emotionalState = 'Инвестор открыт и любопытен, но ещё не вовлечён эмоционально.';
    whyBehavior = 'Ему нужен якорь, на который опереться, чтобы решить, как слушать дальше.';
    momentumReason = 'Заход вежливый, динамика только формируется.';
    emotionalRisks = ['Если уйти в монолог дольше 60 секунд — интерес упадёт.'];
    toneShiftGuidance = 'Держи SOFT, дай ему направить угол разговора.';
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
    investorState = 'ENGAGED';
    conversationTemperature = 'WARM';
    momentum = 'POSITIVE';
    emotionalState = 'Инвестор сам поднял тему боли — это эмоциональное открытие, не упусти.';
    whyBehavior = 'Он хочет, чтобы его проблему услышали, а не сразу решили продажей.';
    momentumReason = 'После упоминания просадки динамика пошла вверх — инвестор готов раскрываться.';
    emotionalRisks = [
      'Если сейчас перепрыгнуть в питч — он закроется и вернётся в осторожность.',
      'Если обесценить его проблему («у всех так») — доверие просядет мгновенно.',
    ];
    toneShiftGuidance = 'Замедлись, дай ему рассказать конкретику — твоя задача слушать, не отвечать.';
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
    investorState = 'ENGAGED';
    conversationTemperature = 'HOT';
    momentum = 'POSITIVE';
    emotionalState = 'Инвестор эмоционально вошёл — оценивает, что он потерял, и хочет это компенсировать.';
    whyBehavior = 'Он ищет внутреннее «оправдание» для нового действия — момент окна для предложения.';
    momentumReason = 'Признание упущенной возможности резко подняло температуру.';
    emotionalRisks = [
      'Если сейчас «продавать» — это убьёт ощущение, что он сам пришёл к решению.',
      'Слишком быстрый переход к деньгам может вызвать защиту.',
    ];
    toneShiftGuidance = 'Удерживай CONTROL, но дай паузу — пусть он сам произнесёт следствие.';
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
    investorState = 'READY';
    conversationTemperature = 'HOT';
    momentum = 'POSITIVE';
    emotionalState = 'Инвестор готов считать — это сигнал внутреннего «да», но он ещё хочет подтверждения надёжности.';
    whyBehavior = 'Деньги — это его проверка реальности, а не возражение. Цифры должны быть простыми и прямыми.';
    momentumReason = 'Прямой вопрос про деньги поднял температуру до HOT.';
    emotionalRisks = [
      'Если завалить цифрами и допущениями — он переключится в SKEPTICAL.',
      'Если уйти от прямого ответа — потеряешь доверие за один ход.',
    ];
    toneShiftGuidance = 'Переходи в CLOSE: короткие, конкретные цифры и мягкий вопрос про диапазон чека.';
  }

  // Word-bound «потом» так, чтобы оно НЕ матчилось внутри «потому/потомок».
  if (hits(/подумаю|подумать|\bпотом\b|\bпозже\b|сейчас не готов/)) {
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
    investorState = 'RATIONALIZING';
    conversationTemperature = 'COLD';
    momentum = 'NEGATIVE';
    emotionalState = 'Инвестор начал рационализировать выход — это эмоциональный «стоп», а не логический.';
    whyBehavior = 'Он не видит понятного сценария и пытается снизить эмоциональный риск через «подумаю».';
    momentumReason = '«Подумаю» — стандартный маркер падения momentum, температура просела.';
    emotionalRisks = [
      'Если согласиться с «подумаю» без вопросов — встреча станет последней.',
      'Если сейчас додавить продажей — он закроется окончательно.',
    ];
    toneShiftGuidance = 'Сбавь темп, верни в SOFT и попроси конкретику: что именно нужно понять для решения.';
  }

  // «много» word-bound, иначе матчит «многое/многие/немного».
  if (hits(/дорого|чек большой|\bмного\b|сейчас не могу|не сейчас|нет таких/)) {
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
    investorState = 'DEFENSIVE';
    conversationTemperature = 'WARM';
    momentum = 'NEGATIVE';
    emotionalState = 'Появилась осторожность по чеку — инвестор защищается, но не уходит.';
    whyBehavior = 'Чек воспринимается как риск, и он хочет понять, можно ли войти меньшим шагом.';
    momentumReason = 'Возражение «дорого» — естественный спад, но это диалог, а не выход.';
    emotionalRisks = [
      'Если давить на ценность проекта — инвестор закроется в защите.',
      'Если предложить скидку — обесценишь проект в его глазах.',
    ];
    toneShiftGuidance = 'Прими возражение спокойно, разверни в вопрос про комфортный диапазон.';
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
    investorState = 'SKEPTICAL';
    conversationTemperature = 'WARM';
    momentum = 'NEGATIVE';
    emotionalState = 'Инвестор включил защитное мышление — ищет, чего боится конкретно.';
    whyBehavior = 'Скорее всего, сравнивает с прошлым неудачным опытом и ищет sense of safety.';
    momentumReason = 'После темы рисков температура слегка просела — нужна перезагрузка доверия.';
    emotionalRisks = [
      'Если отмахнуться от страха — потеряешь доверие на одной фразе.',
      'Если назвать слишком много митигаторов сразу — это звучит как защита.',
    ];
    toneShiftGuidance = 'Сначала признай риск как валидный, потом дай один сильный митигатор.';
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
    // Sprint 13 emotional layer
    emotionalState,
    whyBehavior,
    investorState,
    momentum,
    momentumReason,
    conversationTemperature,
    emotionalRisks,
    toneShiftGuidance,
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
      investorState: 'CURIOUS',
      conversationTemperature: 'WARM',
      momentum: 'POSITIVE',
      emotionalState: 'Инвестор открыт, но динамика топчется — пора углубляться.',
      whyBehavior: 'Поверхностный slой исчерпал любопытство, нужен новый угол.',
      momentumReason: 'Повторение S без сдвига гасит интерес — переход в P подстегнёт momentum.',
      toneShiftGuidance: 'Сдвинься из SOFT в более уверенный CONTROL: один точный вопрос про разрыв.',
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
      investorState: 'ENGAGED',
      conversationTemperature: 'HOT',
      momentum: 'POSITIVE',
      emotionalState: 'Инвестор готов прожить последствия — это эмоциональное окно для Implication.',
      whyBehavior: 'Он хочет сам произнести «у меня есть проблема» — это разблокирует решение.',
      momentumReason: 'Переход от констатации Problem к её последствиям подогрел разговор.',
      emotionalRisks: ['Если подсказать последствие за него — окно закроется.'],
      toneShiftGuidance: 'Дай паузу после вопроса, не заполняй её — пусть он закончит мысль.',
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
      investorState: 'READY',
      conversationTemperature: 'HOT',
      momentum: 'POSITIVE',
      emotionalState: 'Инвестор внутренне готов — пора оформить решение цифрами.',
      whyBehavior: 'Он уже принял эмоциональное «да», осталось получить безопасную форму для шага.',
      momentumReason: 'Признание implication подняло температуру до HOT — окно для Close.',
      emotionalRisks: ['Если уйти в новые темы — окно закроется, придётся начинать заново.'],
      toneShiftGuidance: 'Переходи в CLOSE: короткий вопрос про чек, без дополнительных аргументов.',
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
    investorState: 'READY',
    conversationTemperature: 'HOT',
    momentum: 'POSITIVE',
    emotionalState: 'Сделка фактически собрана, осталось зафиксировать рамки.',
    whyBehavior: 'Инвестор уже на решении — ему нужна простая форма следующего шага.',
    momentumReason: 'Дополнительные ходы лишние, momentum максимальный сейчас.',
    emotionalRisks: ['Если открыть новый аргумент — momentum разряд­ит­ся.'],
    toneShiftGuidance: 'CLOSE короткими ходами: дата + критерий, и заверши встречу.',
  };
}

// ─── Sprint 50 hotfix — Meeting preparation mode ─────────────────────────
//
// Founders often paste a Zoom Notes / CRM profile / pre-call investor brief
// into the "Live transcript" card BEFORE the meeting starts. The live-advice
// pipeline (analyzeSalesTurn) treats it as if the conversation is already
// running, which is wrong: the user wants a strategy plan, not a "what to
// say next" reply. This service generates a structured MeetingPlan from
// the prep context.

export interface MeetingObjective {
  understand: string;
  sell: string;
  outcome: string;
}

export interface ConversationStyle {
  tone: 'aggressive' | 'soft' | 'consultative';
  speakOrListen: 'listen_more' | 'lead_more' | 'balanced';
  whenToPitch: string;
}

export interface MeetingStage {
  name: string;
  goal: string;
}

export interface MeetingPlan {
  objective: MeetingObjective;
  conversationStyle: ConversationStyle;
  openingQuestions: string[];
  pitchTiming: string;
  pitchScript: string;
  leveragePoints: string[];
  dealbreakers: string[];
  stages: MeetingStage[];
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  fellBackToMock: boolean;
  promptSource: SalesPromptSource;
  promptTemplateId: string | null;
  promptVersion: number | null;
}

export interface PrepareInput {
  /** Free-form pre-call context: CRM notes, Zoom notes, investor profile,
   * prior chat, anything the founder pasted before the live mic started. */
  context: string;
  projectId?: string | null;
  actorRole?: string;
  actorId?: string | null;
}

const MEETING_PLAN_SCHEMA = {
  type: 'object',
  required: [
    'objective', 'conversationStyle', 'openingQuestions',
    'pitchTiming', 'pitchScript', 'leveragePoints', 'dealbreakers', 'stages',
  ],
  additionalProperties: false,
  properties: {
    objective: {
      type: 'object',
      required: ['understand', 'sell', 'outcome'],
      additionalProperties: false,
      properties: {
        understand: { type: 'string' },
        sell: { type: 'string' },
        outcome: { type: 'string' },
      },
    },
    conversationStyle: {
      type: 'object',
      required: ['tone', 'speakOrListen', 'whenToPitch'],
      additionalProperties: false,
      properties: {
        tone: { type: 'string', enum: ['aggressive', 'soft', 'consultative'] },
        speakOrListen: { type: 'string', enum: ['listen_more', 'lead_more', 'balanced'] },
        whenToPitch: { type: 'string' },
      },
    },
    openingQuestions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    pitchTiming: { type: 'string' },
    pitchScript: { type: 'string' },
    leveragePoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
    dealbreakers: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
    stages: {
      type: 'array',
      minItems: 4,
      maxItems: 10,
      items: {
        type: 'object',
        required: ['name', 'goal'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          goal: { type: 'string' },
        },
      },
    },
  },
};

export async function prepareForMeeting(input: PrepareInput): Promise<MeetingPlan> {
  const promptDecision = await resolveMeetingPrepPrompt();
  const projectContext = await loadProjectContextForPrep(input.projectId);
  const user = [
    'ПОДГОТОВИТЕЛЬНЫЙ КОНТЕКСТ ОТ ФАУНДЕРА',
    '---',
    input.context.trim(),
    '---',
    '',
    projectContext ? `КОНТЕКСТ ПРОЕКТА:\n${projectContext}\n` : '',
    'Собери MeetingPlan строго по схеме.',
  ].filter(Boolean).join('\n');

  const ai = await aiClient.generateJson({
    system: promptDecision.system,
    user,
    feature: 'sales_assistant.prepare',
    modelRoute: 'main',
    maxTokens: 1_800,
    temperature: 0.35,
    jsonSchema: {
      name: 'meeting_plan',
      description: 'Pre-call strategy plan: objective, style, opening questions, pitch, stages.',
      schema: MEETING_PLAN_SCHEMA,
    },
    projectId: input.projectId ?? null,
    actorId: input.actorId ?? null,
    requestType: 'sales_assistant_prepare_json',
  });

  let parsed: Partial<MeetingPlan> | null = null;
  try {
    parsed = JSON.parse(extractJsonPrep(ai.text)) as Partial<MeetingPlan>;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.objective || !parsed.stages || !Array.isArray(parsed.stages)) {
    const fallback = heuristicMeetingPlan();
    return {
      ...fallback,
      provider: ai.provider,
      model: ai.model,
      fellBackToMock: true,
      promptSource: promptDecision.source,
      promptTemplateId: promptDecision.templateId,
      promptVersion: promptDecision.version,
    };
  }

  return {
    objective: {
      understand: String(parsed.objective?.understand ?? '').trim() || 'Выяснить мотив и цели инвестора',
      sell: String(parsed.objective?.sell ?? '').trim() || 'Доходность и защита капитала',
      outcome: String(parsed.objective?.outcome ?? '').trim() || 'Договориться о следующем шаге',
    },
    conversationStyle: {
      tone: (['aggressive', 'soft', 'consultative'] as const).includes(parsed.conversationStyle?.tone as 'aggressive' | 'soft' | 'consultative')
        ? (parsed.conversationStyle!.tone as 'aggressive' | 'soft' | 'consultative')
        : 'consultative',
      speakOrListen: (['listen_more', 'lead_more', 'balanced'] as const).includes(parsed.conversationStyle?.speakOrListen as 'listen_more' | 'lead_more' | 'balanced')
        ? (parsed.conversationStyle!.speakOrListen as 'listen_more' | 'lead_more' | 'balanced')
        : 'listen_more',
      whenToPitch: String(parsed.conversationStyle?.whenToPitch ?? '').trim()
        || 'После того как выяснил цели инвестора и его опыт',
    },
    openingQuestions: arrStr(parsed.openingQuestions, 6, [
      'Что для вас сейчас главный фокус по портфелю?',
      'Какие проекты вы рассматриваете на горизонте 6-12 месяцев?',
      'Какую доходность считаете комфортной?',
    ]),
    pitchTiming: String(parsed.pitchTiming ?? '').trim()
      || 'Не раньше чем выяснил цели, опыт и риск-аппетит инвестора',
    pitchScript: String(parsed.pitchScript ?? '').trim()
      || 'Короткое описание сделки: чек, срок, доходность, выход.',
    leveragePoints: arrStr(parsed.leveragePoints, 8, ['доходность', 'защита капитала', 'предсказуемость денежного потока']),
    dealbreakers: arrStr(parsed.dealbreakers, 8, ['ранний переход к pitch', 'перегруз цифрами', 'споры про гарантии']),
    stages: (parsed.stages ?? [])
      .filter((s): s is MeetingStage => Boolean(s && typeof (s as MeetingStage).name === 'string'))
      .slice(0, 10)
      .map((s) => ({ name: String(s.name).trim(), goal: String(s.goal ?? '').trim() })),
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock,
    promptSource: promptDecision.source,
    promptTemplateId: promptDecision.templateId,
    promptVersion: promptDecision.version,
  };
}

function arrStr(value: unknown, max: number, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
  return out.length > 0 ? out : fallback;
}

function extractJsonPrep(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('{')) return t;
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}

async function loadProjectContextForPrep(projectId: string | null | undefined): Promise<string> {
  if (!projectId) return '';
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true },
  });
  if (!p) return '';
  return [
    `Проект: ${p.name}`,
    p.industry ? `Отрасль: ${p.industry}` : '',
    p.stage ? `Стадия: ${p.stage}` : '',
    p.raiseAmount ? `Раунд: ${p.raiseAmount} ${p.currency}` : '',
    p.minCheck ? `Min чек: ${p.minCheck}` : '',
    p.brief?.businessSummary ? `Бизнес: ${p.brief.businessSummary}` : '',
  ].filter(Boolean).join('\n');
}

function heuristicMeetingPlan(): MeetingPlan {
  return {
    objective: {
      understand: 'Цели инвестора, опыт, риск-аппетит, ожидания по доходности',
      sell: 'Доходность сделки и защиту капитала, а не продукт',
      outcome: 'Договорённость о следующем шаге (материалы → следующий звонок)',
    },
    conversationStyle: {
      tone: 'consultative',
      speakOrListen: 'listen_more',
      whenToPitch: 'После выяснения целей и опыта инвестора',
    },
    openingQuestions: [
      'Что для вас сейчас главный фокус по портфелю?',
      'Какие проекты вы рассматривали за последние 12 месяцев?',
      'Какая доходность для вас комфортная по этому классу актива?',
      'Что обычно становится для вас стоп-фактором?',
    ],
    pitchTiming: 'Только после того, как услышал критерии решения инвестора',
    pitchScript: 'Чек от X ₽, окупаемость Y лет, доходность Z%, выход через выкуп доли или вторичный рынок.',
    leveragePoints: ['предсказуемость денежного потока', 'защита капитала', 'умеренный риск', 'понятный выход'],
    dealbreakers: ['ранний pitch без выяснения целей', 'перегруз цифрами', 'спор про гарантии'],
    stages: [
      { name: 'Знакомство', goal: 'Установить контакт, представить себя коротко' },
      { name: 'Выявление целей', goal: 'Понять, что инвестор хочет получить и в какие сроки' },
      { name: 'Инвестиционный опыт', goal: 'Узнать, в чём раньше участвовал и что сработало/не сработало' },
      { name: 'Pitch', goal: 'Коротко продать ДОХОД, не продукт' },
      { name: 'Объекции', goal: 'Разобрать сомнения, не спорить про гарантии' },
      { name: 'Следующий шаг', goal: 'Зафиксировать дату следующего контакта и какие материалы прислать' },
    ],
    provider: 'mock',
    model: 'mock-v1',
    fellBackToMock: true,
    promptSource: 'fallback',
    promptTemplateId: null,
    promptVersion: null,
  };
}
