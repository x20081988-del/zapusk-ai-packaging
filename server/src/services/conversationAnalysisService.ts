import { prisma } from '../db.js';
import { aiClient } from '../ai/client.js';
import { transcribeAudio, type TranscriptionResult } from './deepgramClient.js';

// AI Conversation Intelligence — превращает запись разговора (или paste'нутый
// transcript) в structured AI-feedback. Фокус — не на summary, а на «что
// улучшить»: ошибки, упущенные buying signals, незаданные SPIN-вопросы.
//
// Data moat: каждый разбор сохраняется как ConversationAnalysis в БД и
// формирует базу для будущего fine-tuning Zapusk AI. Не CRM — слой analysis.

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type SpinStage = 'S' | 'P' | 'I' | 'N';

export interface AnalysisScoreBreakdown {
  rapport: number;
  spin: number;
  nextStepFixation: number;
  objectionHandling: number;
  clarity: number;
  confidence: number;
}

export interface ConversationAnalysisCard {
  summary: string;
  spinStage: SpinStage;
  conversationQuality: number;          // 0..100 — близко к aiScore, для legacy
  investorInterest: string;
  investorConcerns: string[];
  mistakes: string[];                   // !!! главная ценность
  whatWorked: string[];
  nextBestAction: string;
  followUpMessage: string;
  probabilityScore: number;             // 0..100
  recommendedMaterials: string[];
  managerAdvice: string;
  sentiment: Sentiment;
  aiScore: number;                      // 0..100 overall
  aiScoreBreakdown: AnalysisScoreBreakdown;
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  fellBackToMock: boolean;
}

export interface AnalyzeInput {
  transcript: string;
  projectId?: string | null;
  investorName?: string | null;
}

export interface IngestInput {
  audioBuffer?: Buffer | null;
  audioMime?: string | null;
  audioUrl?: string | null;
  originalFileName?: string | null;
  fileSize?: number | null;
  pastedTranscript?: string | null;
  projectId?: string | null;
  investorName?: string | null;
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    spinStage: { type: 'string', enum: ['S', 'P', 'I', 'N'] },
    conversationQuality: { type: 'number', minimum: 0, maximum: 100 },
    investorInterest: { type: 'string' },
    investorConcerns: { type: 'array', items: { type: 'string' } },
    mistakes: { type: 'array', items: { type: 'string' } },
    whatWorked: { type: 'array', items: { type: 'string' } },
    nextBestAction: { type: 'string' },
    followUpMessage: { type: 'string' },
    probabilityScore: { type: 'number', minimum: 0, maximum: 100 },
    recommendedMaterials: { type: 'array', items: { type: 'string' } },
    managerAdvice: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    aiScore: { type: 'number', minimum: 0, maximum: 100 },
    aiScoreBreakdown: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rapport: { type: 'number', minimum: 0, maximum: 100 },
        spin: { type: 'number', minimum: 0, maximum: 100 },
        nextStepFixation: { type: 'number', minimum: 0, maximum: 100 },
        objectionHandling: { type: 'number', minimum: 0, maximum: 100 },
        clarity: { type: 'number', minimum: 0, maximum: 100 },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['rapport', 'spin', 'nextStepFixation', 'objectionHandling', 'clarity', 'confidence'],
    },
  },
  required: [
    'summary', 'spinStage', 'conversationQuality', 'investorInterest', 'investorConcerns',
    'mistakes', 'whatWorked', 'nextBestAction', 'followUpMessage', 'probabilityScore',
    'recommendedMaterials', 'managerAdvice', 'sentiment', 'aiScore', 'aiScoreBreakdown',
  ],
} satisfies Record<string, unknown>;

