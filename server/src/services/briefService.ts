import type { ProjectBrief } from '@prisma/client';
import { prisma } from '../db.js';
import { aiComplete } from '../ai/client.js';
import { SYSTEM_BRIEF_EXTRACTOR } from '../ai/prompts.js';
import { mockBrief } from '../ai/mock.js';
import { extractFromUploadedFile } from './fileParser.js';

// Sprint 35 — AI Brief prompt из template'а. Тот же паттерн что Sprint 34Б.2
// для sales_gpt: читаем активный template из БД, fallback на hardcoded
// SYSTEM_BRIEF_EXTRACTOR с громким warn + AuditEvent.
const BRIEF_PROMPT_TEMPLATE_KEY = 'brief_extractor';

type BriefPromptSource = 'db' | 'fallback';

async function resolveBriefPrompt(): Promise<{ system: string; source: BriefPromptSource; templateId: string | null }> {
  try {
    const tpl = await prisma.promptTemplate.findFirst({
      where: { key: BRIEF_PROMPT_TEMPLATE_KEY },
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
      `[brief] template "${BRIEF_PROMPT_TEMPLATE_KEY}" not usable (reason=${reason}) — ` +
      `falling back to hardcoded SYSTEM_BRIEF_EXTRACTOR. ` +
      `Edit template via super-admin → /templates to control prompt without redeploy.`,
    );
    await prisma.auditEvent.create({
      data: {
        action: 'brief_prompt.fallback',
        targetType: 'PromptTemplate',
        targetId: tpl?.id ?? null,
        payload: JSON.stringify({
          key: BRIEF_PROMPT_TEMPLATE_KEY,
          reason,
          active: tpl?.active ?? null,
          bodyLen: tpl?.body?.length ?? 0,
        }),
      },
    }).catch((err) => console.warn('[brief] audit write failed:', err));
    return { system: SYSTEM_BRIEF_EXTRACTOR, source: 'fallback', templateId: null };
  } catch (err) {
    console.warn('[brief] template fetch failed, using hardcoded fallback:', err);
    return { system: SYSTEM_BRIEF_EXTRACTOR, source: 'fallback', templateId: null };
  }
}

export interface StoredAnswer { question: string; answer: string; category?: string; savedAt?: string }
export type BriefFeedbackFocus = 'narrative' | 'finance' | 'risks' | 'investor_offer' | 'missing_data';

// Sprint 32 — snapshot текущего ProjectBrief в ProjectBriefVersion ПЕРЕД любым
// update. Это превращает brief edit из destructive в append-only: regenerate /
// interview answer / feedback refine больше не стирают историю.
//
// Вызывается из:
//   • briefService.generateBrief (upsert path) — если existing brief, snapshot
//   • briefService.regenerateBriefWithFeedback — snapshot перед update
//   • routes/brief.ts saveInterviewAnswers — snapshot перед update
//   • restore endpoint — snapshot текущего перед заменой на старую версию
export async function snapshotBrief(
  brief: ProjectBrief,
  source: 'ai_generate' | 'ai_regenerate_feedback' | 'interview' | 'restore' | 'manual_edit',
): Promise<void> {
  await prisma.projectBriefVersion.create({
    data: {
      projectId: brief.projectId,
      version: brief.version,
      businessSummary: brief.businessSummary,
      monetization: brief.monetization,
      keyMetrics: brief.keyMetrics,
      investmentAsk: brief.investmentAsk,
      strengths: brief.strengths,
      weaknesses: brief.weaknesses,
      missingData: brief.missingData,
      missingByCategory: brief.missingByCategory,
      interviewAnswers: brief.interviewAnswers,
      napkin: brief.napkin,
      rawAIResponse: brief.rawAIResponse,
      source,
    },
  });
}

interface BriefShape {
  businessSummary?: string | null;
  monetization?: string | null;
  keyMetrics?: Record<string, unknown> | null;
  investmentAsk?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  missingData?: string[] | null;
  missingByCategory?: Record<string, unknown> | null;
  napkin?: Record<string, unknown> | null;
}

export async function generateBrief(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { files: true, referenceMats: true },
  });
  if (!project) throw new Error('Project not found');

  // Extract text from all parseable uploaded files (PDF/DOCX/XLSX/TXT).
  // Limits per file are enforced inside fileParser; we additionally cap total context here.
  const extractions = await Promise.all(project.files.map((f) => extractFromUploadedFile(f)));
  const TOTAL_BUDGET = 80_000;
  let used = 0;
  const includedBlocks: string[] = [];
  for (const e of extractions) {
    if (!e.text) continue;
    const header = `\n--- ${e.originalName} (${e.category})${e.truncated ? ' · truncated' : ''} ---\n`;
    const remaining = TOTAL_BUDGET - used;
    if (remaining <= 500) break;
    const chunk = e.text.length > remaining ? e.text.slice(0, remaining) + '… [BUDGET TRUNCATED]' : e.text;
    includedBlocks.push(header + chunk);
    used += header.length + chunk.length;
  }
  const materialsBlock = includedBlocks.length
    ? `Содержимое загруженных материалов:\n${includedBlocks.join('\n')}`
    : '— содержимого материалов нет (файлы не загружены или не удалось распарсить)';

  // Carry forward AI Interview answers from the previous brief — they survive
  // regeneration and let the model refine napkin/strengths/missingData accordingly.
  const previousBrief = await prisma.projectBrief.findUnique({ where: { projectId } });
  const carriedAnswers = parseAnswers(previousBrief?.interviewAnswers ?? null);
  const interviewBlock = carriedAnswers.length
    ? `Ответы фаундера в AI-интервью (учти при сборке "бизнеса на салфетке" и пересчёте missingData):\n${carriedAnswers
        .map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`)
        .join('\n')}`
    : '— фаундер пока не ответил на вопросы AI-интервью';

  const materialsSummary = project.files.length
    ? project.files
        .map((f) => {
          const ext = extractions.find((e) => e.fileId === f.id);
          const meta = ext?.error ? ` · ${ext.error}` : ext?.charCount ? ` · ${ext.charCount} симв.` : '';
          return `- [${f.category}] ${f.originalName} (${Math.round(f.size / 1024)} КБ)${f.url ? ` — ${f.url}` : ''}${meta}`;
        })
        .join('\n')
    : '— материалы пока не загружены';

  const userPrompt = `Контекст проекта:

