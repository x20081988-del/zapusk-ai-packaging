// Sprint 61 — Финансовые факты проекта (deterministic, без AI).
//
// Зачем:
//   Fuzzy KB-retrieval по keyword'у — слабо работает на финансовых вопросах:
//     • «какая чистая прибыль в 2027?» — ключевое «2027» легко не попасть
//       в chunk, если в финмодели цифра подписана «27 год».
//     • «оценка проекта?» — keyword «оценка» матчится на «оценку рынка»,
//       «оценку команды» и т.п.
//   Решение: для финансовых вопросов вытаскиваем СТРУКТУРНЫЕ факты из:
//     • ProjectBrief.keyMetrics (JSON)
//     • ProjectBrief.napkin (JSON)
//     • InvestorTerms (relational)
//     • Project core (raiseAmount, equityOffered, minCheck, currency)
//   И инжектим их в prompt в виде «metric · value · source», источник
//   явно подписан. AI читает это как факты с провенансом.
//
// Когда блок инжектится:
//   Только если transcript содержит финансовые триггеры (см.
//   detectFinancialQuestion из projectContextFormatter.ts) ИЛИ если опции
//   forceInclude=true. Иначе пустая строка — не засоряем prompt.

import type { LoadedProject } from './projectContextFormatter.js';
import { detectFinancialQuestion } from './projectContextFormatter.js';
import type { NumericFactForPrompt } from './numericFactsRetrieval.js';

export interface FinancialFact {
  metric: string;          // «MRR», «Чистая прибыль 2027», «Оценка», …
  value: string;           // human-readable форматированное значение
  period?: string;         // «2027», «12 мес», если применимо
  source: 'brief.keyMetrics' | 'brief.napkin' | 'investorTerms' | 'project.core' | 'finmodel.xlsx';
}

export interface BuildFinancialFactsOptions {
  // Если true, блок строится независимо от наличия триггеров в transcript.
  forceInclude?: boolean;
  // Hard cap общего размера блока. Defaults to 1500 — это всё ещё компактно.
  charBudget?: number;
  // Sprint 62 P5 — pre-fetched structured numeric facts from
  // ProjectNumericFact table. Caller should pass `await
  // retrieveProjectNumericFacts({...})` here. Optional; if absent we only
  // use the legacy brief/InvestorTerms-derived facts.
  numericFacts?: NumericFactForPrompt[];
}

// Pure function. Не ходит в БД.
export function buildProjectFinancialFacts(
  projects: LoadedProject[],
  transcript: string,
  options: BuildFinancialFactsOptions = {},
): string {
  if (!projects || projects.length === 0) return '';
  const triggered = options.forceInclude === true || detectFinancialQuestion(transcript ?? '');
  if (!triggered) return '';

  const budget = options.charBudget ?? 1_500;
  const blocks: string[] = [];
  const numericFacts = options.numericFacts ?? [];
  for (const project of projects) {
    const facts = extractFactsForProject(project);
    // Sprint 62 P5 — append finmodel-derived numeric facts as additional
    // FinancialFact entries (with source='finmodel.xlsx' provenance).
    for (const f of numericFacts) {
      facts.push(numericFactToFinancialFact(f));
    }
    if (facts.length === 0) continue;
    const headerLine = projects.length > 1
      ? `— ${project.name}:`
      : `— ${project.name}:`;
    const factLines = facts.map(fmtFact);
    blocks.push([headerLine, ...factLines].join('\n'));
  }

  if (blocks.length === 0) return '';

  const header = [
    'Финансовые факты проекта (используй именно эти числа; не выдумывай недостающие — лучше сказать, что нужно уточнить по финмодели):',
  ];
  const body = blocks.join('\n');
  const total = [...header, body].join('\n');
  if (total.length <= budget) return total;
  return total.slice(0, budget - 1) + '…';
}

