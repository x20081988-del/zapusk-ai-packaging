const REPLACEMENTS: Array<[RegExp, string]> = [
  [/Создай в Lovable\s+/gi, 'Создай '],
  [/Готов к копированию в Lovable/gi, 'Готов к передаче команде'],
  [/PDF через Canva/gi, 'PDF'],
  [/\(pitch deck\)/gi, '(формат презентации)'],
  [/pitch-deck/gi, 'инвестиционной презентации'],
  [/Sales GPT/gi, 'материал для встречи с инвестором'],
  [/Lovable/gi, 'инструмент для посадочной страницы'],
  [/Cloud\s*Design/gi, 'сервис подготовки PDF-презентации'],
  [/Canva/gi, 'редактор презентаций'],
  [/Claude\/GPT/gi, 'модель подготовки материалов'],
  [/Claude/gi, 'модель подготовки материалов'],
  [/\bGPT\b/gi, 'помощник для подготовки материалов'],
  [/Pitch Deck Structure/gi, 'Структура инвестиционной презентации'],
  [/pitch deck/gi, 'инвестиционная презентация'],
  [/Financial Model/gi, 'Финансовая модель'],
  [/Investor Calculator/gi, 'Инвестиционный калькулятор'],
  [/Investment Summary/gi, 'Краткое резюме для инвестора'],
  [/Investor FAQ/gi, 'Ответы на вопросы инвестора'],
  [/\bOne[-\s]pager\b/gi, 'Одностраничник'],
  [/Pitch Deck Website/gi, 'Веб-презентация для инвестора'],
  [/Calculator Spec/gi, 'Спецификация калькулятора'],
  [/\bmarkdown\b/gi, 'текстовый файл'],
  [/FEEDBACK/gi, 'КОММЕНТАРИЙ'],
  [/Prompt/gi, 'Задание'],
  [/промптов/gi, 'заданий'],
  [/промпта/gi, 'задания'],
  [/промптом/gi, 'заданием'],
  [/промпте/gi, 'задании'],
  [/промпты/gi, 'задания'],
  [/промпт/gi, 'задание'],
];

export function sanitizePublicText(text: string | null | undefined): string {
  if (!text) return '';
  return REPLACEMENTS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}