const SYSTEM = `Ты — AI Conversation Intelligence от Zapusk AI.
Тебе дают transcript встречи фаундера или менеджера с инвестором.
Твоя задача — НЕ написать красивое summary. Твоя задача — найти ошибки и подсказать, что улучшить.

Главное в анализе:
1. **mistakes** — конкретные ошибки менеджера/фаундера. Не общие («продавайте лучше»), а конкретные:
   «Вы начали продавать на этапе Situation», «Не задан implication question», «Не зафиксирован next step».
2. **whatWorked** — что было сделано правильно, чтобы это закрепить.
3. **investorConcerns** — на что инвестор реагировал негативно или сомнениями.
4. **recommendedMaterials** — что инвестор сам попросил или что закроет его возражения.
5. **nextBestAction** — одно действие, которое менеджер должен сделать в 24-48 часов.
6. **followUpMessage** — готовое сообщение в мессенджер, 2-4 строки, тон по ситуации.
7. **aiScore** — общая оценка встречи 0..100. Реалистичная, не льстивая.
8. **aiScoreBreakdown** — 6 метрик 0..100:
   - rapport: насколько менеджер выстроил контакт
   - spin: насколько корректно прошёл SPIN-этапы
   - nextStepFixation: зафиксировал ли конкретный next step
   - objectionHandling: как работал с возражениями (если были)
   - clarity: насколько чётко были донесены цифры и оффер
   - confidence: насколько уверенно вёл разговор
9. **sentiment** — итог встречи для инвестора: positive / neutral / negative.
10. **spinStage** — на каком этапе SPIN встреча остановилась.
11. **probabilityScore** — вероятность сделки 0..100.
12. **summary** — 2-3 предложения для быстрого скана. Без воды.
13. **managerAdvice** — короткая внутренняя заметка менеджеру.

Будь конкретен. Если инвестор задал прямой вопрос про деньги, а менеджер ушёл в питч — это ошибка, отметь.
Если менеджер вернул контроль через уточняющий вопрос — это whatWorked, отметь.
Стиль: язык опытного sales-коуча, без воды и штампов. Все списки — конкретные формулировки, не общие.
Верни строго JSON.`;

export async function analyzeConversation(input: AnalyzeInput): Promise<ConversationAnalysisCard> {
  const transcript = (input.transcript ?? '').trim();
  if (transcript.length < 20) {
    return mockAnalysis(transcript, 'mock', 'mock-v1', false);
  }

  const project = await loadProjectContext(input.projectId ?? undefined);
  const user = [
    'Контекст проекта (если есть):',
    project,
    '',
    input.investorName ? `Инвестор: ${input.investorName}` : 'Инвестор: имя не зафиксировано',
    '',
    'Полный transcript разговора:',
    transcript.slice(-60_000),
    '',
    'Выполни анализ по системе. Сфокусируйся на ошибках и improvement points. Верни строго JSON.',
  ].join('\n');

  const ai = await aiClient.generateJson({
    system: SYSTEM,
    user,
    feature: 'conversation_analysis.analyze',
    modelRoute: 'main',
    maxTokens: 1_500,
    temperature: 0.3,
    jsonSchema: {
      name: 'conversation_analysis_card',
      description: 'AI Conversation Intelligence analysis card.',
      schema: ANALYSIS_SCHEMA,
      strict: true,
    },
  });

  let parsed: Partial<ConversationAnalysisCard> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<ConversationAnalysisCard>;
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.summary) {
    return mockAnalysis(transcript, ai.provider, ai.model, true);
  }

  const breakdown = sanitizeBreakdown(parsed.aiScoreBreakdown);
  return {
    summary: String(parsed.summary),
    spinStage: normalizeStage(parsed.spinStage),
    conversationQuality: clamp(parsed.conversationQuality, 0, 100, parsed.aiScore ?? 50),
    investorInterest: String(parsed.investorInterest ?? ''),
    investorConcerns: arr(parsed.investorConcerns),
    mistakes: arr(parsed.mistakes),
    whatWorked: arr(parsed.whatWorked),
    nextBestAction: String(parsed.nextBestAction ?? ''),
    followUpMessage: String(parsed.followUpMessage ?? ''),
    probabilityScore: clamp(parsed.probabilityScore, 0, 100, 40),
    recommendedMaterials: arr(parsed.recommendedMaterials),
    managerAdvice: String(parsed.managerAdvice ?? ''),
    sentiment: normalizeSentiment(parsed.sentiment),
    aiScore: clamp(parsed.aiScore, 0, 100, average(breakdown)),
    aiScoreBreakdown: breakdown,
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock,
  };
}

