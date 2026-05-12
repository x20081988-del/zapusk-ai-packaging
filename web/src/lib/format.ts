export function formatMoney(n: number | null | undefined, currency = 'RUB'): string {
  if (n == null) return '—';
  const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return `${n.toLocaleString('ru-RU')} ${sym}`;
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n}%`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseObj<T = Record<string, unknown>>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const PROMPT_KIND_LABELS: Record<string, { title: string; subtitle: string; accent: 'ai' | 'zapusk' }> = {
  investment_summary: { title: 'Краткое резюме для инвестора', subtitle: 'Описание сделки и доходности', accent: 'zapusk' },
  one_pager:          { title: 'One-pager',          subtitle: 'Страница со сделкой и цифрами',  accent: 'zapusk' },
  pitch_structure:    { title: 'Инвестиционная презентация', subtitle: 'Структура презентации',          accent: 'zapusk' },
  lovable_landing:    { title: 'Landing Page',    subtitle: 'Задание для инвестиционной посадочной страницы', accent: 'ai' },
  lovable_pitch:      { title: 'Веб-презентация для инвестора', subtitle: 'Задание для интерактивной презентации', accent: 'ai' },
  cloud_design:       { title: 'PDF-презентация',   subtitle: 'Задание для PDF-презентации',     accent: 'ai' },
  financial:          { title: 'Финансовая модель',    subtitle: 'Задание для финансовой модели', accent: 'ai' },
  calculator_spec:    { title: 'Инвестиционный калькулятор', subtitle: 'Спецификация калькулятора', accent: 'zapusk' },
  investor_faq:       { title: 'FAQ инвестора',       subtitle: 'Ответы на частые вопросы',       accent: 'zapusk' },
  sales_gpt:          { title: 'Материал для встречи с инвестором', subtitle: 'Задание для подготовки встречи',         accent: 'ai' },
};

export const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  mvp: 'MVP',
  early_revenue: 'Ранняя выручка',
  scaling: 'Масштабирование',
  growth: 'Рост',
};

export const INVESTOR_TYPE_LABELS: Record<string, string> = {
  private: 'Частный инвестор',
  fund: 'Фонд',
  strategic: 'Стратег',
  grant: 'Грант',
};
