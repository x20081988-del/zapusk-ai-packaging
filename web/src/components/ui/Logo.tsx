import clsx from 'clsx';

// ZAPUSK wordmark. The mark is rendered as a CSS mask of the
// SVG so it inherits `text-primary` automatically — black on light, white on
// dark, without swapping assets or touching the file at runtime.
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <div
        className={clsx(
          'logo-mark text-primary shrink-0',
          compact ? 'w-7 h-7' : 'w-9 h-9',
        )}
        aria-hidden
      />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[14px] font-bold tracking-tight text-primary">
            Платформа <span className="font-extrabold">ZAPUSK AI</span>
          </div>
        </div>
      )}
      <span className="sr-only">Платформа ZAPUSK AI</span>
    </div>
  );
}
