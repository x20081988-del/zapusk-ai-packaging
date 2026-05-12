export function formatMoney(n, currency = 'RUB') {
    if (n == null)
        return '—';
    const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
    return `${n.toLocaleString('ru-RU')} ${sym}`;
}
export function formatPercent(n) {
    if (n == null)
        return '—';
    return `${n}%`;
}
export function formatDate(d) {
    if (!d)
        return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function parseList(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
export function parseObj(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export const PROMPT_KIND_LABELS = {
    investment_summary: { title: 'Краткое резюме для инвестора', subtitle: 'Описание сделки и доходности', accent: 'zapusk' },
    one_pager: { title: 'One-pager', subtitle: 'Страница со сделкой и цифрами', accent: 'zapusk' },
    pitch_structure: { title: 'Инвестиционная презентация', subtitle: 'Структура презентации', accent: 'zapusk' },
    lovable_landing: { title: 'Landing Page', subtitle: 'Задание для инвестиционной посадочной страницы', accent: 'ai' },
    lovable_pitch: { title: 'Веб-презентация для инвестора', subtitle: 'Задание для интерактивной презентации', accent: 'ai' },
    cloud_design: { title: 'PDF-презентация', subtitle: 'Задание для PDF-презентации', accent: 'ai' },
    financial: { title: 'Финансовая модель', subtitle: 'Задание для финансовой модели', accent: 'ai' },
    calculator_spec: { title: 'Инвестиционный калькулятор', subtitle: 'Спецификация калькулятора', accent: 'zapusk' },
    investor_faq: { title: 'FAQ инвестора', subtitle: 'Ответы на частые вопросы', accent: 'zapusk' },
    sales_gpt: { title: 'Материал для встречи с инвестором', subtitle: 'Задание для подготовки встречи', accent: 'ai' },
};
export const STAGE_LABELS = {
    idea: 'Идея',
    mvp: 'MVP',
    early_revenue: 'Ранняя выручка',
    scaling: 'Масштабирование',
    growth: 'Рост',
};
export const INVESTOR_TYPE_LABELS = {
    private: 'Частный инвестор',
    fund: 'Фонд',
    strategic: 'Стратег',
    grant: 'Грант',
};
