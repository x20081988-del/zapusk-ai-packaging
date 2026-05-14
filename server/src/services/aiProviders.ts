// Sprint 15: AI Orchestration registry — server-side source of truth.
//
// До спринта Packaging Pipeline думал, что «промпт = задача». Теперь
// каждый шаблон явно знает: какой провайдер его исполняет, каким
// инструментом, и какой тип артефакта получается на выходе. Это нужно,
// чтобы UI и история job'ов всегда могли показать, КАК устроен AI стек
// проекта, а не просто «один чат что-то сгенерировал».
//
// Non-goals (Sprint 15 фикс): здесь нет live-вызовов внешних API,
// auth flows, async queues, webhook sync. Это статичная декларация —
// orchestration abstraction layer, на который потом можно прицепить
// реальные provider integrations.

export type AIProviderId = 'openai' | 'claude' | 'lovable' | 'claude_design';

export type AIToolId =
  | 'gpt-4.1'
  | 'gpt-5.5'
  | 'claude-opus'
  | 'claude-code'
  | 'lovable-web'
  | 'claude-design-pdf';

export type OutputTypeId =
  | 'investor_summary'
  | 'one_pager'
  | 'pitch_deck'
  | 'pitch_structure'
  | 'landing'
  | 'financial_model'
  | 'calculator'
  | 'faq'
  | 'sales_assistant'
  | 'ai_visibility_report'; // Sprint 20

export interface ProviderMeta {
  id: AIProviderId;
  label: string;          // короткое имя для бейджа («GPT-5.5», «Claude Opus», «Lovable»)
  vendor: string;         // компания / семья моделей
  description: string;    // 1 строка — на что лучший
}

export interface ToolMeta {
  id: AIToolId;
  provider: AIProviderId;
  label: string;          // короткое имя для бейджа
  description: string;    // на что лучший — для оркестрации
}

export interface OutputTypeMeta {
  id: OutputTypeId;
  label: string;          // как назвать в UI ("Investor FAQ", "Финансовая модель")
  description: string;    // 1-2 строки — зачем этот артефакт
  category: string;       // совпадает с PromptTemplate.category для обратной совместимости
}

export const PROVIDERS: Record<AIProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    vendor: 'OpenAI',
    description: 'Reasoning, long-context analysis, sales-style диалоги.',
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    vendor: 'Anthropic',
    description: 'Финансовые расчёты, табличные структуры, точные допущения.',
  },
  lovable: {
    id: 'lovable',
    label: 'Lovable',
    vendor: 'Lovable',
    description: 'Веб-страницы, landing, one-pager — единая визуальная система.',
  },
  claude_design: {
    id: 'claude_design',
    label: 'Claude Design',
    vendor: 'Anthropic / Design',
    description: 'PDF-презентации с тонкой типографикой и слайдовой структурой.',
  },
};

export const TOOLS: Record<AIToolId, ToolMeta> = {
  'gpt-4.1': {
    id: 'gpt-4.1',
    provider: 'openai',
    label: 'GPT-4.1',
    description: 'Sales-диалоги, инвесторский язык, follow-up материалы.',
  },
  'gpt-5.5': {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5',
    description: 'Reasoning-модель: FAQ, снятие возражений, long-context разборы.',
  },
  'claude-opus': {
    id: 'claude-opus',
    provider: 'claude',
    label: 'Claude Opus',
    description: 'Финмодель, IRR, сценарии, dilution, окупаемость.',
  },
  'claude-code': {
    id: 'claude-code',
    provider: 'claude',
    label: 'Claude Code',
    description: 'Инвесторский калькулятор и связанные таблицы.',
  },
  'lovable-web': {
    id: 'lovable-web',
    provider: 'lovable',
    label: 'Lovable Web',
    description: 'Landing page и one-pager в единой дизайн-системе.',
  },
  'claude-design-pdf': {
    id: 'claude-design-pdf',
    provider: 'claude_design',
    label: 'Claude Design PDF',
    description: 'Pitch deck PDF с снап-слайдами под скриншот.',
  },
};

