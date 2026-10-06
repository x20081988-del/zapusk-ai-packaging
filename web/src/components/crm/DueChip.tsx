import clsx from 'clsx';

// Срок как компактный чип (design pass 06.10.2026). Раньше каждая просрочка была
// красной строкой «просрочен на 40 дней» во всю ширину, и экран из пятнадцати
// таких строк читался как сплошная тревога без приоритета. Цвет теперь несет
// только сам факт срока, текст задачи остается обычным.

export type HeatState = 'over' | 'today' | 'soon' | 'ok' | 'none' | string;

const TONE: Record<string, string> = {
  over: 'bg-danger/10 text-danger',
  today: 'bg-warning/10 text-warning',
  soon: 'bg-warning/10 text-warning',
  ok: 'bg-success/10 text-success',
  none: 'bg-hairline text-muted',
};

/** «просрочен на 40 дней» -> «40 дн. просрочки», «через 3 дня» -> «через 3 дн.». */
export function shortDue(label: string | null | undefined): string {
  const s = (label ?? '').trim();
  if (!s) return '';
  let m = /^просрочен[ао]? на (\d+) (день|дня|дней)$/i.exec(s);
  if (m) return `${m[1]} дн. просрочки`;
  m = /^через (\d+) (день|дня|дней)$/i.exec(s);
  if (m) return `через ${m[1]} дн.`;
  return s;
}

export function DueChip({ state, label, className }: { state: HeatState; label: string | null | undefined; className?: string }) {
  const text = shortDue(label);
  if (!text) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium font-num whitespace-nowrap leading-none',
        TONE[state] ?? TONE.none,
        className,
      )}
    >
      {text}
    </span>
  );
}
