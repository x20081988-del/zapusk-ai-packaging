import type { Project, ProjectBrief, PromptTemplate } from '@prisma/client';
import { prisma } from '../db.js';
import { resolveOrchestration } from './aiProviders.js';
import { claudeGenerateText, isClaudeConfigured } from '../ai/providers/claude.js';
import { createLovableApp, isLovableConfigured } from './lovableClient.js';

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
  | 'sales_gpt';

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

// Sprint 17: оркестратор реальных provider-вызовов поверх PackagingJob.
// Каждый provider обновляет одну строку: status / previewUrl / resultJson /
// errorCode / completedAt. Никаких новых таблиц.
async function dispatchToProvider({ jobId, projectId, template, orchestration, promptBody }: DispatchArgs): Promise<void> {
  try {
    if (orchestration.provider === 'claude') {
      await runClaudeJob({ jobId, template, orchestration, promptBody });
      return;
    }
    if (orchestration.provider === 'lovable') {
      await runLovableJob({ jobId, projectId, template, orchestration, promptBody });
      return;
    }
    // openai / claude_design — пока без реального вызова из PackagingPipeline.
    // openai используется sales-assistant / conversation-analysis напрямую;
    // claude_design не имеет public API. Помечаем job 'succeeded' с
    // resultPreview из prompt body — это совместимо с Sprint 15 поведением.
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

async function runClaudeJob({
  jobId, template, orchestration, promptBody,
}: Omit<DispatchArgs, 'projectId'>): Promise<void> {
  if (!isClaudeConfigured()) {
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        status: 'mock',
        resultPreview: previewFrom(promptBody),
        errorCode: 'anthropic_key_missing',
        errorMessage: 'Claude не настроен на инстансе — показан детерминированный fallback из промпта.',
        completedAt: new Date(),
      },
    });
    return;
  }

  const result = await claudeGenerateText({
    feature: `packaging.${template.key}`,
    system: 'Ты — Zapusk AI-аналитик. Готовишь инвестиционные материалы (финмодель, калькулятор, структуру слайдов). Отвечай Markdown, без вступительных фраз вроде «вот ваш ответ».',
    user: promptBody,
    model: template.model ?? orchestration.model ?? undefined,
    maxTokens: 4_000,
  });

  if (result.fellBackToMock) {
    await prisma.packagingJob.update({
      where: { id: jobId },
      data: {
        status: 'mock',
        resultPreview: previewFrom(promptBody),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        completedAt: new Date(),
      },
    });
    return;
  }

  // Реальный результат: сохраняем preview + полный текст в resultJson.
  // resultJson — это просто wrapper { text, model, tokens } для аудита.
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
  // Достаём human-readable имя проекта для Lovable metadata.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });

  const result = await createLovableApp({
    prompt: promptBody,
    metadata: {
      projectId,
      templateKey: template.key,
      outputType: template.outputType ?? 'landing',
      projectName: project?.name,
    },
  });

  const status = result.status === 'mock' ? 'mock'
    : result.status === 'failed' ? 'failed'
    : result.status === 'running' ? 'running'
    : 'succeeded';

  await prisma.packagingJob.update({
    where: { id: jobId },
    data: {
      status,
      providerJobId: result.providerJobId,
      previewUrl: result.previewUrl,
      resultUrl: result.projectUrl,
      resultJson: result.raw ? JSON.stringify(result.raw) : null,
      resultPreview: result.previewUrl
        ? `Landing готов · ${result.previewUrl}`
        : status === 'running'
          ? 'Lovable собирает страницу — через 1-2 минуты появится preview.'
          : previewFrom(promptBody),
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      completedAt: status === 'running' ? null : new Date(),
    },
  });
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
