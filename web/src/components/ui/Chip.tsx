import clsx from 'clsx';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

// Two small controls that used to be re-implemented on every CRM screen with
// slightly different paddings and colours (design pass 06.10.2026).
//
// ChoiceChip  - a pill in a row of choices (section links, period picker).
//               Active = filled with the text colour, like a selected filter.
// SegmentedTabs - a recessed track with one raised segment; replaces the
//               full-width outlined buttons that looked like three CTAs.

export function ChoiceChip({
  active,
  to,
  onClick,
  count,
  size = 'md',
  children,
}: {
  active?: boolean;
  to?: string;
  onClick?: () => void;
  count?: number;
  size?: 'sm' | 'md';
  children: ReactNode;
}) {
  const cls = clsx(
    'inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap select-none shrink-0 transition-colors',
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
    active
      ? 'bg-primary text-canvas border-primary'
      : 'bg-surface text-secondary border-line hover:text-primary hover:bg-hairline',
  );
  const inner = (
    <>
      {children}
      {typeof count === 'number' && (
        <span className={clsx('font-num text-xs', active ? 'opacity-70' : 'text-muted')}>{count}</span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-current={active ? 'page' : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {inner}
    </button>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div role="tablist" className="flex w-full sm:inline-flex sm:w-auto rounded-lg bg-track p-1 gap-1">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={clsx(
              'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] whitespace-nowrap transition-colors',
              active ? 'bg-thumb text-primary font-medium shadow-soft' : 'text-secondary hover:text-primary',
            )}
          >
            {it.label}
            {typeof it.count === 'number' && (
              <span className={clsx('font-num text-xs', active ? 'text-muted' : 'text-faint')}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