Название проекта: ${project.name}
ИНН: ${project.inn ?? 'не указан'}
Сайт: ${project.website ?? 'не указан'}
Отрасль: ${project.industry ?? 'не указана'}
Юридический статус: ${project.legalStatus ?? 'не указан'}
Стадия: ${project.stage ?? 'не указана'}
Сумма привлечения: ${project.raiseAmount ?? 'не указана'} ${project.currency}
Минимальный чек инвестора: ${project.minCheck ?? 'не указан'}
Доля для инвестора: ${project.equityOffered ?? 'не указана'}%
Срок привлечения: ${project.raiseDeadline?.toISOString().slice(0, 10) ?? 'не указан'}
Тип инвестора: ${project.investorType ?? 'не указан'}

Загруженные материалы:
${materialsSummary}

${materialsBlock}

${interviewBlock}

Сделай первичный разбор и собери "бизнес на салфетке". Если фаундер уже ответил на некоторые вопросы интервью — учти эти ответы в napkin/strengths/keyMetrics и убери закрытые пункты из missingData. Верни строго JSON.`;

  // Sprint 35 — system prompt из template'а (или fallback на hardcoded).
  const briefPrompt = await resolveBriefPrompt();
  console.log(`[brief] generate · prompt source=${briefPrompt.source} templateId=${briefPrompt.templateId ?? 'none'}`);
  const ai = await aiComplete({
    system: briefPrompt.system,
    user: userPrompt,
    asJSON: true,
    feature: 'brief.generate',
    modelRoute: 'main',
    maxTokens: 4096,
    temperature: 0.4,
  });

  let parsed: ReturnType<typeof mockBrief>;
  try {
    parsed = JSON.parse(extractJson(ai.text));
  } catch {
    parsed = mockBrief(userPrompt);
  }

  const nextVersion = (previousBrief?.version ?? 0) + 1;
  const preferExisting = ai.provider === 'mock';
  const parsedMissingData = JSON.stringify(parsed.missingData ?? []);
  const parsedMissingByCategory = JSON.stringify((parsed as { missingByCategory?: unknown }).missingByCategory ?? {});
  const parsedNapkin = JSON.stringify(parsed.napkin ?? {});

  const baseMissingData = preferExisting && hasJsonArrayItems(previousBrief?.missingData)
    ? previousBrief?.missingData
    : parsedMissingData;
  const baseMissingByCategory = preferExisting && hasCategorizedQuestions(previousBrief?.missingByCategory)
    ? previousBrief?.missingByCategory
    : parsedMissingByCategory;
  const baseNapkin = preferExisting && hasJsonObjectKeys(previousBrief?.napkin)
    ? previousBrief?.napkin
    : parsedNapkin;

  const briefPayload = {
    businessSummary: chooseText(parsed.businessSummary, previousBrief?.businessSummary, preferExisting),
    monetization: chooseText(parsed.monetization, previousBrief?.monetization, preferExisting),
    keyMetrics: serializeObjectWithFallback(parsed.keyMetrics, previousBrief?.keyMetrics, preferExisting),
    investmentAsk: chooseText(parsed.investmentAsk, previousBrief?.investmentAsk, preferExisting),
    strengths: serializeArrayWithFallback(parsed.strengths, previousBrief?.strengths, preferExisting),
    weaknesses: serializeArrayWithFallback(parsed.weaknesses, previousBrief?.weaknesses, preferExisting),
    missingData: filterAnsweredMissingData(baseMissingData, carriedAnswers),
    missingByCategory: filterAnsweredMissingByCategory(baseMissingByCategory, carriedAnswers),
    napkin: serializeNapkinWithInterviewAnswers(baseNapkin, carriedAnswers),
    // Preserve interview answers across regenerations — they are user input, not AI output.
    interviewAnswers: previousBrief?.interviewAnswers ?? null,
    rawAIResponse: ai.text,
  };

  // Sprint 32 — snapshot существующего brief'а ПЕРЕД upsert overwrite.
  if (previousBrief) {
    await snapshotBrief(previousBrief, 'ai_generate');
  }

  const brief = await prisma.projectBrief.upsert({
    where: { projectId },
    update: { version: nextVersion, ...briefPayload },
    create: { projectId, version: 1, ...briefPayload },
  });

  // Also store the napkin as a versioned document so the Documents page can show history.
  await prisma.generatedDocument.create({
    data: {
      projectId,
      kind: 'napkin',
      version: nextVersion,
      format: 'json',
      title: `Бизнес на салфетке v${nextVersion}`,
      body: JSON.stringify(parseJson<Record<string, unknown>>(briefPayload.napkin, {}), null, 2),
    },
  });

  return { brief, ai: { provider: ai.provider, model: ai.model, fellBackToMock: ai.fellBackToMock } };
}

export async function regenerateBriefWithFeedback(projectId: string, feedback: string, focus?: BriefFeedbackFocus) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('Project not found');

  const previousBrief = await prisma.projectBrief.findUnique({ where: { projectId } });
  if (!previousBrief) {
    const err = new Error('Brief not generated');
    err.name = 'BriefNotGenerated';
    throw err;
  }

  const carriedAnswers = parseAnswers(previousBrief.interviewAnswers);
  const currentBrief = briefToShape(previousBrief);
  const userPrompt = `Текущий ProjectBrief проекта "${project.name}":

