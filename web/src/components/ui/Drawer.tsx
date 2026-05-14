import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

// Sprint 33 — Drawer primitive. Slide-in panel справа для history / details /
// secondary navigation. Похож на Modal по lifecycle (Escape, body-scroll-lock,
// portal), но рендерится как side-sheet, не как центральная модалка.

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}

export function Drawer({ open, onClose, title, subtitle, children, width = 'max-w-xl', footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-canvas/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative flex h-full w-full flex-col overflow-hidden border-l border-line bg-elevated shadow-lifted',
          'animate-in slide-in-from-right duration-200',
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 border-b border-hairline">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-base font-semibold text-primary truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <footer className="shrink-0 px-5 py-3 border-t border-hairline bg-canvas/50">{footer}</footer>}
      </aside>
    </div>
  );

  return createPortal(overlay, document.body);
}
