// Sprint 15: frontend mirror of the server orchestration registry. Держим
// только display-метаданные — labels, tone-маппинг для бейджей и описание
// для тултипов. Сам список синхронен с server/src/services/aiProviders.ts.
//
// Идея: фаундер всегда видит «GPT-5.5 · Investor FAQ» или «Lovable · Landing
// Page» одинаково на любой странице приложения. Если registry в БД отличается
// (например, админ переопределил провайдера для шаблона), мы рендерим то, что
// реально лежит на template, и подсвечиваем неизвестный label «—».

export type BadgeTone = 'ai' | 'zapusk' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export interface ProviderUiMeta {
  label: string;
  tone: BadgeTone;
  description: string;
}

export interface ToolUiMeta {
  label: string;
  provider: string;
  description: string;
}

export interface OutputTypeUiMeta {
  label: string;
  description: string;
  tone: BadgeTone;
}

export const PROVIDER_UI: Record<string, ProviderUiMeta> = {
  openai: {
    label: 'OpenAI',
    tone: 'ai',
    description: 'Reasoning + sales диалоги.',
  },
  claude: {
    label: 'Claude',
    tone: 'success',
    description: 'Финрасчёты, табличные структуры.',
  },
  lovable: {
    label: 'Lovable',
    tone: 'zapusk',
    description: 'Веб-страницы и one-pager в единой дизайн-системе.',
  },
  claude_design: {
    label: 'Claude Design',
    tone: 'info',
    description: 'PDF презентации со слайдовой структурой.',
  },
};

export const TOOL_UI: Record<string, ToolUiMeta> = {
  'gpt-4.1': { label: 'GPT-4.1', provider: 'openai', description: 'Sales-диалоги, инвесторский язык.' },
  'gpt-5.5': { label: 'GPT-5.5', provider: 'openai', description: 'Reasoning-модель: FAQ, long-context.' },
  'claude-opus': { label: 'Claude Opus', provider: 'claude', description: 'Финмодель, IRR, сценарии.' },
  'claude-code': { label: 'Claude Code', provider: 'claude', description: 'Калькулятор и связанные таблицы.' },
  'lovable-web': { label: 'Lovable Web', provider: 'lovable', description: 'Landing и one-pager.' },
  'claude-design-pdf': { label: 'Claude Design PDF', provider: 'claude_design', description: 'PDF pitch deck.' },
};

export const OUTPUT_TYPE_UI: Record<string, OutputTypeUiMeta> = {
  investor_summary: { label: 'Investor Summary', description: 'Короткий продающий текст.', tone: 'ai' },
  one_pager: { label: 'OnePager', description: 'Производная от landing.', tone: 'zapusk' },
  pitch_deck: { label: 'Pitch Deck', description: 'PDF под скриншот.', tone: 'info' },
  pitch_structure: { label: 'Структура pitch deck', description: 'Каркас слайдов и хук.', tone: 'info' },
  landing: { label: 'Landing Page', description: 'Веб-страница проекта.', tone: 'zapusk' },
  financial_model: { label: 'Financial Model', description: 'P&L, сценарии, IRR.', tone: 'success' },
  calculator: { label: 'Investor Calculator', description: 'Производная от финмодели.', tone: 'success' },
  faq: { label: 'Investor FAQ', description: 'Снятие возражений.', tone: 'ai' },
  sales_assistant: { label: 'AI Sales Assistant', description: 'Live co-pilot по SPIN.', tone: 'ai' },
};

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return '—';
  return PROVIDER_UI[provider]?.label ?? provider;
}

export function toolLabel(tool: string | null | undefined): string {
  if (!tool) return '—';
  return TOOL_UI[tool]?.label ?? tool;
}

export function outputTypeLabel(outputType: string | null | undefined): string {
  if (!outputType) return '—';
  return OUTPUT_TYPE_UI[outputType]?.label ?? outputType;
}

export function providerTone(provider: string | null | undefined): BadgeTone {
  if (!provider) return 'neutral';
  return PROVIDER_UI[provider]?.tone ?? 'neutral';
}

export function outputTypeTone(outputType: string | null | undefined): BadgeTone {
  if (!outputType) return 'neutral';
  return OUTPUT_TYPE_UI[outputType]?.tone ?? 'neutral';
}

/** Default orchestration map — синхрон с server TEMPLATE_ORCHESTRATION для
 *  fallback'а в UI, если template ещё не несёт provider/tool (старый custom
 *  шаблон, который не пересеяли). */
export const DEFAULT_TEMPLATE_ORCHESTRATION: Record<string, { provider: string; tool: string; outputType: string }> = {
  investment_summary: { provider: 'openai', tool: 'gpt-4.1', outputType: 'investor_summary' },
  one_pager:          { provider: 'lovable', tool: 'lovable-web', outputType: 'one_pager' },
  pitch_structure:    { provider: 'claude_design', tool: 'claude-design-pdf', outputType: 'pitch_structure' },
  lovable_landing:    { provider: 'lovable', tool: 'lovable-web', outputType: 'landing' },
  lovable_pitch:      { provider: 'lovable', tool: 'lovable-web', outputType: 'pitch_deck' },
  cloud_design:       { provider: 'claude_design', tool: 'claude-design-pdf', outputType: 'pitch_deck' },
  financial:          { provider: 'claude', tool: 'claude-opus', outputType: 'financial_model' },
  calculator_spec:    { provider: 'claude', tool: 'claude-code', outputType: 'calculator' },
  investor_faq:       { provider: 'openai', tool: 'gpt-5.5', outputType: 'faq' },
  sales_gpt:          { provider: 'openai', tool: 'gpt-4.1', outputType: 'sales_assistant' },
};

export function resolveTemplateOrchestration(templateKey: string | null | undefined) {
  if (!templateKey) return null;
  return DEFAULT_TEMPLATE_ORCHESTRATION[templateKey] ?? null;
}
