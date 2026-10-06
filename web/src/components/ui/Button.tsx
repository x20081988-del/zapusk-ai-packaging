import clsx from 'clsx';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Design pass 06.10.2026: one strong action per row. Primary and AI are flat brand
// fills (no gradient, no glow): the glow made every CTA shout and a row of three
// CTAs on the assistant screen read as a traffic light. Destructive actions get
// a quiet ghost ("danger-ghost") so they never compete with "Да".
type Variant = 'primary' | 'secondary' | 'ghost' | 'ai' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-zapusk text-white font-semibold shadow-soft hover:bg-zapusk-600 active:bg-zapusk-700',
  secondary:
    'bg-surface text-primary border border-line shadow-soft hover:bg-hairline',
  ghost:
    'bg-transparent text-secondary hover:text-primary hover:bg-hairline',
  ai:
    'bg-ai text-white font-semibold shadow-soft hover:bg-ai-dim',
  danger:
    'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
  'danger-ghost':
    'bg-transparent text-danger hover:bg-danger/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm rounded-md gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-lg gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', iconLeft, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 ease-smooth select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );
}
