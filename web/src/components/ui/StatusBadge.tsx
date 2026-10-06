import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'zapusk' | 'ai' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-hairline text-secondary border-line',
  zapusk:  'bg-zapusk/10 text-zapusk-400 border-zapusk/25',
  ai:      'bg-ai/10 text-ai border-ai/25',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger:  'bg-danger/10 text-danger border-danger/25',
  info:    'bg-info/10 text-info border-info/25',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-muted',
  zapusk: 'bg-zapusk',
  ai: 'bg-ai',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

// Sentence case on purpose (design pass 06.10.2026): uppercase Cyrillic with wide
// tracking («ВЛАДЕЛЕЦ ПЛАТФОРМЫ», «ИСПОЛЬЗОВАНО») is slow to read and shouts.
export function StatusBadge({ children, tone = 'neutral', dot }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full border text-[11.5px] font-medium leading-none whitespace-nowrap',
        TONES[tone],
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}