// Public entry: handle audio buffer, URL, or pasted transcript → produce
// transcript + analysis + persist. Returns a fully shaped row for the UI.
export async function ingestConversation(input: IngestInput) {
  let transcription: TranscriptionResult | null = null;
  let transcript = (input.pastedTranscript ?? '').trim();

  if (input.audioBuffer) {
    transcription = await transcribeAudio(input.audioBuffer, { mimeType: input.audioMime ?? undefined });
    if (!transcript) transcript = transcription.text;
  } else if (input.audioUrl) {
    // MVP: запоминаем URL, но не качаем — это снизит сложность и затраты.
    // Если позже понадобится, можно fetch + transcribe.
    transcription = {
      text: '',
      provider: 'mock',
      model: 'mock-v1',
      durationSec: null,
      fellBackToMock: true,
    };
    if (!transcript) {
      transcript = `[Ссылка на запись: ${input.audioUrl}]\nТранскрипт не получен — для автоматической транскрипции прикрепите файл или вставьте текст разговора.`;
    }
  } else if (transcript) {
    transcription = {
      text: transcript,
      provider: 'mock',
      model: 'manual',
      durationSec: null,
      fellBackToMock: false,
    };
  }

  if (!transcript || transcript.length < 20) {
    throw new Error('transcript_too_short');
  }

  const card = await analyzeConversation({
    transcript,
    projectId: input.projectId,
    investorName: input.investorName,
  });

  const row = await prisma.conversationAnalysis.create({
    data: {
      projectId: input.projectId ?? null,
      investorName: input.investorName ?? null,
      source: input.audioBuffer ? 'audio_upload' : input.audioUrl ? 'url' : 'paste',
      originalFileName: input.originalFileName ?? null,
      fileSize: input.fileSize ?? null,
      mimeType: input.audioMime ?? null,
      audioUrl: input.audioUrl ?? null,
      transcript,
      transcriptProvider: transcription?.provider ?? null,
      transcriptModel: transcription?.model ?? null,
      transcriptDurationSec: transcription?.durationSec ?? null,
      analysis: JSON.stringify(card),
      aiScore: card.aiScore,
      probabilityScore: card.probabilityScore,
      sentiment: card.sentiment,
      spinStage: card.spinStage,
      aiProvider: card.provider,
      aiModel: card.model,
      fellBackToMock: card.fellBackToMock,
    },
  });

  return { card, row };
}

export async function listAnalyses(filters: { projectId?: string } = {}) {
  return prisma.conversationAnalysis.findMany({
    where: filters.projectId ? { projectId: filters.projectId } : {},
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function getAnalysis(id: string) {
  return prisma.conversationAnalysis.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } } },
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function loadProjectContext(projectId?: string | null): Promise<string> {
  if (!projectId) return '— проект не выбран, оценивай разговор как универсальный инвестиционный звонок';
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true },
  });
  if (!project) return '— проект не найден';
  return [
    `Проект: ${project.name}`,
    `Отрасль: ${project.industry ?? '—'} · Стадия: ${project.stage ?? '—'}`,
    `Раунд: ${project.raiseAmount ?? '—'} ${project.currency} за ${project.equityOffered ?? '—'}% · Min чек: ${project.minCheck ?? '—'} ${project.currency}`,
    `Бизнес: ${project.brief?.businessSummary ?? '—'}`,
  ].join('\n');
}

