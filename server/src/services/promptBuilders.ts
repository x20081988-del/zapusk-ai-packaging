import type { Project, ProjectBrief, PromptTemplate } from '@prisma/client';
import { prisma } from '../db.js';
import { resolveOrchestration } from './aiProviders.js';
import { claudeGenerateText, isClaudeConfigured } from '../ai/providers/claude.js';
// Sprint 18: lovableClient остаётся в кодовой базе как менеджерский tool
// (например, для будущего auto-pre-fill через admin-инструмент), но client-
// pipeline его больше не дёргает. Manager сам решает, когда использовать.

export type PromptKind =
  | 'investment_summary'
  | 'one_pager'
  | 'pitch_structure'
  | 'lovable_landing'
  | 'lovable_pitch'
  | 'cloud_design'
  | 'financial'
  | 'calculator_spec'
  | 'investor_faq'
  | 'sales_gpt'
  | 'ai_visibility_report'; // Sprint 20

export const ALL_PROMPT_KINDS: PromptKind[] = [
  'investment_summary',
  'one_pager',
  'pitch_structure',
  'lovable_landing',
  'lovable_pitch',
  'cloud_design',
  'financial',
  'calculator_spec',
  'investor_faq',
  'sales_gpt',
  'ai_visibility_report',
];

// Human-readable titles for materials we hand to the team. Keys stay internal
// (used in URLs, filenames, DB rows); titles surface in .md headers and exports.
export const KIND_TITLES: Record<PromptKind, string> = {
  investment_summary: 'Краткое резюме для инвестора',
  one_pager: 'Одностраничник',
  pitch_structure: 'Структура инвестиционной презентации',
  lovable_landing: 'Задание для посадочной страницы',
  lovable_pitch: 'Задание для веб-презентации инвестора',
  cloud_design: 'Задание для PDF-презентации',
  financial: 'Задание для финансовой модели',
  calculator_spec: 'Спецификация инвестиционного калькулятора',
  investor_faq: 'Ответы на вопросы инвестора',
  sales_gpt: 'Материал для встречи с инвестором',
  // Sprint 20: внутренний аудит AI Discoverability. Клиенту показывается как
  // «AI Discoverability Report» — собственная инфраструктура ZAPUSK AI.
  ai_visibility_report: 'AI Discoverability отчёт',
};

export function titleForKind(kind: string): string {
  return (KIND_TITLES as Record<string, string>)[kind] ?? kind;
}

export interface InterviewAnswer { question: string; answer: string; category?: string; savedAt?: string }

export interface BuiltContext {
  project: Project;
  brief: ProjectBrief | null;
  napkin: Record<string, unknown>;
  strengths: string[];
  weaknesses: string[];
  missingData: string[];
  interviewAnswers: InterviewAnswer[];
}

