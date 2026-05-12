import { prisma } from '../db.js';
import { aiComplete } from '../ai/client.js';
import { SALES_ASSISTANT_SYSTEM } from '../ai/salesAssistantPrompt.js';

export interface AnalyzeInput {
  transcript: string;       // последняя реплика / новый chunk
  recent?: string;          // 1-2 минуты предыдущего контекста
  projectId?: string | null;
}

export interface AssistantCard {
  situation: string;
  risk: string | null;
  recommendation: string;
  suggestedPhrase: string;
  spinStage: 'S' | 'P' | 'I' | 'N';
  tone: 'SOFT' | 'CONTROL' | 'CLOSE';
  confidence: number;       // 0..100
  objection: string | null;
  nextStep: string | null;
  source: 'ai' | 'mock';
  provider: 'anthropic' | 'openai' | 'mock';
}

export async function analyzeSalesTurn(input: AnalyzeInput): Promise<AssistantCard> {
  const projectContext = await loadProjectContext(input.projectId ?? undefined);

  const user = [
    'Контекст встречи и проекта:',
    projectContext,
    '',
    input.recent ? `Недавний разговор (последние ~60 сек):\n${input.recent}` : '— контекста разговора пока нет',
    '',
    `Последняя реплика / новый фрагмент transcript:\n${input.transcript}`,
    '',
    'Проанализируй и верни JSON.',
  ].join('\n');

  const ai = await aiComplete({
    system: SALES_ASSISTANT_SYSTEM,
    user,
    asJSON: true,
    maxTokens: 700,
    temperature: 0.35,
  });

  let parsed: Partial<AssistantCard> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<AssistantCard>;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.situation) {
    const card = heuristicCard(input);
    return { ...card, source: 'mock', provider: ai.provider };
  }

  return {
    situation: String(parsed.situation),
    risk: parsed.risk ?? null,
    recommendation: String(parsed.recommendation ?? '—'),
    suggestedPhrase: String(parsed.suggestedPhrase ?? ''),
    spinStage: normalizeStage(parsed.spinStage),
    tone: normalizeTone(parsed.tone),
    confidence: clampConfidence(parsed.confidence),
    objection: parsed.objection ?? null,
    nextStep: parsed.nextStep ?? null,
    source: ai.provider === 'mock' ? 'mock' : 'ai',
    provider: ai.provider,
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

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function normalizeStage(raw: unknown): AssistantCard['spinStage'] {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'P' || s === 'I' || s === 'N') return s;
  return 'S';
}

function normalizeTone(raw: unknown): AssistantCard['tone'] {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'CONTROL' || t === 'CLOSE') return t;
  return 'SOFT';
}

function clampConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 40;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Deterministic fallback so the cockpit still moves when no AI key is available.
// We read very simple cues — keywords like "дорого", "подумаю", "не сейчас"
// jump us into objection-handling; questions about money push us into N+CLOSE.
function heuristicCard(input: AnalyzeInput): Omit<AssistantCard, 'source' | 'provider'> {
  const text = `${input.recent ?? ''}\n${input.transcript}`.toLowerCase();
  const hits = (re: RegExp) => re.test(text);

  let stage: AssistantCard['spinStage'] = 'S';
  let tone: AssistantCard['tone'] = 'SOFT';
  let confidence = 38;
  let situation = 'Инвестор раскрывает контекст. Идёт фаза знакомства, фиксируй интересы.';
  let recommendation = 'Задай открытый вопрос про текущий портфель и горизонт инвестиций.';
  let suggested = 'Скажите, во что сейчас инвестируете и какой горизонт обычно вам комфортен?';
  let objection: string | null = null;
  let nextStep: string | null = 'Получить 2-3 факта о текущем портфеле инвестора';
  let risk: string | null = null;

  if (hits(/расскажите|кто вы|что вы делаете|чем зани/)) {
    stage = 'S'; tone = 'SOFT'; confidence = 42;
    situation = 'Инвестор просит представить проект. Это вход, не уходи в монолог.';
    recommendation = 'Короткий питч 30-40 сек + вопрос инвестору в конце.';
    suggested = 'Если коротко, мы делаем X для Y. Прежде чем погрузимся — что вам было бы интереснее в первую очередь: экономика, команда, рынок?';
    nextStep = 'Завершить мини-питч встречным вопросом';
  }
  if (hits(/проблем|сложн|не получает|тяжел|не устраив/)) {
    stage = 'P'; tone = 'CONTROL'; confidence = 52;
    situation = 'Инвестор начал говорить о неудовлетворённости в своём портфеле.';
    recommendation = 'Углубляй Problem, не уходи в продажу. Конкретизируй цифрой или сегментом.';
    suggested = 'А в вашем случае — где сейчас основная просадка по доходности идёт?';
    nextStep = 'Получить конкретику по проблеме до перехода в Implication';
  }
  if (hits(/упуст|можно было|если бы|разрыв|ожидал|планировал/)) {
    stage = 'I'; tone = 'CONTROL'; confidence = 60;
    situation = 'Инвестор сам оценивает упущенные возможности — момент для Implication.';
    recommendation = 'Усиливай через конкретный сценарий или сравнение «ожидание vs факт». Не дави.';
    suggested = 'А если бы такая сделка была год назад — это закрыло бы тот разрыв, который вы сейчас описываете?';
    nextStep = 'Подвести к Need-Payoff: «такое решение для вас приоритет?»';
  }
  if (hits(/сколько|какой возврат|какая доходность|когда вернёт|через сколько|чек|оценк/)) {
    stage = 'N'; tone = 'CLOSE'; confidence = 70;
    situation = 'Инвестор задаёт прямые вопросы про деньги. Можно идти на Close.';
    recommendation = 'Дай конкретный ответ цифрами из финмодели + спроси про комфортный диапазон чека.';
    suggested = 'Базовый сценарий — окупаемость 2 сезона, x4 за 3 года при минимальном чеке от 1 млн ₽. Какой диапазон сейчас вам комфортен, чтобы зайти без перегруза?';
    nextStep = 'Зафиксировать диапазон чека и дату следующей встречи';
  }
  if (hits(/подумаю|подумать|потом|позже/)) {
    objection = 'I will think';
    stage = 'P'; tone = 'CONTROL'; confidence = 28;
    situation = 'Инвестор уходит в «подумаю» — теряем контроль над next step.';
    recommendation = 'Не отпускай. Уточни, что конкретно надо понять для решения.';
    suggested = 'Скажите, что именно вы хотите понять или проверить, чтобы принять решение?';
    nextStep = 'Получить от инвестора список конкретных открытых вопросов';
    risk = 'Без конкретики next step встреча закончится без продвижения сделки';
  }
  if (hits(/дорого|чек большой|много|сейчас не могу|не сейчас/)) {
    objection = 'Too expensive / not now';
    stage = 'N'; tone = 'CLOSE'; confidence = 35;
    situation = 'Инвестор не проходит по чеку. Не дави — перенацель на комфортный диапазон.';
    recommendation = 'Зафиксируй отказ по текущему проекту, но не закрывай разговор. Подбери альтернативу под чек.';
    suggested = 'Понял вас. Тогда давайте отталкиваться от комфортного — какой диапазон сейчас был бы спокойный, чтобы начать?';
    nextStep = 'Подобрать вариант под обозначенный чек';
  }
  if (hits(/риск|опасно|сомнев|не уверен|боюсь/)) {
    risk = 'Инвестор обозначает страх — не игнорируй';
    if (stage === 'S') stage = 'P';
    tone = 'CONTROL';
    recommendation = 'Назови риск своими словами, согласись с его существованием, дай конкретный митигатор из проекта.';
    suggested = 'Согласен, риск есть. Конкретно по этому риску в проекте есть [митигатор] — как вы оцениваете его достаточность?';
  }

  return { situation, risk, recommendation, suggestedPhrase: suggested, spinStage: stage, tone, confidence, objection, nextStep };
}