// Достаём из одного проекта все известные финансовые факты в порядке источников:
// core → investorTerms → brief.keyMetrics → brief.napkin.
function extractFactsForProject(p: LoadedProject): FinancialFact[] {
  const out: FinancialFact[] = [];
  const currency = p.currency ?? 'RUB';

  // 1. Project core — raiseAmount / equity / minCheck
  if (p.raiseAmount != null) {
    out.push({
      metric: 'Запрашиваемый раунд',
      value: fmtMoney(p.raiseAmount, currency),
      source: 'project.core',
    });
  }
  if (p.equityOffered != null) {
    out.push({
      metric: 'Предлагаемая доля',
      value: `${p.equityOffered}%`,
      source: 'project.core',
    });
  }
  if (p.minCheck != null) {
    out.push({
      metric: 'Минимальный чек',
      value: fmtMoney(p.minCheck, currency),
      source: 'project.core',
    });
  }

  // 2. InvestorTerms
  const t = p.investorTerms;
  if (t) {
    if (t.amount != null) {
      out.push({
        metric: 'Сумма по условиям',
        value: fmtMoney(t.amount, currency),
        source: 'investorTerms',
      });
    }
    if (t.equityPercent != null) {
      out.push({
        metric: 'Доля по условиям',
        value: `${t.equityPercent}%`,
        source: 'investorTerms',
      });
    }
    if (t.valuation != null) {
      out.push({
        metric: 'Оценка (valuation)',
        value: fmtMoney(t.valuation, currency),
        source: 'investorTerms',
      });
    }
    if (t.instrument) {
      out.push({ metric: 'Инструмент сделки', value: shorten(t.instrument, 80), source: 'investorTerms' });
    }
    if (t.expectedReturn) {
      out.push({ metric: 'Ожидаемая доходность', value: shorten(t.expectedReturn, 80), source: 'investorTerms' });
    }
    if (t.payback) {
      out.push({ metric: 'Окупаемость', value: shorten(t.payback, 80), source: 'investorTerms' });
    }
    if (t.exitStrategy) {
      out.push({ metric: 'Стратегия выхода', value: shorten(t.exitStrategy, 120), source: 'investorTerms' });
    }
  }

  // 3. brief.keyMetrics — JSON object
  const keyMetrics = safeJson(p.brief?.keyMetrics);
  if (keyMetrics && typeof keyMetrics === 'object' && !Array.isArray(keyMetrics)) {
    for (const [k, v] of Object.entries(keyMetrics as Record<string, unknown>)) {
      const value = renderJsonValue(v);
      if (!value) continue;
      const { metric, period } = parseMetricKey(k);
      out.push({ metric, value, period, source: 'brief.keyMetrics' });
    }
  }

  // 4. brief.napkin — JSON object. Только финансово-релевантные ключи
  // (revenue / profit / margin / cost / capex / opex / payback / valuation /
  // investorReturn / units / ARPU / growth). Прочие napkin-поля идут в
  // обычный project context.
  const napkin = safeJson(p.brief?.napkin);
  if (napkin && typeof napkin === 'object' && !Array.isArray(napkin)) {
    for (const [k, v] of Object.entries(napkin as Record<string, unknown>)) {
      if (!isFinanceKey(k)) continue;
      const value = renderJsonValue(v);
      if (!value) continue;
      const { metric, period } = parseMetricKey(k);
      out.push({ metric, value, period, source: 'brief.napkin' });
    }
  }

  return out;
}

function fmtFact(f: FinancialFact): string {
  const period = f.period ? ` · ${f.period}` : '';
  return `  • ${f.metric}${period} = ${f.value}    [источник: ${labelSource(f.source)}]`;
}

function labelSource(s: FinancialFact['source']): string {
  switch (s) {
    case 'brief.keyMetrics': return 'бриф / ключевые метрики';
    case 'brief.napkin':     return 'бриф / бизнес на салфетке';
    case 'investorTerms':    return 'условия инвестирования';
    case 'project.core':     return 'карточка проекта';
    case 'finmodel.xlsx':    return 'финмодель XLSX';
  }
}