async function buildContext(projectId: string): Promise<BuiltContext> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('Project not found');
  const brief = await prisma.projectBrief.findUnique({ where: { projectId } });

  const napkin = parseJson<Record<string, unknown>>(brief?.napkin, {});
  const strengths = parseJson<string[]>(brief?.strengths, []);
  const weaknesses = parseJson<string[]>(brief?.weaknesses, []);
  const missingData = parseJson<string[]>(brief?.missingData, []);
  const interviewAnswers = parseJson<InterviewAnswer[]>(brief?.interviewAnswers ?? null, []);

  return { project, brief, napkin, strengths, weaknesses, missingData, interviewAnswers };
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fillTemplate(body: string, ctx: BuiltContext): string {
  const p = ctx.project;

  // Index answers by question text for O(1) lookup when rendering missing_data.
  const answerByQ = new Map<string, string>();
  for (const a of ctx.interviewAnswers) {
    answerByQ.set(a.question.trim(), a.answer);
  }
  const interviewRendered = ctx.interviewAnswers.length
    ? ctx.interviewAnswers.map((a) => `• Q: ${a.question}\n  A: ${a.answer}`).join('\n')
    : '—';
  // Augmented missing_data: questions with answers get them inline; unanswered stay open.
  const missingRendered = ctx.missingData.length
    ? ctx.missingData
        .map((q) => {
          const a = answerByQ.get(q.trim());
          return a ? `• ${q}\n  ↳ ✓ ОТВЕТ: ${a}` : `• ${q}`;
        })
        .join('\n')
    : ctx.interviewAnswers.length
      ? `Закрытые вопросы AI-интервью:\n${interviewRendered}`
      : '—';
  const napkinForPrompts = ctx.interviewAnswers.length
    ? {
        ...ctx.napkin,
        interviewAnswers: ctx.interviewAnswers.map(({ question, answer, category, savedAt }) => ({
          question,
          answer,
          ...(category ? { category } : {}),
          ...(savedAt ? { savedAt } : {}),
        })),
      }
    : ctx.napkin;
  const businessSummary = [
    ctx.brief?.businessSummary ?? 'не сгенерировано',
    ctx.interviewAnswers.length ? `Ответы AI-интервью:\n${interviewRendered}` : '',
  ].filter(Boolean).join('\n\n');

  const map: Record<string, string> = {
    project_name: p.name,
    industry: p.industry ?? 'не указано',
    stage: p.stage ?? 'не указано',
    raise_amount: p.raiseAmount ? `${p.raiseAmount.toLocaleString('ru-RU')} ${p.currency}` : 'не указано',
    min_check: p.minCheck ? `${p.minCheck.toLocaleString('ru-RU')} ${p.currency}` : 'не указано',
    equity: p.equityOffered ? `${p.equityOffered}%` : 'не указано',
    investor_type: p.investorType ?? 'не указано',
    website: p.website ?? '—',
    business_summary: businessSummary,
    monetization: ctx.brief?.monetization ?? 'не сгенерировано',
    investment_ask: ctx.brief?.investmentAsk ?? 'не сгенерировано',
    strengths: ctx.strengths.length ? ctx.strengths.map((s) => `• ${s}`).join('\n') : 'не сгенерировано',
    weaknesses: ctx.weaknesses.length ? ctx.weaknesses.map((s) => `• ${s}`).join('\n') : 'не сгенерировано',
    missing_data: missingRendered,
    interview_answers: interviewRendered,
    napkin: JSON.stringify(napkinForPrompts, null, 2),
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => map[key] ?? `{{${key}}}`);
}

export async function generatePrompt(projectId: string, kind: PromptKind, feedback?: string) {
  const ctx = await buildContext(projectId);
  const template = await prisma.promptTemplate.findUnique({ where: { key: kind } });
  if (!template) throw new Error(`Template not found: ${kind}`);

  let body = fillTemplate(template.body, ctx);
  if (feedback && feedback.trim()) {
    body = withFeedbackHeader(body, feedback.trim());
  }

  const previous = await prisma.generatedPrompt.findFirst({
    where: { projectId, kind },
    orderBy: { version: 'desc' },
  });
  const version = (previous?.version ?? 0) + 1;

  const generatedPrompt = await prisma.generatedPrompt.create({
    data: { projectId, kind, version, body, feedback: feedback ?? null },
  });

  // Sprint 15: оставляем след в PackagingJob — какой AI должен исполнять
  // этот промпт, какой выход ожидаем. Если template уже несёт provider/tool
  // — используем их, иначе подтягиваем из default registry. Если ничего не
  // нашли (custom template без orchestration) — пропускаем job, чтобы не
  // ломать обратную совместимость.
  const orchestration = template.provider && template.tool && template.outputType
    ? {
        provider: template.provider,
        tool: template.tool,
        model: template.model,
        outputType: template.outputType,
      }
    : resolveOrchestration(kind);

  if (orchestration) {
    // Sprint 17: создаём PackagingJob со status='queued', потом dispatch'им
    // на реальный provider client. Если ключа нет — provider возвращает mock
    // с понятным errorCode, и мы помечаем job 'mock'. Если call упал —
    // 'failed' + errorCode. Это синхронный flow, без очередей.
    const job = await prisma.packagingJob.create({
      data: {
        projectId,
        templateId: template.id,
        templateKey: template.key,
        provider: orchestration.provider,
        tool: orchestration.tool,
        model: orchestration.model ?? null,
        outputType: orchestration.outputType,
        status: 'queued',
        prompt: body,
        resultPreview: previewFrom(body),
        generatedPromptId: generatedPrompt.id,
      },
    });

    // Fire provider in-process. Не блокируем return фронту, но дожидаемся
    // результата — для текущего MVP это OK, генерация занимает 5-30 сек.
    // Будущий sprint: вынести в worker и переключить status через polling.
    await dispatchToProvider({
      jobId: job.id,
      projectId,
      template,
      orchestration,
      promptBody: body,
    });
  }

  return generatedPrompt;
}

