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
  faq: { label: 'FAQ для инвестора', description: 'Снятие возражений.', tone: 'ai' },
  sales_assistant: { label: 'AI-ассистент продаж', description: 'Живой co-pilot по СПИН.', tone: 'ai' },
  // Sprint 34Б.3 — русские лейблы для видимости в AI-поиске.
  ai_visibility_report: { label: 'Видимость в AI-поиске', description: 'Готовность к AI-поиску.', tone: 'ai' },
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

// Sprint 16: client-friendly maps. Фаундер не должен видеть «GPT-5.5» / «Claude Opus» /
// «Lovable Web» / «Claude Design» — это admin-уровень информации, и упоминание вендоров
// размывает позиционирование «Zapusk AI оркестрирует AI стек», превращая его в
// «мы перепродаём чужие модели». Для роли client везде используем эти generic labels.

/** Generic label провайдера для клиента — без брендов. */
export function providerClientLabel(provider: string | null | undefined): string {
  if (!provider) return 'AI';
  // Все провайдеры → один общий «AI» бейдж. Это сознательное решение: клиент
  // видит, что «работает AI», без vendor name.
  return 'AI';
}

/** Generic label инструмента → описывает «характер» работы AI, не бренд. */
export function toolClientLabel(tool: string | null | undefined): string {
  if (!tool) return 'AI';
  switch (tool) {
    case 'gpt-4.1':
    case 'gpt-5.5':
      return 'AI Reasoning';
    case 'claude-opus':
      return 'AI Finance';
    case 'claude-code':
      return 'AI Calculator';
    case 'lovable-web':
      return 'AI Web Studio';
    case 'claude-design-pdf':
      return 'AI Design';
    default:
      return 'AI';
  }
}

/** Используется ли роль с правом видеть полную AI provenance? */
export function canSeeAIVendors(role: string | null | undefined): boolean {
  // admin — нужно для orchestration center; manager — нужно для сопровождения проектов;
  // client — нет, фаундер видит только generic labels.
  return role === 'admin' || role === 'manager';
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
  ai_visibility_report: { provider: 'openai', tool: 'gpt-4.1', outputType: 'ai_visibility_report' },
};

export function resolveTemplateOrchestration(templateKey: string | null | undefined) {
  if (!templateKey) return null;
  return DEFAULT_TEMPLATE_ORCHESTRATION[templateKey] ?? null;
}
