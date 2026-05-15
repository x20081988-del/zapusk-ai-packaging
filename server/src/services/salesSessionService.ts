import { prisma } from '../db.js';
import { aiClient } from '../ai/client.js';

// Investor Meeting Memory — превращает завершённую встречу в структурированную
// карточку сделки. Использует тот же AI gateway, что и live sales assistant,
// но с отдельным system prompt'ом и JSON schema.

export interface CompleteSessionInput {
  projectId?: string | null;
  leadId?: string | null;
  investorName?: string | null;
  investorPhone?: string | null;
  transcript: string;
  adviceHistory?: unknown[];
  startedAt?: string | null;
  endedAt?: string | null;
}

export type InvestorType = 'dividend' | 'growth' | 'preipo' | 'strategic' | 'unknown';
export type MeetingTone = 'hot' | 'warm' | 'cold';

export interface SessionSummary {
  summary: string;
  investorInterest: string;
  checkRange: string;
  objections: string[];
  risks: string[];
  materialsToSend: string[];
  nextStep: string;
  followUpMessage: string;
  probabilityScore: number;
  investorType: InvestorType;
  tone: MeetingTone;
  managerNote: string;
  provider: 'openai' | 'mock' | 'anthropic';
  model: string;
  fellBackToMock: boolean;
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    investorInterest: { type: 'string' },
    checkRange: { type: 'string' },
    objections: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    materialsToSend: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string' },
    followUpMessage: { type: 'string' },
    probabilityScore: { type: 'number', minimum: 0, maximum: 100 },
    investorType: { type: 'string', enum: ['dividend', 'growth', 'preipo', 'strategic', 'unknown'] },
    tone: { type: 'string', enum: ['hot', 'warm', 'cold'] },
    managerNote: { type: 'string' },
  },
  required: [
    'summary', 'investorInterest', 'checkRange', 'objections', 'risks',
    'materialsToSend', 'nextStep', 'followUpMessage', 'probabilityScore',
    'investorType', 'tone', 'managerNote',
  ],
} satisfies Record<string, unknown>;

const SYSTEM = `Ты — Investor Meeting Memory ассистент Zapusk AI Platform.
Тебе дают полный transcript встречи фаундера с инвестором.
Твоя задача — превратить разговор в структурированную карточку сделки на русском.
Стиль: язык менеджера по продажам, без воды, конкретные формулировки.

Принципы:
1. summary — 2-4 предложения, что произошло на встрече и где сейчас находится сделка.
2. investorInterest — кратко: что инвестора зацепило (дивиденды / рост / pre-IPO / страт. интерес).
3. checkRange — точная или диапазонная сумма, если инвестор её назвал.
4. objections — конкретные опасения и возражения, услышанные в разговоре.
5. risks — что может развалить сделку: молчание, сомнения в команде, юр. неопределённость.
6. materialsToSend — какие материалы инвестор попросил или какие ему сейчас полезны.
7. nextStep — одно действие, которое команда должна сделать в ближайшие 24-48 часов.
8. followUpMessage — готовое сообщение для мессенджера, 2-4 строки, тон по ситуации.
9. probabilityScore — оценка вероятности сделки 0..100, реалистичная.
10. investorType — dividend / growth / preipo / strategic / unknown.
11. tone — hot / warm / cold.
12. managerNote — внутренняя заметка менеджеру: что важно помнить об этом инвесторе для будущих касаний.

Не придумывай цифры, которых не было. Если инвестор не назвал чек — пиши «не назвал».
Не используй маркетинговые штампы. Будь предельно конкретен.
Верни строго JSON.`;