interface DispatchArgs {
  jobId: string;
  projectId: string;
  template: PromptTemplate;
  orchestration: { provider: string; tool: string; model: string | null; outputType: string };
  promptBody: string;
}

// Sprint 17/18: оркестратор реальных provider-вызовов поверх PackagingJob.
// Каждый provider обновляет одну строку: status / previewUrl / resultJson /
// errorCode / completedAt.
//
// Sprint 18 — Managed Packaging Flow:
// lovable / claude_design провайдеры теперь идут в 'awaiting_manager', а не
// делают синхронный fetch на внешний API. Это сознательное архитектурное
// решение: эти материалы (landing, one_pager, pitch deck PDF) делаются
// менеджером вручную через внутренние инструменты, и клиент не должен видеть
// упоминаний Lovable / Claude Design / GPT-5.5. Менеджер закрывает задачу
// через /api/manager/packaging-tasks/:id/complete, и job переходит в
// 'succeeded' с реальной previewUrl.
async function dispatchToProvider({ jobId, projectId, template, orchestration, promptBody }: DispatchArgs): Promise<void> {
  try {
    if (orchestration.provider === 'claude') {
      await runClaudeJob({ jobId, template, orchestration, promptBody });
      return;
    }
    if (orchestration.provider === 'lovable') {
      // Sprint 18: даже при наличии LOVABLE_API_KEY клиент не должен видеть
      // имя Lovable — landing проходит ручную сборку. Дёргать API будем,
      // если он есть, но как «менеджерский tool», не как клиент-facing.
      await runLovableJob({ jobId, projectId, template, orchestration, promptBody });
      return;
    }
    if (orchestration.provider === 'claude_design') {
      // PDF pitch deck — нет public API, делаем awaiting_manager.
      await markAwaitingManager(jobId, 'pitch_deck');
      return;
    }
    // openai — без реального вызова из PackagingPipeline (используется
    // напрямую sales-assistant'ом и conversation-analysis'ом). Sprint 15
    // совместимое поведение: status=succeeded с resultPreview из промпта.
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        status: 'succeeded',
        completedAt: new Date(),
      },
    });
  } catch (err) {
    // Никогда не падаем на фронт — оркестратор всегда оставляет job в
    // финальном состоянии. errorMessage уже humanized, без секретов.
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn(`[packaging.dispatch] job ${jobId} crashed: ${message}`);
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorCode: 'dispatcher_crash',
        errorMessage: 'Внутренняя ошибка оркестратора. Повторите запуск.',
        completedAt: new Date(),
      },
    });
  }
}

// Sprint 18: ставим job в 'awaiting_manager' с понятным client-facing
// resultPreview. Менеджер увидит этот job в /manager → «Задачи на упаковку».
async function markAwaitingManager(jobId: string, outputType: string): Promise<void> {
  const clientMessage = outputType === 'landing' || outputType === 'one_pager' || outputType === 'pitch_deck'
    ? 'Материал готовится командой ZAPUSK AI. Обычно занимает от нескольких часов до 1 рабочего дня.'
    : 'Материал готовится командой ZAPUSK AI.';
  await prisma.packagingJob.update({
    where: { id: jobId },
    data: {
      status: 'awaiting_manager',
      resultPreview: clientMessage,
      completedAt: null,
    },
  });
}