// Sprint 62 P5 — convert a NumericFactForPrompt (from ProjectNumericFact
// table) into the FinancialFact shape consumed by the formatter. Includes
// a confidence-aware suffix when the source data is low-confidence.
function numericFactToFinancialFact(f: NumericFactForPrompt): FinancialFact {
  let value: string;
  if (f.unit === '%') value = `${f.value}%`;
  else if (f.unit === 'RUB' || f.unit === 'USD' || f.unit === 'EUR') {
    value = `${Math.round(f.value).toLocaleString('ru-RU').replace(/ /g, ' ')} ${f.unit}`;
  } else if (f.unit) value = `${f.value} ${f.unit}`;
  else value = `${f.value}`;

  // Append section provenance to metric label so prompt clearly shows
  // «по финмодели → Sheet: P&L 2027».
  const sectionTag = f.sectionLabel ? ` (${f.sectionLabel})` : '';
  return {
    metric: `${f.metric}${sectionTag}`,
    value,
    period: f.period ?? undefined,
    source: 'finmodel.xlsx',
  };
}

function fmtMoney(value: number, currency: string): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('ru-RU').replace(/ /g, ' ')} ${currency}`;
}

function shorten(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function safeJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderJsonValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? shorten(t, 120) : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (Array.isArray(v)) {
    const items = v.filter((x) => x !== null && x !== undefined).slice(0, 4).map((x) => renderJsonValue(x) ?? '');
    return items.filter(Boolean).join(' / ') || null;
  }
  if (typeof v === 'object') {
    try { return shorten(JSON.stringify(v), 120); } catch { return null; }
  }
  return null;
}

// Если ключ — «mrr_2027» или «revenue.2025» → metric='MRR', period='2027'.
// Если нет года в ключе — period=undefined.
function parseMetricKey(key: string): { metric: string; period?: string } {
  // Извлекаем 4-значный год.
  const yearMatch = key.match(/(20\d{2})/);
  const period = yearMatch ? yearMatch[1] : undefined;
  // Убираем year/punctuation, нормализуем casing.
  const cleaned = key
    .replace(/[_\-.]+/g, ' ')
    .replace(/20\d{2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const metric = cleaned.length === 0 ? key : prettyMetric(cleaned);
  return { metric, period };
}

function prettyMetric(s: string): string {
  // MRR / ARR / GMV / CAC / LTV / EBITDA → uppercase. Остальные — capitalize first.
  const upperList = ['mrr', 'arr', 'gmv', 'cac', 'ltv', 'ebitda', 'arpu', 'cpa', 'roi', 'irr', 'noi', 'capex', 'opex'];
  const lower = s.toLowerCase();
  if (upperList.includes(lower)) return lower.toUpperCase();
  // капитализируем первое слово
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const FINANCE_KEYS = new Set([
  'revenue', 'profit', 'netprofit', 'net_profit', 'margin', 'margin_percent',
  'cost', 'costs', 'capex', 'opex', 'payback', 'valuation', 'investorreturn',
  'investor_return', 'investorReturn',
  'ebitda', 'cashflow', 'cash_flow', 'arpu', 'mrr', 'arr', 'gmv', 'cac', 'ltv',
  'выручка', 'прибыль', 'оценка', 'окупаемость', 'себестоимость', 'юнит_экономика',
  'unit_economics', 'unitEconomics',
  'doxod', 'доход', 'rentab', 'рентабельность', 'roi', 'irr',
  'minCheck', 'min_check', 'минимальный_чек',
  'investmentReturn', 'investment_return',
]);

function isFinanceKey(rawKey: string): boolean {
  const k = rawKey.toLowerCase();
  if (FINANCE_KEYS.has(rawKey) || FINANCE_KEYS.has(k)) return true;
  // Heuristic: ключ содержит подстроки, типичные для финансовых полей.
  return /(revenue|profit|margin|cost|capex|opex|payback|valuation|return|выручк|прибыл|оценк|окупаем|себестоим|маржа|cac|ltv|mrr|arr|gmv|ebitda|cashflow|arpu)/i
    .test(k);
}
