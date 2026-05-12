import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
  accent?: 'zapusk' | 'ai' | null;
}

export function Card({ padded = true, hoverable, accent = null, className, children, ...rest }: Props) {
  return (
    <div
      className={clsx(
        'relative bg-surface border border-line rounded-lg shadow-card overflow-hidden',
        padded && 'p-5',
        hoverable && 'transition-all duration-150 hover:border-zapusk/40 hover:shadow-lifted hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      {...rest}
    >
      {accent && (
        <div
          className={clsx(
            'absolute inset-x-0 top-0 h-px',
            accent === 'zapusk' ? 'bg-grad-zapusk' : 'bg-grad-ai',
          )}
        />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-primary tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