async function runClaudeJob({
  jobId, template, orchestration, promptBody,
}: Omit<DispatchArgs, 'projectId'>): Promise<void> {
  // Sprint 18: если Claude не настроен — ставим awaiting_manager.
  // Клиент видит «Материал готовится командой ZAPUSK AI». Менеджер закроет
  // задачу через /manager.
  if (!isClaudeConfigured()) {
    await markAwaitingManager(jobId, template.outputType ?? 'financial_model');
    // errorCode сохраняем для admin-диагностики, но client его не видит.
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        errorCode: 'anthropic_key_missing',
        errorMessage: 'Claude не настроен на инстансе — задача отправлена менеджеру.',
      },
    });
    return;
  }

  const result = await claudeGenerateText({
    feature: `packaging.${template.key}`,
    system: 'Ты — Zapusk AI-аналитик. Готовишь инвестиционные материалы (финмодель, калькулятор, структуру слайдов). Отвечай Markdown, без вступительных фраз вроде «вот ваш ответ».',
    user: promptBody,
    // Sprint 18: model переопределение убрано — используем env.ANTHROPIC_MODEL_MAIN
    // (claude-opus-4-1). Раньше template.model='claude-opus-2025' приводил к 404.
    model: template.model ?? orchestration.model ?? undefined,
    maxTokens: 4_000,
  });

  if (result.fellBackToMock) {
    // Sprint 18: транзиентная ошибка / model_not_found / network → переключаем
    // на ручную сборку менеджером. Клиент не должен видеть errorCode.
    await markAwaitingManager(jobId, template.outputType ?? 'financial_model');
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });
    return;
  }

  // Реальный результат: сохраняем preview + полный текст в resultJson.
  const preview = result.text.split('\n').map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith('#')) ?? result.text;
  await prisma.packagingJob.update({
    where: { id: jobId },
    data: {
      status: 'succeeded',
      model: result.model,
      resultPreview: preview.length > 240 ? `${preview.slice(0, 237)}...` : preview,
      resultJson: JSON.stringify({
        text: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }),
      completedAt: new Date(),
    },
  });
}

async function runLovableJob({
  jobId, projectId, template, promptBody,
}: DispatchArgs): Promise<void> {
  // Sprint 18 — Managed Packaging Flow:
  // landing / one_pager / pitch deck (web) делаются менеджером вручную, потому
  // что Lovable API (если он есть на инстансе) — это менеджерский tool, не
  // клиент-facing. Без LOVABLE_API_KEY мы НЕ показываем клиенту mock URL
  // (старое Sprint 17 поведение), а ставим job в 'awaiting_manager' с
  // понятным client-facing сообщением. Менеджер закрывает задачу руками
  // через /manager → «Задачи на упаковку».
  //
  // Если LOVABLE_API_KEY есть — мы всё равно НЕ дёргаем Lovable из клиентской
  // pipeline (это admin/manager-окружение). Это ровно «managed flow».
  const outputType = template.outputType ?? 'landing';
  await markAwaitingManager(jobId, outputType);
  // Передаём в console.log только template.key — никаких ключей и raw prompt.
  console.log(`[packaging] queued ${template.key} → awaiting_manager (project=${projectId.slice(0, 8)})`);
}

function previewFrom(body: string): string {
  // Берём первую содержательную строку, обрезаем до 200 символов — это идёт
  // в «AI generated materials» history как короткий тизер.
  const firstLine = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('>') && !l.startsWith('---')) ?? '';
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine;
}

function withFeedbackHeader(body: string, feedback: string): string {
  return [
    '> ⚠️ FEEDBACK ОТ КОМАНДЫ (учти при следующей итерации):',
    feedback.split('\n').map((l) => '> ' + l).join('\n'),
    '>',
    '> Перечитай оригинальный промпт ниже и переработай результат с учётом этой обратной связи.',
    '',
    '---',
    '',
    body,
  ].join('\n');
}

export async function generateAllPrompts(projectId: string) {
  const results: Array<{ kind: PromptKind; version: number }> = [];
  for (const kind of ALL_PROMPT_KINDS) {
    try {
      const created = await generatePrompt(projectId, kind);
      results.push({ kind, version: created.version });
    } catch (err) {
      console.warn(`[prompt] failed for ${kind}:`, err instanceof Error ? err.message : err);
    }
  }
  return results;
}