function mockAnalysis(transcript: string, provider: 'openai' | 'anthropic' | 'mock', model: string, fellBack: boolean): ConversationAnalysisCard {
  const t = transcript.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const mistakes: string[] = [];
  const whatWorked: string[] = [];
  const concerns: string[] = [];
  const materials: string[] = [];

  if (has(/наш проект|у нас|мы делаем|давайте расскажу/) && !has(/расскажите|какой опыт|что важно/)) {
    mistakes.push('Менеджер начал продавать без вопросов про инвестора — Situation-этап пропущен');
  }
  if (has(/риск|опасн|сомнев|гарант/)) {
    concerns.push('Сомнения по рискам и гарантиям');
    if (!has(/митигатор|защит|резерв|обеспечен/)) {
      mistakes.push('Возражение про риски не было закрыто конкретным митигатором');
    } else {
      whatWorked.push('Возражение про риски обработано через конкретный митигатор');
    }
  }
  if (has(/ликвидн|выход|выйти|выкуп|продать/)) {
    concerns.push('Вопросы по ликвидности и механике выхода');
    materials.push('Кейс secondary market');
  }
  if (has(/материал|презентац|финмодел|финансов|документ/)) {
    materials.push('Презентация проекта');
    if (has(/финмодел|финансов/)) materials.push('Финансовая модель');
    whatWorked.push('Инвестор сам запросил материалы — buying signal');
  }
  if (has(/(?:следующ|давайте|вторник|пятниц|на этой неделе|созвон|встреч)/)) {
    whatWorked.push('Зафиксирован конкретный next step');
  } else {
    mistakes.push('Не зафиксирован следующий шаг — встреча закончилась без plan B');
  }
  if (has(/подумаю|потом|позже|не сейчас/) && !has(/что именно|какие критерии|что проверить/)) {
    mistakes.push('Инвестор ушёл в «подумаю», менеджер не уточнил, что именно нужно проверить');
  }
  if (has(/\d+\s*(?:млн|миллион|тыс|тысяч)/)) {
    whatWorked.push('Названы конкретные цифры — оффер прозрачен');
  } else {
    mistakes.push('В разговоре не прозвучали конкретные цифры по чеку и доходности');
  }

  let sentiment: Sentiment = 'neutral';
  let probability = 40;
  if (has(/готов инвест|зафиксируем|подходит|давайте подписыв/)) { sentiment = 'positive'; probability = 75; }
  else if (has(/интересно|готов обсужд|присыл/)) { sentiment = 'positive'; probability = 60; }
  else if (has(/не подходит|не интересно|откаж/)) { sentiment = 'negative'; probability = 12; }

  const breakdown: AnalysisScoreBreakdown = {
    rapport: 65,
    spin: mistakes.some((m) => m.includes('Situation')) ? 35 : 60,
    nextStepFixation: mistakes.some((m) => m.includes('следующий шаг')) ? 25 : 75,
    objectionHandling: mistakes.some((m) => m.includes('митигатор')) ? 35 : 60,
    clarity: mistakes.some((m) => m.includes('конкретные цифры')) ? 40 : 70,
    confidence: 60,
  };
  const aiScore = average(breakdown);

  return {
    summary: sentiment === 'positive'
      ? 'Разговор продуктивный. Инвестор подтвердил интерес и запросил материалы.'
      : sentiment === 'negative'
      ? 'Разговор без явного интереса. Контакт стоит сохранить, но без активных касаний.'
      : 'Разговор в нейтральной зоне. Менеджер не использовал ряд buying signals.',
    spinStage: has(/сколько|чек|оценк|доходн/) ? 'N' : has(/расскажи|опыт/) ? 'S' : 'P',
    conversationQuality: aiScore,
    investorInterest: sentiment === 'positive'
      ? 'Подтверждённый интерес, готов обсуждать чек и материалы'
      : sentiment === 'negative'
      ? 'Интерес не подтверждён'
      : 'Базовый интерес есть, инвестор изучает оффер',
    investorConcerns: concerns,
    mistakes,
    whatWorked,
    nextBestAction: sentiment === 'positive'
      ? 'Отправить пакет материалов и подтвердить дату следующего созвона'
      : sentiment === 'negative'
      ? 'Зафиксировать контакт в долгосрочную базу касаний'
      : 'Уточнить открытые вопросы и согласовать формат следующего касания',
    followUpMessage: sentiment === 'positive'
      ? 'Спасибо за разговор. Высылаю материалы — финансовую модель и презентацию. Подтверждаю созвон во вторник.'
      : sentiment === 'negative'
      ? 'Спасибо за время. Если ситуация изменится — на связи.'
      : 'Спасибо за встречу. Соберу ответы по вашим вопросам и вернусь с предложением.',
    probabilityScore: probability,
    recommendedMaterials: materials.length ? materials : ['Краткое резюме сделки'],
    managerAdvice: mistakes.length
      ? 'Самая частая ошибка в этом разговоре — пропуск SPIN-этапов. Перед следующей встречей повторите Problem и Implication.'
      : 'Разговор прошёл по структуре. Закрепите next step и не теряйте темп.',
    sentiment,
    aiScore,
    aiScoreBreakdown: breakdown,
    provider, model, fellBackToMock: fellBack,
  };
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function clamp(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function arr(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

function normalizeStage(raw: unknown): SpinStage {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'P' || s === 'I' || s === 'N') return s;
  return 'S';
}

function normalizeSentiment(raw: unknown): Sentiment {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'positive' || s === 'negative') return s;
  return 'neutral';
}

function sanitizeBreakdown(raw: unknown): AnalysisScoreBreakdown {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    rapport: clamp(r.rapport, 0, 100, 50),
    spin: clamp(r.spin, 0, 100, 50),
    nextStepFixation: clamp(r.nextStepFixation, 0, 100, 50),
    objectionHandling: clamp(r.objectionHandling, 0, 100, 50),
    clarity: clamp(r.clarity, 0, 100, 50),
    confidence: clamp(r.confidence, 0, 100, 50),
  };
}

function average(b: AnalysisScoreBreakdown): number {
  return Math.round((b.rapport + b.spin + b.nextStepFixation + b.objectionHandling + b.clarity + b.confidence) / 6);
}
