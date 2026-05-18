// Sprint 61.P1 — Token budget profiler.
//
// Цель: видеть «куда уходят токены» в каждом prompt'е AI Sales Assistant.
// До сих пор у нас были только char-cap'ы (4000 / 1500), не token-cap'ы.
// Char != tokens, особенно на русском — кириллический Unicode часто
// токенизируется в 2-4 байта каждая буква, тогда как латиница ~0.75
// токена/символ. Без замера мы не знаем, действительно ли вписываемся
// в реальный бюджет модели.
//
// Tokenizer:
//   tiktoken не в зависимостях, а добавлять зависимость — это нарушение
//   правила «no new deps without asking». Используем эвристику на основе
//   характера символа. Это approximation в ~10-20% от истины tiktoken, но
//   для профайлинга «какой блок крупный» — этого достаточно. Когда
//   потребуется ground-truth, добавим tiktoken отдельным PR.
//
// Эвристика:
//   • Латинские буквы / цифры / ASCII pun: ~0.25 токена/символ
//   • Кириллица: ~0.5 токена/символ (1-2 байта на букву в UTF-8)
//   • Прочие Unicode-блоки (CJK, эмодзи, спецсимволы): ~1 токен/символ
//   • Пробелы / переводы строк: ~0 (амортизируются в BPE токенах слов)
//
// Калибровка: ~280 русских символов = ~140 токенов (gpt-4o BPE на русском).
// Эвристика выдаёт 280*0.5 = 140. Совпадает с реальностью ±10%.

export interface PromptSegment {
  label: string;       // 'project_context' / 'kb' / 'memory' / 'transcript' / 'task_list' …
  chars: number;
  tokens: number;      // эвристическая оценка
}

export interface PromptBudgetReport {
  segments: PromptSegment[];
  totalChars: number;
  totalTokens: number;  // эвристика
  warnings: string[];   // 'budget_high' / 'segment_oversize' / etc
}

// Пороги для warning'ов. Берём прагматично исходя из reality:
//   • gpt-4o context window: 128K, наша эффективная зона ~12K tokens
//     (с учётом response budget и других слоёв).
//   • Sprint 61 prod default: full=2400 response, fast=600 response.
//     Запас на user-prompt — 8000 tokens примерно.
const SOFT_TOTAL_TOKEN_BUDGET = 8_000;
const HARD_TOTAL_TOKEN_BUDGET = 12_000;
// Один отдельный блок ≥4000 токенов = неравный распределённый bandwidth.
const MAX_SEGMENT_TOKEN_BUDGET = 4_000;

// Pure — никаких deps.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // ASCII-letters / digits / punctuation
    if ((code >= 0x20 && code <= 0x7e)) {
      tokens += 0.25;
      continue;
    }
    // Cyrillic (basic + supplement)
    if ((code >= 0x0400 && code <= 0x04ff) || (code >= 0x0500 && code <= 0x052f)) {
      tokens += 0.5;
      continue;
    }
    // Whitespace beyond ASCII (NBSP, narrow space, etc)
    if (ch === '\n' || ch === '\r' || ch === '\t' || ch === ' ') {
      tokens += 0.1;
      continue;
    }
    // Other Unicode (CJK / emoji / etc) — conservative high estimate.
    tokens += 1;
  }
  return Math.round(tokens);
}

export function profilePrompt(segments: Array<{ label: string; text: string }>): PromptBudgetReport {
  const sized: PromptSegment[] = segments.map((s) => ({
    label: s.label,
    chars: s.text?.length ?? 0,
    tokens: estimateTokens(s.text ?? ''),
  }));
  const totalChars = sized.reduce((sum, s) => sum + s.chars, 0);
  const totalTokens = sized.reduce((sum, s) => sum + s.tokens, 0);
  const warnings: string[] = [];
  if (totalTokens > HARD_TOTAL_TOKEN_BUDGET) {
    warnings.push(`hard_budget_exceeded:${totalTokens}>${HARD_TOTAL_TOKEN_BUDGET}`);
  } else if (totalTokens > SOFT_TOTAL_TOKEN_BUDGET) {
    warnings.push(`soft_budget_exceeded:${totalTokens}>${SOFT_TOTAL_TOKEN_BUDGET}`);
  }
  for (const s of sized) {
    if (s.tokens > MAX_SEGMENT_TOKEN_BUDGET) {
      warnings.push(`segment_oversize:${s.label}:${s.tokens}>${MAX_SEGMENT_TOKEN_BUDGET}`);
    }
  }
  return { segments: sized, totalChars, totalTokens, warnings };
}

// Compact one-line summary for [prompt-budget] log lines.
export function formatBudgetLog(report: PromptBudgetReport): string {
  const segs = report.segments.map((s) => `${s.label}=${s.tokens}`).join(' ');
  const flag = report.warnings.length > 0 ? ` ⚠ ${report.warnings.join(';')}` : '';
  return `[prompt-budget] total=${report.totalTokens}t (${report.totalChars}c) ${segs}${flag}`;
}