export async function completeSession(input: CompleteSessionInput): Promise<SessionSummary> {
  const project = await loadProjectContext(input.projectId ?? undefined);
  const transcript = (input.transcript ?? '').trim();
  if (transcript.length < 10) {
    return mockSummary(transcript, 'mock', 'mock-v1', false);
  }

  const user = [
    'Контекст проекта:',
    project,
    '',
    input.investorName ? `Инвестор: ${input.investorName}` : 'Инвестор: имя не зафиксировано',
    input.investorPhone ? `Телефон: ${input.investorPhone}` : '',
    input.startedAt && input.endedAt ? `Длительность: ${durationLabel(input.startedAt, input.endedAt)}` : '',
    '',
    'Полный transcript встречи:',
    transcript.slice(-60_000),
    '',
    'Преврати разговор в карточку сделки по системе. Верни строго JSON.',
  ].filter(Boolean).join('\n');

  const ai = await aiClient.generateJson({
    system: SYSTEM,
    user,
    feature: 'sales_session.complete',
    modelRoute: 'main',
    maxTokens: 1_200,
    temperature: 0.3,
    jsonSchema: {
      name: 'investor_meeting_memory',
      description: 'Structured deal card after an investor meeting.',
      schema: SUMMARY_SCHEMA,
      strict: true,
    },
  });

  let parsed: Partial<SessionSummary> | null = null;
  try {
    parsed = JSON.parse(extractJson(ai.text)) as Partial<SessionSummary>;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.summary) {
    return mockSummary(transcript, ai.provider, ai.model, true);
  }

  return {
    summary: String(parsed.summary),
    investorInterest: String(parsed.investorInterest ?? ''),
    checkRange: String(parsed.checkRange ?? 'не назвал'),
    objections: Array.isArray(parsed.objections) ? parsed.objections.map(String) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    materialsToSend: Array.isArray(parsed.materialsToSend) ? parsed.materialsToSend.map(String) : [],
    nextStep: String(parsed.nextStep ?? ''),
    followUpMessage: String(parsed.followUpMessage ?? ''),
    probabilityScore: clamp(parsed.probabilityScore, 0, 100, 35),
    investorType: normalizeInvestorType(parsed.investorType),
    tone: normalizeTone(parsed.tone),
    managerNote: String(parsed.managerNote ?? ''),
    provider: ai.provider,
    model: ai.model,
    fellBackToMock: ai.fellBackToMock,
  };
}

// Heuristic fallback so memory works without AI keys. Keywords map to tone and
// objection signals — это контракт mock fallback из ТЗ.
function mockSummary(transcript: string, provider: 'openai' | 'mock' | 'anthropic', model: string, fellBack: boolean): SessionSummary {
  const t = transcript.toLowerCase();
  const has = (re: RegExp) => re.test(t);

  let tone: MeetingTone = 'cold';
  let probability = 25;
  if (has(/интересно|готов|заход|1 ?млн|чек|давайте|подходит|подключ/)) { tone = 'warm'; probability = 55; }
  if (has(/готов инвестировать|зафиксиру|давайте подписыв|какой счёт|перевожу/)) { tone = 'hot'; probability = 78; }

  const objections: string[] = [];
  if (has(/риск|опасн|сомнев/)) objections.push('Опасения по рискам — нужна конкретная защита капитала');
  if (has(/подумаю|потом|позже|не сейчас/)) objections.push('Уход в «подумаю» — потеряли next step');
  if (has(/ликвидн|выйти|выход|возврат/)) objections.push('Вопросы по ликвидности и выходу инвестора');
  if (has(/дорого|чек большой|много/)) objections.push('Чек не комфортен — нужен меньший диапазон');

  const materials: string[] = [];
  if (has(/материал|презентац|документ/)) materials.push('Презентация проекта');
  if (has(/финмодел|финансов|p&l|доходност/)) materials.push('Финансовая модель');
  if (has(/договор|юрид|условия/)) materials.push('Договор инвестирования');
  if (materials.length === 0 && tone !== 'cold') materials.push('Короткое резюме сделки');

  let investorType: InvestorType = 'unknown';
  if (has(/дивиденд|выплат|кешфлоу|пассивн/)) investorType = 'dividend';
  else if (has(/рост|x[0-9]|кратн|вырасти/)) investorType = 'growth';
  else if (has(/pre.?ipo|ipo|выход|оценк/)) investorType = 'preipo';
  else if (has(/синерг|стратег|поглощ|m&a/)) investorType = 'strategic';

  const interest = tone === 'hot' ? 'Интерес подтверждён, готов к следующему шагу'
    : tone === 'warm' ? 'Базовый интерес есть, нужны материалы и подтверждение цифр'
    : 'Интерес неподтверждён, разговор остановился на этапе знакомства';

  const checkRange = has(/(?:\d+[.,]?\d*)\s*(?:млн|миллион)/) ? 'обсуждали 1-5 млн ₽' : 'инвестор не назвал чек';

  const nextStep = tone === 'hot' ? 'Отправить договор и согласовать дату подписи'
    : tone === 'warm' ? 'Отправить пакет материалов и follow-up через 2 дня'
    : 'Зафиксировать причину остановки и решить, оставлять ли контакт в работе';

  const followUp = tone === 'hot'
    ? 'Спасибо за разговор. Прикладываю короткое резюме сделки и предложу слот для подписи в ближайшие дни.'
    : tone === 'warm'
    ? 'Спасибо за встречу. Высылаю презентацию и финансовую модель. Когда удобно вернуться к обсуждению — на этой или следующей неделе?'
    : 'Спасибо за время. Если будут вопросы — на связи. Готов прислать материалы, если решите вернуться к проекту.';

  return {
    summary: tone === 'hot'
      ? 'Встреча прошла продуктивно. Инвестор подтвердил интерес и готов к следующему шагу.'
      : tone === 'warm'
      ? 'Базовый интерес есть. Инвестор хочет изучить материалы перед решением.'
      : 'Разговор остановился на этапе знакомства. Без чётких сигналов интереса.',
    investorInterest: interest,
    checkRange,
    objections,
    risks: tone === 'cold' ? ['Без следующего шага контакт может потеряться'] : [],
    materialsToSend: materials,
    nextStep,
    followUpMessage: followUp,
    probabilityScore: probability,
    investorType,
    tone,
    managerNote: tone === 'hot'
      ? 'HOT-инвестор. Не задерживайте отправку материалов и не теряйте next step.'
      : 'Поставьте напоминание на повторное касание через 3-5 дней. Зафиксируйте, что обсуждалось.',
    provider, model, fellBackToMock: fellBack,
  };
}