${JSON.stringify(currentBrief, null, 2)}

Ответы AI-интервью, которые нельзя потерять:
${carriedAnswers.length ? carriedAnswers.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join('\n') : '— нет сохранённых ответов'}

Feedback команды:
${feedback}

Фокус доработки: ${focus ? focusLabel(focus) : 'общая доработка брифа'}

Задача:
1. Доработай текущий brief строго по feedback, не придумывай неподтверждённые цифры.
2. Обнови napkin так, чтобы он стал источником правды для следующих prompts.
3. Сохрани сильные hand-tuned формулировки, если feedback не требует их менять.
4. Не удаляй ответы AI-интервью; учти их в napkin/metrics/missingData.
5. Если feedback закрывает пробелы — убери соответствующие вопросы из missingData/missingByCategory.
6. Верни строго JSON той же структуры, что и ProjectBrief extractor.`;

  // Sprint 35 — system prompt из template'а, plus feedback-mode инструкция сверху.
  const briefPrompt = await resolveBriefPrompt();
  console.log(`[brief] regenerate · prompt source=${briefPrompt.source} templateId=${briefPrompt.templateId ?? 'none'}`);
  const ai = await aiComplete({
    system: `${briefPrompt.system}

Ты сейчас выполняешь не первичную генерацию, а регенерацию существующего ProjectBrief по feedback команды.
Не заменяй хороший заполненный бриф generic-текстом. Меняй только то, что связано с feedback/focus, и сохраняй конкретику текущего brief.`,
    user: userPrompt,
    asJSON: true,
    feature: 'brief.regenerate',
    modelRoute: 'main',
    maxTokens: 4096,
    temperature: 0.35,
  });

  let parsed: BriefShape | null = null;
  if (ai.provider !== 'mock') {
    try {
      parsed = JSON.parse(extractJson(ai.text)) as BriefShape;
    } catch {
      parsed = null;
    }
  }
  const improved = parsed ?? applyFeedbackFallback(currentBrief, feedback, focus);
  const nextVersion = previousBrief.version + 1;

  const mergedNapkin = {
    ...parseJson<Record<string, unknown>>(previousBrief.napkin, {}),
    ...(isRecord(improved.napkin) ? improved.napkin : {}),
  };

  const briefPayload = {
    businessSummary: chooseText(improved.businessSummary, previousBrief.businessSummary, false),
    monetization: chooseText(improved.monetization, previousBrief.monetization, false),
    keyMetrics: serializeObjectWithFallback(improved.keyMetrics, previousBrief.keyMetrics, false),
    investmentAsk: chooseText(improved.investmentAsk, previousBrief.investmentAsk, false),
    strengths: serializeArrayWithFallback(improved.strengths, previousBrief.strengths, false),
    weaknesses: serializeArrayWithFallback(improved.weaknesses, previousBrief.weaknesses, false),
    missingData: filterAnsweredMissingData(
      serializeArrayWithFallback(improved.missingData, previousBrief.missingData, false),
      carriedAnswers,
    ),
    missingByCategory: filterAnsweredMissingByCategory(
      serializeObjectWithFallback(improved.missingByCategory, previousBrief.missingByCategory, false),
      carriedAnswers,
    ),
    napkin: serializeNapkinWithInterviewAnswers(JSON.stringify(mergedNapkin), carriedAnswers),
    interviewAnswers: previousBrief.interviewAnswers,
    rawAIResponse: ai.text,
  };

  // Sprint 32 — snapshot ПЕРЕД destructive update.
  await snapshotBrief(previousBrief, 'ai_regenerate_feedback');

  const brief = await prisma.projectBrief.update({
    where: { projectId },
    data: { version: nextVersion, ...briefPayload },
  });

  await prisma.generatedDocument.create({
    data: {
      projectId,
      kind: 'napkin',
      version: nextVersion,
      format: 'json',
      title: `Бизнес на салфетке v${nextVersion} · feedback`,
      body: JSON.stringify(parseJson<Record<string, unknown>>(briefPayload.napkin, {}), null, 2),
    },
  });

  return { brief, ai: { provider: ai.provider, model: ai.model, fellBackToMock: ai.fellBackToMock } };
}

function briefToShape(brief: {
  businessSummary: string | null;
  monetization: string | null;
  keyMetrics: string | null;
  investmentAsk: string | null;
  strengths: string | null;
  weaknesses: string | null;
  missingData: string | null;
  missingByCategory: string | null;
  napkin: string | null;
}): BriefShape {
  return {
    businessSummary: brief.businessSummary,
    monetization: brief.monetization,
    keyMetrics: parseJson<Record<string, unknown>>(brief.keyMetrics, {}),
    investmentAsk: brief.investmentAsk,
    strengths: parseJson<string[]>(brief.strengths, []),
    weaknesses: parseJson<string[]>(brief.weaknesses, []),
    missingData: parseJson<string[]>(brief.missingData, []),
    missingByCategory: parseJson<Record<string, unknown>>(brief.missingByCategory, {}),
    napkin: parseJson<Record<string, unknown>>(brief.napkin, {}),
  };
}

function applyFeedbackFallback(current: BriefShape, feedback: string, focus?: BriefFeedbackFocus): BriefShape {
  const note = `Feedback команды (${focus ? focusLabel(focus) : 'общая доработка'}): ${feedback.trim()}`;
  const napkin = isRecord(current.napkin) ? { ...current.napkin } : {};
  const weaknesses = Array.isArray(current.weaknesses) ? [...current.weaknesses] : [];
  const strengths = Array.isArray(current.strengths) ? [...current.strengths] : [];
  const missingData = Array.isArray(current.missingData) ? [...current.missingData] : [];
  const missingByCategory = isRecord(current.missingByCategory) ? { ...current.missingByCategory } : {};

  if (focus === 'risks') {
    const existingRisks = Array.isArray(napkin.mainRisks) ? napkin.mainRisks : [];
    napkin.mainRisks = [...existingRisks, feedback.trim()];
    weaknesses.push(feedback.trim());
  } else if (focus === 'finance') {
    napkin.howMakesMoney = appendFeedback(String(napkin.howMakesMoney ?? current.monetization ?? '—'), feedback);
  } else if (focus === 'investor_offer') {
    napkin.investorReturn = appendFeedback(String(napkin.investorReturn ?? current.investmentAsk ?? '—'), feedback);
  } else if (focus === 'missing_data') {
    missingData.push(feedback.trim());
    const financial = Array.isArray(missingByCategory.financial) ? missingByCategory.financial : [];
    missingByCategory.financial = [...financial, feedback.trim()];
  } else {
    napkin.whatIs = appendFeedback(String(napkin.whatIs ?? current.businessSummary ?? '—'), feedback);
    strengths.push(note);
  }

  napkin.feedbackNotes = [
    ...(Array.isArray(napkin.feedbackNotes) ? napkin.feedbackNotes : []),
    { focus: focus ?? 'general', feedback: feedback.trim(), savedAt: new Date().toISOString() },
  ];

  return {
    ...current,
    businessSummary: focus === 'narrative' || !focus
      ? appendFeedback(current.businessSummary ?? '', feedback)
      : current.businessSummary,
    monetization: focus === 'finance'
      ? appendFeedback(current.monetization ?? '', feedback)
      : current.monetization,
    investmentAsk: focus === 'investor_offer'
      ? appendFeedback(current.investmentAsk ?? '', feedback)
      : current.investmentAsk,
    strengths: uniqueStrings(strengths),
    weaknesses: uniqueStrings(weaknesses),
    missingData: uniqueStrings(missingData),
    missingByCategory,
    napkin,
  };
}

function appendFeedback(value: string, feedback: string): string {
  const trimmed = feedback.trim();
  if (!trimmed) return value;
  if (value.includes(trimmed)) return value;
  return value.trim() ? `${value.trim()}\n\nУточнение по feedback: ${trimmed}` : `Уточнение по feedback: ${trimmed}`;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function focusLabel(focus: BriefFeedbackFocus): string {
  const labels: Record<BriefFeedbackFocus, string> = {
    narrative: 'нарратив / позиционирование',
    finance: 'финансы / экономика',
    risks: 'риски',
    investor_offer: 'инвесторское предложение',
    missing_data: 'недостающие данные',
  };
  return labels[focus];
}

export function parseAnswers(raw: string | null | undefined): StoredAnswer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((a) => {
      const normalized = normalizeAnswer(a);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
}

export function mergeInterviewAnswers(existing: StoredAnswer[], incoming: StoredAnswer[], savedAt = new Date().toISOString()): StoredAnswer[] {
  const byQuestion = new Map<string, StoredAnswer>();
  for (const answer of existing) {
    const normalized = normalizeAnswer(answer);
    if (normalized) byQuestion.set(normalizeQuestion(normalized.question), normalized);
  }
  for (const answer of incoming) {
    const question = answer.question.trim();
    if (!question) continue;
    const key = normalizeQuestion(question);
    const text = answer.answer.trim();
    if (!text) {
      byQuestion.delete(key);
      continue;
    }
    byQuestion.set(key, {
      question,
      answer: text,
      category: answer.category?.trim() || byQuestion.get(key)?.category,
      savedAt,
    });
  }
  return [...byQuestion.values()];
}

export function filterAnsweredMissingData(raw: string | null | undefined, answers: StoredAnswer[]): string {
  const answered = answeredQuestionSet(answers);
  const open = parseJson<string[]>(raw, [])
    .filter((q) => typeof q === 'string' && !answered.has(normalizeQuestion(q)));
  return JSON.stringify(open);
}

export function filterAnsweredMissingByCategory(raw: string | null | undefined, answers: StoredAnswer[]): string {
  const answered = answeredQuestionSet(answers);
  const parsed = parseJson<Record<string, unknown>>(raw, {});
  const next: Record<string, string[]> = {};
  for (const [category, items] of Object.entries(parsed)) {
    next[category] = Array.isArray(items)
      ? items.filter((q): q is string => typeof q === 'string' && !answered.has(normalizeQuestion(q)))
      : [];
  }
  return JSON.stringify(next);
}

export function serializeNapkinWithInterviewAnswers(raw: string | null | undefined, answers: StoredAnswer[]): string {
  const napkin = parseJson<Record<string, unknown>>(raw, {});
  if (answers.length > 0) {
    napkin.interviewAnswers = answers.map(({ question, answer, category, savedAt }) => ({
      question,
      answer,
      ...(category ? { category } : {}),
      ...(savedAt ? { savedAt } : {}),
    }));
  } else {
    delete napkin.interviewAnswers;
  }
  return JSON.stringify(napkin);
}

function extractJson(text: string): string {
  // Models sometimes wrap JSON in ```json fences or add prose. Pull the first {...} block.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function chooseText(next: unknown, existing: string | null | undefined, preferExisting: boolean): string | null {
  const parsed = typeof next === 'string' && next.trim() ? next : null;
  if (preferExisting && existing?.trim()) return existing;
  return parsed ?? existing ?? null;
}

