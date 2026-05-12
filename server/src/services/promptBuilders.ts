import type { Project, ProjectBrief, PromptTemplate } from '@prisma/client';
import { prisma } from '../db.js';

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

  return prisma.generatedPrompt.create({
    data: { projectId, kind, version, body, feedback: feedback ?? null },
  });
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