export const OUTPUT_TYPES: Record<OutputTypeId, OutputTypeMeta> = {
  investor_summary: {
    id: 'investor_summary',
    label: 'Инвестиционное резюме',
    description: 'Короткий продающий текст «сколько вложу — сколько заработаю».',
    category: 'summary',
  },
  one_pager: {
    id: 'one_pager',
    label: 'OnePager',
    description: 'Одностраничник, наследует positioning от landing.',
    category: 'pitch',
  },
  pitch_deck: {
    id: 'pitch_deck',
    label: 'Pitch Deck (PDF)',
    description: 'Pitch deck PDF под скриншот → отправку инвестору.',
    category: 'pitch',
  },
  pitch_structure: {
    id: 'pitch_structure',
    label: 'Структура pitch deck',
    description: 'Каркас слайдов и хук — основа под PDF и web-версии.',
    category: 'pitch',
  },
  landing: {
    id: 'landing',
    label: 'Landing page',
    description: 'Веб-страница проекта с investor blocks и FOMO-хуком.',
    category: 'landing',
  },
  financial_model: {
    id: 'financial_model',
    label: 'Финансовая модель',
    description: 'Assumptions, P&L, сценарии, IRR, окупаемость, dilution.',
    category: 'financial',
  },
  calculator: {
    id: 'calculator',
    label: 'Инвесторский калькулятор',
    description: 'Производный артефакт от финмодели — для лендинга и встреч.',
    category: 'spec',
  },
  faq: {
    id: 'faq',
    label: 'Investor FAQ',
    description: 'Снятие возражений, long-context, reasoning.',
    category: 'faq',
  },
  sales_assistant: {
    id: 'sales_assistant',
    label: 'AI Sales Assistant',
    description: 'Live co-pilot переговоров по SPIN + эмоциональный слой.',
    category: 'sales',
  },
  // Sprint 20: AEO / AI search visibility audit. Оценивает, насколько готовая
  // упаковка проекта видна и цитируема AI answer engines (ChatGPT/Claude/
  // Perplexity). Output — Markdown с Discoverability Score + recommendations.
  ai_visibility_report: {
    id: 'ai_visibility_report',
    label: 'AI Discoverability Report',
    description: 'Аудит готовности материалов к AI-search и answer engines.',
    category: 'summary',
  },
};

// Карта PromptTemplate.key → (provider, tool, model, outputType). Это
// «инвентарь оркестрации». Используется и в seed-runner (backfill старых
// строк), и в API-роутах (если в БД ещё нет полей, мы их добираем отсюда).
export interface TemplateOrchestration {
  provider: AIProviderId;
  tool: AIToolId;
  model: string | null;
  outputType: OutputTypeId;
}

export const TEMPLATE_ORCHESTRATION: Record<string, TemplateOrchestration> = {
  investment_summary: {
    provider: 'openai',
    tool: 'gpt-4.1',
    model: null,
    outputType: 'investor_summary',
  },
  one_pager: {
    // OnePager в Sprint 15 принципиально идёт через Lovable: ту же дизайн-
    // систему, что и landing, чтобы инвестор-блоки и colors совпадали.
    provider: 'lovable',
    tool: 'lovable-web',
    model: null,
    outputType: 'one_pager',
  },
  pitch_structure: {
    provider: 'claude_design',
    tool: 'claude-design-pdf',
    model: null,
    outputType: 'pitch_structure',
  },
  lovable_landing: {
    provider: 'lovable',
    tool: 'lovable-web',
    model: null,
    outputType: 'landing',
  },
  lovable_pitch: {
    provider: 'lovable',
    tool: 'lovable-web',
    model: null,
    outputType: 'pitch_deck',
  },
  cloud_design: {
    // PDF pitch deck — Claude Design.
    provider: 'claude_design',
    tool: 'claude-design-pdf',
    model: null,
    outputType: 'pitch_deck',
  },
  financial: {
    provider: 'claude',
    tool: 'claude-opus',
    // Sprint 18: model=null → claudeGenerateText() возьмёт env.ANTHROPIC_MODEL_MAIN
    // (claude-opus-4-1). Placeholder «claude-opus-2025» из Sprint 15 не существовал
    // в реальности и приводил к 404 model_not_found.
    model: null,
    outputType: 'financial_model',
  },
  calculator_spec: {
    provider: 'claude',
    tool: 'claude-code',
    model: null,
    outputType: 'calculator',
  },
  investor_faq: {
    // Reasoning-модель для снятия возражений. model=null → env.OPENAI_MODEL_MAIN.
    provider: 'openai',
    tool: 'gpt-5.5',
    model: null,
    outputType: 'faq',
  },
  sales_gpt: {
    provider: 'openai',
    tool: 'gpt-4.1',
    model: null,
    outputType: 'sales_assistant',
  },
  ai_visibility_report: {
    // Sprint 20: GPT-4.1 как reasoning-модель для аудита (длинный context,
    // structured Markdown output). model=null → env.OPENAI_MODEL_MAIN.
    provider: 'openai',
    tool: 'gpt-4.1',
    model: null,
    outputType: 'ai_visibility_report',
  },
};

export function resolveOrchestration(templateKey: string): TemplateOrchestration | null {
  return TEMPLATE_ORCHESTRATION[templateKey] ?? null;
}

export function listOrchestrationKeys(): string[] {
  return Object.keys(TEMPLATE_ORCHESTRATION);
}