function serializeObjectWithFallback(next: unknown, existingRaw: string | null | undefined, preferExisting: boolean): string {
  const existing = parseJson<Record<string, unknown>>(existingRaw, {});
  const parsed = isRecord(next) ? next : {};
  return JSON.stringify(preferExisting ? { ...parsed, ...existing } : { ...existing, ...parsed });
}

function serializeArrayWithFallback(next: unknown, existingRaw: string | null | undefined, preferExisting: boolean): string {
  const existing = parseJson<string[]>(existingRaw, []).filter((item) => typeof item === 'string');
  const parsed = Array.isArray(next) ? next.filter((item): item is string => typeof item === 'string') : [];
  if (preferExisting && existing.length > 0) return JSON.stringify(existing);
  return JSON.stringify(parsed.length > 0 ? parsed : existing);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeAnswer(raw: unknown): StoredAnswer | null {
  if (!isRecord(raw)) return null;
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!question || !answer) return null;
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : undefined;
  const savedAt = typeof raw.savedAt === 'string' && raw.savedAt.trim() ? raw.savedAt.trim() : undefined;
  return { question, answer, ...(category ? { category } : {}), ...(savedAt ? { savedAt } : {}) };
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase();
}

function answeredQuestionSet(answers: StoredAnswer[]): Set<string> {
  return new Set(answers.filter((a) => a.answer.trim()).map((a) => normalizeQuestion(a.question)));
}

function hasJsonArrayItems(raw: string | null | undefined): boolean {
  return parseJson<unknown[]>(raw, []).length > 0;
}

function hasJsonObjectKeys(raw: string | null | undefined): boolean {
  return Object.keys(parseJson<Record<string, unknown>>(raw, {})).length > 0;
}

function hasCategorizedQuestions(raw: string | null | undefined): boolean {
  const parsed = parseJson<Record<string, unknown>>(raw, {});
  return Object.values(parsed).some((items) => Array.isArray(items) && items.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
