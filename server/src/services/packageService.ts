import archiver from 'archiver';
import type { Response } from 'express';
import { prisma } from '../db.js';
import { generateBrief } from './briefService.js';
import { generateAllPrompts, ALL_PROMPT_KINDS, titleForKind } from './promptBuilders.js';
import { sanitizePublicText } from './publicText.js';

// Full packaging = brief regeneration + all 10 prompts.
// Idempotent: each call bumps the version, so history is preserved.
export async function generateFullPackaging(projectId: string) {
  const briefResult = await generateBrief(projectId);
  const promptResults = await generateAllPrompts(projectId);
  return {
    brief: { version: briefResult.brief.version, ai: briefResult.ai },
    prompts: promptResults,
  };
}

const PROMPT_FILENAMES: Record<string, string> = {
  investment_summary: 'investment_summary.md',
  one_pager: 'one_pager.md',
  pitch_structure: 'pitch_deck_structure.md',
  lovable_landing: 'lovable_prompt.md',
  lovable_pitch: 'pitch_deck_website_prompt.md',
  cloud_design: 'cloud_design_prompt.md',
  financial: 'financial_model_prompt.md',
  calculator_spec: 'investor_calculator_spec.md',
  investor_faq: 'investor_faq.md',
  sales_gpt: 'sales_gpt_prompt.md',
};

export async function streamProjectZip(projectId: string, res: Response): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      files: true,
      brief: true,
      investorTerms: true,
      generatedPrompts: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      generatedDocs: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
      referenceMats: true,
    },
  });
  if (!project) throw new Error('Project not found');

  const safeName = project.name.replace(/[^\w\-А-Яа-я]/g, '_').slice(0, 60);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}_package.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('[zip]', err);
    res.status(500).end();
  });
  archive.pipe(res);

  // project_brief.md — combined brief view including napkin
  if (project.brief) {
    const b = project.brief;
    const napkin = (safeJsonParse<Record<string, string | string[]>>(b.napkin) ?? {}) as Record<string, string | string[]>;
    const interviewAnswers = safeJsonParse<Array<{ question?: string; answer?: string }>>(b.interviewAnswers) ?? [];
    const md = [
      `# ${project.name} — Project Brief`,
      `_Version ${b.version} · ${new Date(b.updatedAt).toLocaleString('ru-RU')}_`,
      '',
      '## Business summary',
      b.businessSummary ?? '—',
      '',
      '## Monetization',
      b.monetization ?? '—',
      '',
      '## Investment ask',
      b.investmentAsk ?? '—',
      '',
      '## Key metrics',
      '```json',
      JSON.stringify(safeJsonParse(b.keyMetrics) ?? {}, null, 2),
      '```',
      '',
      '## Бизнес на салфетке',
      `**Что за бизнес:** ${napkin.whatIs ?? '—'}`,
      `**Как зарабатывает:** ${napkin.howMakesMoney ?? '—'}`,
      `**Сколько нужно:** ${napkin.howMuchNeeded ?? '—'}`,
      `**На что деньги:** ${napkin.whatFor ?? '—'}`,
      `**Доход инвестора:** ${napkin.investorReturn ?? '—'}`,
      `**Почему сейчас:** ${napkin.whyNow ?? '—'}`,
      '',
      '## Strengths',
      ...(safeJsonParse<string[]>(b.strengths) ?? []).map((s) => `- ${s}`),
      '',
      '## Weaknesses (для подготовки ответов)',
      ...(safeJsonParse<string[]>(b.weaknesses) ?? []).map((s) => `- ${s}`),
      '',
      '## Missing data (для AI-интервью)',
      ...(safeJsonParse<string[]>(b.missingData) ?? []).map((s) => `- ${s}`),
      '',
      '## AI Interview answers',
      ...(interviewAnswers.length
        ? interviewAnswers.map((a) => `- **${a.question ?? 'Вопрос'}:** ${a.answer ?? '—'}`)
        : ['—']),
      '',
    ].join('\n');
    archive.append(md, { name: 'project_brief.md' });
  }

  // Each prompt — latest version only, in canonical filenames.
  const latestByKind = new Map<string, (typeof project.generatedPrompts)[number]>();
  for (const p of project.generatedPrompts) {
    const cur = latestByKind.get(p.kind);
    if (!cur || cur.version < p.version) latestByKind.set(p.kind, p);
  }
  for (const kind of ALL_PROMPT_KINDS) {
    const latest = latestByKind.get(kind);
    const filename = PROMPT_FILENAMES[kind] ?? `${kind}.md`;
    if (latest) {
      const md = `# ${titleForKind(kind)} — версия ${latest.version}\n_Сформировано ${new Date(latest.createdAt).toLocaleString('ru-RU')}_\n\n${sanitizePublicText(latest.body)}\n`;
      archive.append(md, { name: filename });
    } else {
      archive.append(`# ${titleForKind(kind)}\n\n_Ещё не сформировано._\n`, { name: filename });
    }
  }

  // Generated documents (napkin etc.)
  for (const d of project.generatedDocs.slice(0, 20)) {
    const safeKind = d.kind.replace(/[^\w-]/g, '_');
    archive.append(`# ${d.title}\n\n${d.body}\n`, { name: `documents/${safeKind}_v${d.version}.md` });
  }

  // Full JSON export
  archive.append(JSON.stringify({ exportedAt: new Date().toISOString(), project }, null, 2), {
    name: 'project_export.json',
  });

  // README so the recipient knows what's in the bundle
  archive.append(
    [
      `# ${project.name} — материалы для инвестора`,
      '',
      `Сформировано Zapusk · ${new Date().toLocaleString('ru-RU')}`,
      '',
      '## Содержимое',
      '',
      '- `project_brief.md` — бриф и бизнес на салфетке',
      '- `investment_summary.md` — короткое описание для инвестора',
      '- `one_pager.md` — страница для рассылки',
      '- `pitch_deck_structure.md` — 16-слайдовая структура презентации',
      '- `lovable_prompt.md` — задание для инвестиционной посадочной страницы',
      '- `pitch_deck_website_prompt.md` — задание для веб-презентации инвестора',
      '- `cloud_design_prompt.md` — задание для PDF-презентации',
      '- `financial_model_prompt.md` — задание для финансовой модели с калькулятором',
      '- `investor_calculator_spec.md` — техспек инвестиционного калькулятора',
      '- `investor_faq.md` — FAQ для инвестора',
      '- `sales_gpt_prompt.md` — материал для встречи с инвестором',
      '- `documents/` — версионированные документы',
      '- `project_export.json` — полный JSON-дамп проекта',
      '',
      '## Использование',
      '',
      '1. `lovable_prompt.md` → передать команде для посадочной страницы',
      '2. `pitch_deck_website_prompt.md` → передать команде для веб-презентации',
      '3. `cloud_design_prompt.md` → передать команде для PDF-презентации',
      '4. `financial_model_prompt.md` → передать финансовому аналитику для модели и калькулятора',
      '5. `sales_gpt_prompt.md` → использовать как материал подготовки к встречам с инвесторами',
      '',
    ].join('\n'),
    { name: 'README.md' },
  );

  await archive.finalize();
}

function safeJsonParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