// Sprint 40 — sharpen return type from unknown → SalesSession-like with id.
// Route нужен id для captureCandidateFromSalesSession.
export async function persistSession(
  input: CompleteSessionInput,
  summary: SessionSummary,
): Promise<{ id: string } & Record<string, unknown>> {
  return prisma.salesSession.create({
    data: {
      projectId: input.projectId ?? null,
      leadId: input.leadId ?? null,
      investorName: input.investorName ?? null,
      investorPhone: input.investorPhone ?? null,
      source: 'sales_assistant',
      startedAt: input.startedAt ? new Date(input.startedAt) : null,
      endedAt: input.endedAt ? new Date(input.endedAt) : new Date(),
      transcript: input.transcript,
      summary: summary.summary,
      investorInterest: summary.investorInterest,
      checkRange: summary.checkRange,
      objections: JSON.stringify(summary.objections),
      risks: JSON.stringify(summary.risks),
      materialsToSend: JSON.stringify(summary.materialsToSend),
      nextStep: summary.nextStep,
      followUpMessage: summary.followUpMessage,
      probabilityScore: summary.probabilityScore,
      investorType: summary.investorType,
      tone: summary.tone,
      managerNote: summary.managerNote,
      aiProvider: summary.provider,
      aiModel: summary.model,
      fellBackToMock: summary.fellBackToMock,
    },
  });
}

export async function listSessions(filters: {
  projectId?: string;
  leadId?: string;
  // Sprint 35 P0.3 — для founder фильтр по project.userId. Передаётся route'ом
  // только если actor — НЕ admin-like. Для admin/manager оставляется undefined
  // → видны все записи, включая orphan'ы без projectId.
  ownerUserId?: string;
} = {}) {
  return prisma.salesSession.findMany({
    where: {
      archivedAt: null,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.leadId ? { leadId: filters.leadId } : {}),
      ...(filters.ownerUserId
        ? { project: { is: { userId: filters.ownerUserId } } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function getSession(id: string) {
  return prisma.salesSession.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } } },
  });
}

async function loadProjectContext(projectId?: string): Promise<string> {
  if (!projectId) return '— проект не выбран';
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brief: true },
  });
  if (!project) return '— проект не найден';
  return [
    `Проект: ${project.name}`,
    `Отрасль: ${project.industry ?? '—'} · Стадия: ${project.stage ?? '—'}`,
    `Раунд: ${project.raiseAmount ?? '—'} ${project.currency} за ${project.equityOffered ?? '—'}% · Min чек: ${project.minCheck ?? '—'}`,
    `Бизнес: ${project.brief?.businessSummary ?? '—'}`,
  ].join('\n');
}

function durationLabel(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'не зафиксирована';
  const minutes = Math.round(ms / 60_000);
  return `${minutes} мин`;
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

function normalizeInvestorType(raw: unknown): InvestorType {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'dividend' || s === 'growth' || s === 'preipo' || s === 'strategic') return s;
  return 'unknown';
}

function normalizeTone(raw: unknown): MeetingTone {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'hot' || s === 'warm') return s;
  return 'cold';
}
