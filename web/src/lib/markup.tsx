import type { ReactNode } from 'react';

// Sprint 63.P6 - минимальный рендер разметки в карточках решений.
//
// Зачем НЕ библиотека markdown. Тела карточек приходят из разных генераторов
// telegram-agent, и разметка там ровно одна: `**жирное**`, потому что посты
// верстаются под Telegram. Полноценный парсер притащил бы зависимость, санитайзер и
// поведение, которого никто не просил (таблицы, ссылки, картинки в очереди решений
// не нужны и опасны - тексты приходят из внешних источников).
//
// Живая причина: в карточке «Пост в канал» владелец видел `**SPV**` сырыми. Пока
// пост приходил еще и в бота, он читал его там сверстанным; после выключения
// дублирующего пуша экран остался единственным местом, и сырые звездочки стали бы
// регрессией.

const BOLD = /\*\*(.+?)\*\*/g;

/**
 * Текст с `**жирным**` в набор узлов React.
 *
 * Ничего не исполняет и не парсит HTML: строка остается строкой, меняется только то,
 * как она разбита на куски. Внешний текст не может протащить сюда разметку.
 */
export function renderInlineMarkup(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  BOLD.lastIndex = 0;
  while ((m = BOLD.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <strong key={`b${m.index}`} className="font-semibold text-primary">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}
