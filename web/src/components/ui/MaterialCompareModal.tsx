import { useMemo } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeftRight, Plus, Minus } from 'lucide-react';
import { diffLines, diffStats } from '../../lib/diff';

// Sprint 33 — fullscreen split compare. Левая колонка — старая версия,
// правая — новая (или текущая). Подсветка:
//   зелёный — added
//   красный — removed
//   нейтральный — equal
//
// Без npm-зависимостей: используем собственный LCS-diff из lib/diff.

interface Props {
  open: boolean;
  onClose: () => void;
  /** Заголовок (например "Pitch deck · v3 ↔ v5"). */
  title: string;
  /** Подзаголовок — что значит "left" / "right". */
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
}

export function MaterialCompareModal({
  open, onClose, title, leftLabel, rightLabel, leftContent, rightContent,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const diff = useMemo(() => diffLines(leftContent ?? '', rightContent ?? ''), [leftContent, rightContent]);
  const stats = useMemo(() => diffStats(diff), [diff]);

  if (!open) return null;

  // Подсчитываем номера строк для каждой колонки. Empty placeholder для
  // строк, которых нет в той версии (чтобы строки выравнивались side-by-side).
  type Row = { leftText: string | null; leftLine: number | null; rightText: string | null; rightLine: number | null; op: 'equal' | 'add' | 'remove' };
  const rows: Row[] = [];
  for (const d of diff) {
    if (d.op === 'equal') {
      rows.push({ leftText: d.text, leftLine: (d.oldIndex ?? 0) + 1, rightText: d.text, rightLine: (d.newIndex ?? 0) + 1, op: 'equal' });
    } else if (d.op === 'remove') {
      rows.push({ leftText: d.text, leftLine: (d.oldIndex ?? 0) + 1, rightText: null, rightLine: null, op: 'remove' });
    } else {
      rows.push({ leftText: null, leftLine: null, rightText: d.text, rightLine: (d.newIndex ?? 0) + 1, op: 'add' });
    }
  }

  const view = (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-canvas">
      <header className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-hairline bg-elevated">
        <div className="flex items-center gap-3 min-w-0">
          <ArrowLeftRight size={16} className="text-zapusk-400 shrink-0" />
          <h2 className="text-base font-semibold text-primary truncate">{title}</h2>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/25 px-2 py-0.5">
              <Plus size={11} /> {stats.added}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 text-danger border border-danger/25 px-2 py-0.5">
              <Minus size={11} /> {stats.removed}
            </span>
            <span className="text-muted">· {stats.unchanged} без изменений</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="w-9 h-9 rounded-md inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface transition-colors"
        >
          <X size={18} />
        </button>
      </header>

      <div className="shrink-0 grid grid-cols-2 border-b border-hairline bg-canvas/50">
        <div className="px-4 py-2 border-r border-hairline">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">Было</div>
          <div className="text-xs text-secondary truncate">{leftLabel}</div>
        </div>
        <div className="px-4 py-2">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">Стало</div>
          <div className="text-xs text-secondary truncate">{rightLabel}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-relaxed">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-muted py-12">Версии идентичны.</div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((r, idx) => {
                const leftCls =
                  r.op === 'remove' ? 'bg-danger/8 text-primary'
                  : r.op === 'equal' ? 'text-secondary'
                  : 'bg-surface/30 text-faint';
                const rightCls =
                  r.op === 'add' ? 'bg-success/8 text-primary'
                  : r.op === 'equal' ? 'text-secondary'
                  : 'bg-surface/30 text-faint';
                return (
                  <tr key={idx} className="border-b border-hairline/40">
                    <td className="align-top w-12 px-2 py-1 text-right text-muted text-[10px] select-none border-r border-hairline">
                      {r.leftLine ?? ''}
                    </td>
                    <td className={`align-top px-3 py-1 whitespace-pre-wrap break-words border-r border-hairline ${leftCls}`}>
                      {r.op === 'remove' && <span className="text-danger mr-1">−</span>}
                      {r.leftText ?? ' '}
                    </td>
                    <td className="align-top w-12 px-2 py-1 text-right text-muted text-[10px] select-none border-r border-hairline">
                      {r.rightLine ?? ''}
                    </td>
                    <td className={`align-top px-3 py-1 whitespace-pre-wrap break-words ${rightCls}`}>
                      {r.op === 'add' && <span className="text-success mr-1">+</span>}
                      {r.rightText ?? ' '}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return createPortal(view, document.body);
}
