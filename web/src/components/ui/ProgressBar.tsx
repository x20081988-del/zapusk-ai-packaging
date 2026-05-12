import clsx from 'clsx';

interface Props {
  value: number; // 0–100
  size?: 'sm' | 'md';
  accent?: 'zapusk' | 'ai';
  showLabel?: boolean;
}

export function ProgressBar({ value, size = 'md', accent = 'zapusk', showLabel }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx('w-full', showLabel && 'space-y-1.5')}>
      {showLabel && (
        <div className="flex justify-between text-[11px] font-medium text-muted">
          <span>Готовность материалов</span>
          <span className="text-primary font-num">{clamped}%</span>
        </div>
      )}
      <div
        className={clsx(
          'w-full bg-hairline rounded-full overflow-hidden',
          size === 'sm' ? 'h-1' : 'h-1.5',
        )}
      >
        <div
          className={clsx(
            'h-full transition-all duration-500 ease-smooth rounded-full',
            accent === 'zapusk' ? 'bg-grad-zapusk' : 'bg-grad-ai',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
